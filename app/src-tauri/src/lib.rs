use chrono::{NaiveDate, TimeZone, Utc};
use rusqlite::{params, Connection, OptionalExtension};
use serde::{Deserialize, Serialize};
use std::collections::{HashMap, HashSet};
use std::fs;
use std::path::PathBuf;
use tauri::{AppHandle, Manager};

#[derive(Serialize, Deserialize, Debug)]
struct YahooQuote {
    symbol: String,
    #[serde(rename = "regularMarketPrice")]
    price: f64,
    #[serde(rename = "regularMarketChangePercent")]
    change_percent: f64,
    currency: Option<String>,
}

#[derive(Serialize, Deserialize, Debug)]
struct YahooChartMeta {
    symbol: String,
    #[serde(rename = "regularMarketPrice")]
    regular_market_price: Option<f64>,
    #[serde(rename = "chartPreviousClose")]
    chart_previous_close: Option<f64>,
    #[serde(rename = "previousClose")]
    previous_close: Option<f64>,
    currency: Option<String>,
}

#[derive(Serialize, Deserialize, Debug)]
struct YahooChartQuote {
    close: Option<Vec<Option<f64>>>,
}

#[derive(Serialize, Deserialize, Debug)]
struct YahooChartIndicators {
    quote: Option<Vec<YahooChartQuote>>,
}

#[derive(Serialize, Deserialize, Debug)]
struct YahooChartResult {
    meta: YahooChartMeta,
    timestamp: Option<Vec<i64>>,
    indicators: Option<YahooChartIndicators>,
}

#[derive(Serialize, Deserialize, Debug)]
struct YahooChartBody {
    result: Option<Vec<YahooChartResult>>,
}

#[derive(Serialize, Deserialize, Debug)]
struct YahooChartResponse {
    chart: YahooChartBody,
}

#[derive(Serialize, Deserialize, Debug)]
struct YahooSearchQuote {
    symbol: String,
    shortname: Option<String>,
    longname: Option<String>,
    exchange: Option<String>,
    #[serde(rename = "typeDisp")]
    type_disp: Option<String>,
    currency: Option<String>,
}

#[derive(Serialize, Deserialize, Debug)]
struct YahooSearchResponse {
    quotes: Vec<YahooSearchQuote>,
}

#[derive(Serialize, Deserialize, Debug, Clone)]
struct Account {
    id: i32,
    name: String,
    balance: f64,
    currency: Option<String>,
    #[serde(default = "default_exchange_rate")]
    exchange_rate: f64,
}

fn default_exchange_rate() -> f64 {
    1.0
}

#[derive(Clone, Serialize, Deserialize, Debug)]
struct Transaction {
    id: i32,
    account_id: i32,
    date: String,
    payee: String,
    notes: Option<String>,
    category: Option<String>,
    amount: f64,
    ticker: Option<String>,
    shares: Option<f64>,
    price_per_share: Option<f64>,
    fee: Option<f64>,
    currency: Option<String>,
}

#[derive(Debug)]
struct AccountsSummary {
    accounts: Vec<Account>,
    raw_data: Vec<(i32, String, f64)>,
}

#[derive(Serialize, Deserialize, Debug, Default)]
struct AppSettings {
    db_path: Option<String>,
}

fn settings_file_path(app_handle: &AppHandle) -> Result<PathBuf, String> {
    let app_dir = app_handle
        .path()
        .app_data_dir()
        .map_err(|e| e.to_string())?;
    if !app_dir.exists() {
        fs::create_dir_all(&app_dir).map_err(|e| e.to_string())?;
    }
    Ok(app_dir.join("settings.json"))
}

fn read_settings(app_handle: &AppHandle) -> Result<AppSettings, String> {
    let settings_path = settings_file_path(app_handle)?;
    if settings_path.exists() {
        let contents = fs::read_to_string(&settings_path).map_err(|e| e.to_string())?;
        let s: AppSettings = serde_json::from_str(&contents).map_err(|e| e.to_string())?;
        Ok(s)
    } else {
        Ok(AppSettings::default())
    }
}

fn write_settings(app_handle: &AppHandle, settings: &AppSettings) -> Result<(), String> {
    let settings_path = settings_file_path(app_handle)?;
    let json = serde_json::to_string_pretty(settings).map_err(|e| e.to_string())?;
    fs::write(&settings_path, json).map_err(|e| e.to_string())?;
    Ok(())
}

// Test-only helpers to allow testing settings and init_db logic without an AppHandle
#[cfg(test)]
mod test_helpers;

#[cfg(test)]
pub(crate) use test_helpers::{
    create_account_in_dir, create_transaction_in_dir, get_db_path_for_dir, init_db_at_path,
    read_settings_from_dir, write_settings_to_dir,
};

fn get_db_path(app_handle: &AppHandle) -> Result<PathBuf, String> {
    // If the user has configured an override, use it
    if let Ok(settings) = read_settings(app_handle) {
        if let Some(ref p) = settings.db_path {
            let pb = PathBuf::from(p);
            // Ensure parent dir exists
            if let Some(parent) = pb.parent() {
                if !parent.exists() {
                    fs::create_dir_all(parent).map_err(|e| e.to_string())?;
                }
            }
            return Ok(pb);
        }
    }

    let app_dir = app_handle
        .path()
        .app_data_dir()
        .map_err(|e| e.to_string())?;
    if !app_dir.exists() {
        fs::create_dir_all(&app_dir).map_err(|e| e.to_string())?;
    }
    Ok(app_dir.join("honeybear.db"))
}

fn init_db(app_handle: &AppHandle) -> Result<(), String> {
    let db_path = get_db_path(app_handle)?;
    let conn = Connection::open(db_path).map_err(|e| e.to_string())?;

    conn.execute(
        "CREATE TABLE IF NOT EXISTS accounts (
            id INTEGER PRIMARY KEY,
            name TEXT NOT NULL,
            balance REAL NOT NULL,
            kind TEXT DEFAULT 'cash'
        )",
        [],
    )
    .map_err(|e| e.to_string())?;

    conn.execute(
        "CREATE TABLE IF NOT EXISTS transactions (
            id INTEGER PRIMARY KEY,
            account_id INTEGER NOT NULL,
            date TEXT NOT NULL,
            payee TEXT NOT NULL,
            notes TEXT,
            category TEXT,
            amount REAL NOT NULL,
            ticker TEXT,
            shares REAL,
            price_per_share REAL,
            fee REAL,
            FOREIGN KEY(account_id) REFERENCES accounts(id)
        )",
        [],
    )
    .map_err(|e| e.to_string())?;

    // Ensure we have a column to link transfer pairs so updates/deletes can keep both sides in sync
    {
        let mut stmt = conn
            .prepare("PRAGMA table_info(transactions)")
            .map_err(|e| e.to_string())?;
        let mut has_linked = false;
        let col_iter = stmt
            .query_map([], |row| row.get::<_, String>(1))
            .map_err(|e| e.to_string())?;
        for name in col_iter.flatten() {
            if name == "linked_tx_id" {
                has_linked = true;
                break;
            }
        }
        if !has_linked {
            // Safe to ALTER TABLE to add the nullable column. Concurrent runs may attempt this simultaneously; ignore duplicate-column errors.
            match conn.execute(
                "ALTER TABLE transactions ADD COLUMN linked_tx_id INTEGER",
                [],
            ) {
                Ok(_) => {}
                Err(e) => {
                    let s = e.to_string();
                    if !s.contains("duplicate column name") && !s.contains("already exists") {
                        return Err(s);
                    }
                }
            }
        }
    }

    // Ensure we have a column for currency (multi-currency support)
    {
        let mut stmt = conn
            .prepare("PRAGMA table_info(transactions)")
            .map_err(|e| e.to_string())?;
        let mut has_currency = false;
        let col_iter = stmt
            .query_map([], |row| row.get::<_, String>(1))
            .map_err(|e| e.to_string())?;
        for name in col_iter.flatten() {
            if name == "currency" {
                has_currency = true;
                break;
            }
        }
        if !has_currency {
            match conn.execute("ALTER TABLE transactions ADD COLUMN currency TEXT", []) {
                Ok(_) => {}
                Err(e) => {
                    let s = e.to_string();
                    if !s.contains("duplicate column name") && !s.contains("already exists") {
                        return Err(s);
                    }
                }
            }
        }
    }

    // Ensure we have a column for currency in accounts
    {
        let mut stmt = conn
            .prepare("PRAGMA table_info(accounts)")
            .map_err(|e| e.to_string())?;
        let mut has_currency = false;
        let col_iter = stmt
            .query_map([], |row| row.get::<_, String>(1))
            .map_err(|e| e.to_string())?;
        for name in col_iter.flatten() {
            if name == "currency" {
                has_currency = true;
                break;
            }
        }
        if !has_currency {
            match conn.execute("ALTER TABLE accounts ADD COLUMN currency TEXT", []) {
                Ok(_) => {}
                Err(e) => {
                    let s = e.to_string();
                    if !s.contains("duplicate column name") && !s.contains("already exists") {
                        return Err(s);
                    }
                }
            }
        }
    }

    conn.execute(
        "CREATE TABLE IF NOT EXISTS stock_prices (
            ticker TEXT PRIMARY KEY,
            price REAL NOT NULL,
            last_updated TEXT NOT NULL
        )",
        [],
    )
    .map_err(|e| e.to_string())?;

    conn.execute(
        "CREATE TABLE IF NOT EXISTS daily_stock_prices (
            ticker TEXT NOT NULL,
            date TEXT NOT NULL,
            price REAL NOT NULL,
            PRIMARY KEY (ticker, date)
        )",
        [],
    )
    .map_err(|e| e.to_string())?;

    Ok(())
}

#[tauri::command]
fn set_db_path(app_handle: AppHandle, path: String) -> Result<(), String> {
    let mut settings = read_settings(&app_handle)?;
    settings.db_path = Some(path.clone());
    write_settings(&app_handle, &settings)?;

    // Ensure any parent dir exists and initialize DB at new path
    let pb = PathBuf::from(path);
    if let Some(parent) = pb.parent() {
        if !parent.exists() {
            fs::create_dir_all(parent).map_err(|e| e.to_string())?;
        }
    }

    init_db(&app_handle)?;
    Ok(())
}

#[tauri::command]
fn reset_db_path(app_handle: AppHandle) -> Result<(), String> {
    let mut settings = read_settings(&app_handle)?;
    settings.db_path = None;
    write_settings(&app_handle, &settings)?;

    // Ensure default DB exists
    init_db(&app_handle)?;
    Ok(())
}

#[tauri::command]
fn get_db_path_command(app_handle: AppHandle) -> Result<String, String> {
    let pb = get_db_path(&app_handle)?;
    Ok(pb.to_string_lossy().to_string())
}

fn create_account_db(
    db_path: &PathBuf,
    name: String,
    balance: f64,
    currency: Option<String>,
) -> Result<Account, String> {
    let mut conn = Connection::open(db_path).map_err(|e| e.to_string())?;

    // Trim name and validate non-empty
    let name_trimmed = name.trim().to_string();
    if name_trimmed.is_empty() {
        return Err("Account name cannot be empty or whitespace-only".to_string());
    }

    // Check for duplicates (case-insensitive)
    {
        let mut stmt = conn
            .prepare("SELECT id FROM accounts WHERE LOWER(name) = LOWER(?1) LIMIT 1")
            .map_err(|e| e.to_string())?;
        let dup: Option<i32> = stmt
            .query_row(params![name_trimmed], |row| row.get(0))
            .optional()
            .map_err(|e| e.to_string())?;
        if dup.is_some() {
            return Err("Account name already exists".to_string());
        }
    }

    let tx = conn.transaction().map_err(|e| e.to_string())?;

    // For unified accounts, we use the provided balance
    let balance_to_set = balance;

    // We can omit 'kind' since it has a default value in schema, or set it to 'unified' if we want to be explicit.
    // relying on default 'cash' is fine or we can pass "unified".
    tx.execute(
        "INSERT INTO accounts (name, balance, currency) VALUES (?1, ?2, ?3)",
        params![name_trimmed, balance_to_set, currency],
    )
    .map_err(|e| e.to_string())?;

    let id = tx.last_insert_rowid() as i32;

    // Create opening transaction if balance is non-zero
    if balance.abs() > f64::EPSILON {
        // Create initial transaction
        tx.execute(
            "INSERT INTO transactions (account_id, date, payee, notes, category, amount, currency) VALUES (?1, date('now'), ?2, ?3, ?4, ?5, ?6)",
            params![
                id,
                "Opening Balance",
                "Initial Balance",
                "Income",
                balance_to_set,
                currency
            ],
        )
        .map_err(|e| e.to_string())?;
    }

    tx.commit().map_err(|e| e.to_string())?;

    Ok(Account {
        id,
        name: name_trimmed,
        balance: balance_to_set,
        currency,
        exchange_rate: 1.0,
    })
}

#[tauri::command]
fn create_account(
    app_handle: AppHandle,
    name: String,
    balance: f64,
    currency: Option<String>,
) -> Result<Account, String> {
    let db_path = get_db_path(&app_handle)?;
    create_account_db(&db_path, name, balance, currency)
}

fn rename_account_db(db_path: &PathBuf, id: i32, new_name: String) -> Result<Account, String> {
    let new_trim = new_name.trim().to_string();
    if new_trim.is_empty() {
        return Err("Account name cannot be empty or whitespace-only".to_string());
    }

    let conn = Connection::open(db_path).map_err(|e| e.to_string())?;

    // Check for duplicate name (case-insensitive) excluding this account id
    {
        let mut stmt_check = conn
            .prepare("SELECT id FROM accounts WHERE LOWER(name) = LOWER(?1) LIMIT 1")
            .map_err(|e| e.to_string())?;
        let dup: Option<i32> = stmt_check
            .query_row(params![new_trim], |row| row.get(0))
            .optional()
            .map_err(|e| e.to_string())?;
        if let Some(existing_id) = dup {
            if existing_id != id {
                return Err("Account name already exists".to_string());
            }
        }
    }

    conn.execute(
        "UPDATE accounts SET name = ?1 WHERE id = ?2",
        params![new_trim, id],
    )
    .map_err(|e| e.to_string())?;

    let mut stmt = conn
        .prepare("SELECT id, name, balance, currency FROM accounts WHERE id = ?1")
        .map_err(|e| e.to_string())?;

    let account = stmt
        .query_row(params![id], |row| {
            Ok(Account {
                id: row.get(0)?,
                name: row.get(1)?,
                balance: row.get(2)?,
                currency: row.get(3)?,
                exchange_rate: 1.0,
            })
        })
        .map_err(|e| e.to_string())?;

    Ok(account)
}

#[tauri::command]
fn rename_account(app_handle: AppHandle, id: i32, new_name: String) -> Result<Account, String> {
    let db_path = get_db_path(&app_handle)?;
    rename_account_db(&db_path, id, new_name)
}

fn update_account_db(
    db_path: &PathBuf,
    id: i32,
    name: String,
    currency: Option<String>,
) -> Result<Account, String> {
    let name_trimmed = name.trim().to_string();
    if name_trimmed.is_empty() {
        return Err("Account name cannot be empty or whitespace-only".to_string());
    }

    let conn = Connection::open(db_path).map_err(|e| e.to_string())?;

    // Check for duplicate name (case-insensitive) excluding this account id
    {
        let mut stmt_check = conn
            .prepare("SELECT id FROM accounts WHERE LOWER(name) = LOWER(?1) LIMIT 1")
            .map_err(|e| e.to_string())?;
        let dup: Option<i32> = stmt_check
            .query_row(params![name_trimmed], |row| row.get(0))
            .optional()
            .map_err(|e| e.to_string())?;
        if let Some(existing_id) = dup {
            if existing_id != id {
                return Err("Account name already exists".to_string());
            }
        }
    }

    conn.execute(
        "UPDATE accounts SET name = ?1, currency = ?2 WHERE id = ?3",
        params![name_trimmed, currency, id],
    )
    .map_err(|e| e.to_string())?;

    let mut stmt = conn
        .prepare("SELECT id, name, balance, currency FROM accounts WHERE id = ?1")
        .map_err(|e| e.to_string())?;

    let account = stmt
        .query_row(params![id], |row| {
            Ok(Account {
                id: row.get(0)?,
                name: row.get(1)?,
                balance: row.get(2)?,
                currency: row.get(3)?,
                exchange_rate: 1.0,
            })
        })
        .map_err(|e| e.to_string())?;

    Ok(account)
}

#[tauri::command]
fn update_account(
    app_handle: AppHandle,
    id: i32,
    name: String,
    currency: Option<String>,
) -> Result<Account, String> {
    let db_path = get_db_path(&app_handle)?;
    update_account_db(&db_path, id, name, currency)
}

fn delete_account_db(db_path: &PathBuf, id: i32) -> Result<(), String> {
    let mut conn = Connection::open(db_path).map_err(|e| e.to_string())?;

    let tx = conn.transaction().map_err(|e| e.to_string())?;

    // Delete all transactions for this account
    tx.execute(
        "DELETE FROM transactions WHERE account_id = ?1",
        params![id],
    )
    .map_err(|e| e.to_string())?;

    // Delete the account
    tx.execute("DELETE FROM accounts WHERE id = ?1", params![id])
        .map_err(|e| e.to_string())?;

    tx.commit().map_err(|e| e.to_string())?;

    Ok(())
}

#[tauri::command]
fn delete_account(app_handle: AppHandle, id: i32) -> Result<(), String> {
    let db_path = get_db_path(&app_handle)?;
    delete_account_db(&db_path, id)
}

fn get_accounts_db(db_path: &PathBuf) -> Result<Vec<Account>, String> {
    let conn = Connection::open(db_path).map_err(|e| e.to_string())?;

    let mut stmt = conn
        .prepare("SELECT id, name, balance, currency FROM accounts")
        .map_err(|e| e.to_string())?;
    let account_iter = stmt
        .query_map([], |row| {
            Ok(Account {
                id: row.get(0)?,
                name: row.get(1)?,
                balance: row.get(2)?,
                currency: row.get(3)?,
                exchange_rate: 1.0,
            })
        })
        .map_err(|e| e.to_string())?;

    let mut accounts = Vec::new();
    for account in account_iter {
        accounts.push(account.map_err(|e| e.to_string())?);
    }

    Ok(accounts)
}

fn get_accounts_summary_db(db_path: &PathBuf, target: &str) -> Result<AccountsSummary, String> {
    let accounts = get_accounts_db(db_path)?;
    let conn = Connection::open(db_path).map_err(|e| e.to_string())?;

    // Group transaction amounts by account and currency
    let mut stmt = conn
        .prepare("SELECT account_id, currency, SUM(amount) FROM transactions GROUP BY account_id, currency")
        .map_err(|e| e.to_string())?;

    let rows = stmt
        .query_map([], |row| {
            Ok((
                row.get::<_, i32>(0)?,
                row.get::<_, Option<String>>(1)?,
                row.get::<_, Option<f64>>(2)?,
            ))
        })
        .map_err(|e| e.to_string())?;

    let mut raw_data = Vec::new();

    for r in rows {
        let (acc_id, curr_opt, amt_opt) = r.map_err(|e| e.to_string())?;
        let amt = amt_opt.unwrap_or(0.0);
        let curr = curr_opt.unwrap_or_else(|| target.to_string());
        raw_data.push((acc_id, curr.clone(), amt));
    }

    Ok(AccountsSummary { accounts, raw_data })
}

// Triggering re-check
#[tauri::command]
async fn get_accounts(
    app_handle: AppHandle,
    target_currency: Option<String>,
) -> Result<Vec<Account>, String> {
    let db_path = get_db_path(&app_handle)?;
    let target = target_currency.unwrap_or_else(|| "USD".to_string());

    let db_path_clone = db_path.clone();
    let target_clone = target.clone();

    // Use spawn_blocking for DB operations
    let summary = tauri::async_runtime::spawn_blocking(move || {
        get_accounts_summary_db(&db_path_clone, &target_clone)
    })
    .await
    .map_err(|e| e.to_string())??;

    let mut accounts = summary.accounts;
    let raw_data = summary.raw_data;

    // Determine which rates we need to fetch
    // Each account might have a specific currency preference.
    // If set, we convert all its txs to that currency.
    // If not set, we convert to global target.

    let mut account_currency_map: HashMap<i32, String> = HashMap::new();
    for acc in &accounts {
        if let Some(c) = &acc.currency {
            account_currency_map.insert(acc.id, c.clone());
        }
    }

    let mut tickers_to_fetch = HashSet::new();

    for (acc_id, tx_curr, _) in &raw_data {
        let acc_currency = account_currency_map.get(acc_id).unwrap_or(&target);

        if tx_curr != acc_currency {
            // We need rate tx_curr -> acc_currency
            // Yahoo format: SOURCE + TARGET + =X
            tickers_to_fetch.insert(format!("{}{}=X", tx_curr, acc_currency));
        }
    }

    // Also fetch rates for account currencies to the target global currency
    for acc in &accounts {
        if let Some(acc_curr) = &acc.currency {
            if acc_curr != &target {
                tickers_to_fetch.insert(format!("{}{}=X", acc_curr, target));
            }
        }
    }

    let mut rates = HashMap::new();
    if !tickers_to_fetch.is_empty() {
        let tickers: Vec<String> = tickers_to_fetch.into_iter().collect();
        let client = reqwest::Client::builder()
            .build()
            .map_err(|e| e.to_string())?;

        let quotes = get_stock_quotes_with_client(
            client,
            "https://query1.finance.yahoo.com".to_string(),
            app_handle.clone(),
            tickers,
        )
        .await?;

        for q in quotes {
            rates.insert(q.symbol.clone(), q.price);
        }
    }

    let mut sums: HashMap<i32, f64> = HashMap::new();
    for (acc_id, tx_curr, amt) in raw_data {
        let acc_currency = account_currency_map.get(&acc_id).unwrap_or(&target);

        let val = if tx_curr == *acc_currency {
            amt
        } else {
            let symbol = format!("{}{}=X", tx_curr, acc_currency);
            let rate = *rates.get(&symbol).unwrap_or(&1.0);
            amt * rate
        };

        sums.entry(acc_id).and_modify(|e| *e += val).or_insert(val);
    }

    for acc in &mut accounts {
        if let Some(sum) = sums.get(&acc.id) {
            acc.balance = *sum;
        }

        // Set exchange rate to target app currency
        if let Some(acc_curr) = &acc.currency {
            if acc_curr == &target {
                acc.exchange_rate = 1.0;
            } else {
                let symbol = format!("{}{}=X", acc_curr, target);
                acc.exchange_rate = *rates.get(&symbol).unwrap_or(&1.0);
            }
        } else {
            acc.exchange_rate = 1.0;
        }
    }

    Ok(accounts)
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct CreateTransactionArgs {
    account_id: i32,
    date: String,
    payee: String,
    notes: Option<String>,
    category: Option<String>,
    amount: f64,
    ticker: Option<String>,
    shares: Option<f64>,
    price_per_share: Option<f64>,
    fee: Option<f64>,
    currency: Option<String>,
}

fn create_transaction_db(
    db_path: &PathBuf,
    args: CreateTransactionArgs,
) -> Result<Transaction, String> {
    let mut conn = Connection::open(db_path).map_err(|e| e.to_string())?;

    let tx = conn.transaction().map_err(|e| e.to_string())?;

    // Check if payee matches another account for Transfer detection
    let target_account_info: Option<i32> = tx
        .query_row(
            "SELECT id FROM accounts WHERE name = ?1 AND id != ?2",
            params![args.payee, args.account_id],
            |row| row.get(0),
        )
        .optional()
        .map_err(|e| e.to_string())?;

    let final_category = if target_account_info.is_some() {
        Some("Transfer".to_string())
    } else {
        args.category.clone()
    };

    tx.execute(
        "INSERT INTO transactions (account_id, date, payee, notes, category, amount, ticker, shares, price_per_share, fee, currency) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11)",
        params![args.account_id, args.date, args.payee, args.notes, final_category, args.amount, args.ticker, args.shares, args.price_per_share, args.fee, args.currency],
    ).map_err(|e| e.to_string())?;

    let id = tx.last_insert_rowid() as i32;

    tx.execute(
        "UPDATE accounts SET balance = balance + ?1 WHERE id = ?2",
        params![args.amount, args.account_id],
    )
    .map_err(|e| e.to_string())?;

    if let Some(target_id) = target_account_info {
        // Get source account name for the target transaction's payee
        let source_name: String = tx
            .query_row(
                "SELECT name FROM accounts WHERE id = ?1",
                params![args.account_id],
                |row| row.get(0),
            )
            .map_err(|e| e.to_string())?;

        // Insert target transaction
        tx.execute(
            "INSERT INTO transactions (account_id, date, payee, notes, category, amount) VALUES (?1, ?2, ?3, ?4, ?5, ?6)",
            params![target_id, args.date, source_name, args.notes, "Transfer", -args.amount],
        ).map_err(|e| e.to_string())?;

        // Capture inserted target transaction id and link both transactions for future sync
        let target_tx_id = tx.last_insert_rowid() as i32;
        tx.execute(
            "UPDATE transactions SET linked_tx_id = ?1 WHERE id = ?2",
            params![target_tx_id, id],
        )
        .map_err(|e| e.to_string())?;
        tx.execute(
            "UPDATE transactions SET linked_tx_id = ?1 WHERE id = ?2",
            params![id, target_tx_id],
        )
        .map_err(|e| e.to_string())?;

        // Update target account balance
        tx.execute(
            "UPDATE accounts SET balance = balance + ?1 WHERE id = ?2",
            params![-args.amount, target_id],
        )
        .map_err(|e| e.to_string())?;
    }

    tx.commit().map_err(|e| e.to_string())?;

    Ok(Transaction {
        id,
        account_id: args.account_id,
        date: args.date,
        payee: args.payee,
        notes: args.notes,
        category: final_category,
        amount: args.amount,
        ticker: args.ticker,
        shares: args.shares,
        price_per_share: args.price_per_share,
        fee: args.fee,
        currency: args.currency,
    })
}

#[tauri::command]
fn create_transaction(
    app_handle: AppHandle,
    args: CreateTransactionArgs,
) -> Result<Transaction, String> {
    let db_path = get_db_path(&app_handle)?;
    create_transaction_db(&db_path, args)
}

fn get_transactions_db(db_path: &PathBuf, account_id: i32) -> Result<Vec<Transaction>, String> {
    let conn = Connection::open(db_path).map_err(|e| e.to_string())?;

    let mut stmt = conn.prepare("SELECT id, account_id, date, payee, notes, category, amount, ticker, shares, price_per_share, fee, currency FROM transactions WHERE account_id = ?1 ORDER BY date DESC, id DESC").map_err(|e| e.to_string())?;
    let transaction_iter = stmt
        .query_map(params![account_id], |row| {
            Ok(Transaction {
                id: row.get(0)?,
                account_id: row.get(1)?,
                date: row.get(2)?,
                payee: row.get(3)?,
                notes: row.get(4)?,
                category: row.get(5)?,
                amount: row.get(6)?,
                ticker: row.get(7)?,
                shares: row.get(8)?,
                price_per_share: row.get(9)?,
                fee: row.get(10)?,
                currency: row.get(11)?,
            })
        })
        .map_err(|e| e.to_string())?;

    let mut transactions = Vec::new();
    for transaction in transaction_iter {
        transactions.push(transaction.map_err(|e| e.to_string())?);
    }

    Ok(transactions)
}

#[tauri::command]
fn get_transactions(app_handle: AppHandle, account_id: i32) -> Result<Vec<Transaction>, String> {
    let db_path = get_db_path(&app_handle)?;
    get_transactions_db(&db_path, account_id)
}

fn get_all_transactions_db(db_path: &PathBuf) -> Result<Vec<Transaction>, String> {
    let conn = Connection::open(db_path).map_err(|e| e.to_string())?;

    let mut stmt = conn.prepare("SELECT id, account_id, date, payee, notes, category, amount, ticker, shares, price_per_share, fee, currency FROM transactions ORDER BY date DESC, id DESC").map_err(|e| e.to_string())?;
    let transaction_iter = stmt
        .query_map([], |row| {
            Ok(Transaction {
                id: row.get(0)?,
                account_id: row.get(1)?,
                date: row.get(2)?,
                payee: row.get(3)?,
                notes: row.get(4)?,
                category: row.get(5)?,
                amount: row.get(6)?,
                ticker: row.get(7)?,
                shares: row.get(8)?,
                price_per_share: row.get(9)?,
                fee: row.get(10)?,
                currency: row.get(11)?,
            })
        })
        .map_err(|e| e.to_string())?;

    let mut transactions = Vec::new();
    for transaction in transaction_iter {
        transactions.push(transaction.map_err(|e| e.to_string())?);
    }

    Ok(transactions)
}

#[tauri::command]
fn get_all_transactions(app_handle: AppHandle) -> Result<Vec<Transaction>, String> {
    let db_path = get_db_path(&app_handle)?;
    get_all_transactions_db(&db_path)
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct CreateInvestmentTransactionArgs {
    account_id: i32,
    date: String,
    ticker: String,
    shares: f64,
    price_per_share: f64,
    fee: f64,
    is_buy: bool,
    currency: Option<String>,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct UpdateTransactionArgs {
    id: i32,
    account_id: i32,
    date: String,
    payee: String,
    notes: Option<String>,
    category: Option<String>,
    amount: f64,
    currency: Option<String>,
}

fn create_investment_transaction_db(
    db_path: &PathBuf,
    args: CreateInvestmentTransactionArgs,
) -> Result<Transaction, String> {
    let CreateInvestmentTransactionArgs {
        account_id,
        date,
        ticker,
        shares,
        price_per_share,
        fee,
        is_buy,
        currency,
    } = args;

    let mut conn = Connection::open(db_path).map_err(|e| e.to_string())?;

    let tx = conn.transaction().map_err(|e| e.to_string())?;

    let total_price = shares * price_per_share;

    // Investment Transaction Amount on the unified account
    // Buy: Money leaves account -> -(Total + Fee)
    // Sell: Money enters account -> (Total - Fee)
    let amount = if is_buy {
        -(total_price + fee)
    } else {
        total_price - fee
    };

    let investment_shares = if is_buy { shares } else { -shares };

    tx.execute(
        "INSERT INTO transactions (account_id, date, payee, notes, category, amount, ticker, shares, price_per_share, fee, currency) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11)",
        params![
            account_id,
            date,
            if is_buy { "Buy" } else { "Sell" }, // Payee as Buy/Sell
            format!("{} {} shares of {}", if is_buy { "Bought" } else { "Sold" }, shares, ticker),
            "Investment",
            amount,
            ticker,
            investment_shares,
            price_per_share,
            fee,
            currency
        ],
    ).map_err(|e| e.to_string())?;

    let id = tx.last_insert_rowid() as i32;

    tx.execute(
        "UPDATE accounts SET balance = balance + ?1 WHERE id = ?2",
        params![amount, account_id],
    )
    .map_err(|e| e.to_string())?;

    tx.commit().map_err(|e| e.to_string())?;

    Ok(Transaction {
        id,
        account_id,
        date,
        payee: if is_buy {
            "Buy".to_string()
        } else {
            "Sell".to_string()
        },
        notes: Some(format!(
            "{} {} shares of {}",
            if is_buy { "Bought" } else { "Sold" },
            shares,
            ticker
        )),
        category: Some("Investment".to_string()),
        amount,
        ticker: Some(ticker),
        shares: Some(investment_shares),
        price_per_share: Some(price_per_share),
        fee: Some(fee),
        currency,
    })
}

#[tauri::command]
fn create_investment_transaction(
    app_handle: AppHandle,
    args: CreateInvestmentTransactionArgs,
) -> Result<Transaction, String> {
    let db_path = get_db_path(&app_handle)?;
    create_investment_transaction_db(&db_path, args)
}

fn update_transaction_db(
    db_path: &PathBuf,
    args: UpdateTransactionArgs,
) -> Result<Transaction, String> {
    let UpdateTransactionArgs {
        id,
        account_id,
        date,
        payee,
        notes,
        category,
        amount,
        currency,
    } = args;

    let mut conn = Connection::open(db_path).map_err(|e| e.to_string())?;

    let tx = conn.transaction().map_err(|e| e.to_string())?;

    // Get old amount and account
    let (old_amount, old_account_id): (f64, i32) = tx
        .query_row(
            "SELECT amount, account_id FROM transactions WHERE id = ?1",
            params![id],
            |row| Ok((row.get(0)?, row.get(1)?)),
        )
        .map_err(|e| e.to_string())?;

    // Update transaction including account_id to support moving between accounts
    tx.execute(
        "UPDATE transactions SET account_id = ?1, date = ?2, payee = ?3, notes = ?4, category = ?5, amount = ?6, currency = ?7 WHERE id = ?8",
        params![account_id, date, payee, notes, category, amount, currency, id],
    ).map_err(|e| e.to_string())?;

    if old_account_id == account_id {
        let diff = amount - old_amount;
        if diff.abs() > f64::EPSILON {
            tx.execute(
                "UPDATE accounts SET balance = balance + ?1 WHERE id = ?2",
                params![diff, account_id],
            )
            .map_err(|e| e.to_string())?;
        }
    } else {
        // Moving transaction between accounts: revert old account and apply to new account
        tx.execute(
            "UPDATE accounts SET balance = balance - ?1 WHERE id = ?2",
            params![old_amount, old_account_id],
        )
        .map_err(|e| e.to_string())?;

        tx.execute(
            "UPDATE accounts SET balance = balance + ?1 WHERE id = ?2",
            params![amount, account_id],
        )
        .map_err(|e| e.to_string())?;
    }

    // Try to find and update corresponding transfer transaction if any
    let mut counterpart_id_opt: Option<i32> = tx
        .query_row(
            "SELECT linked_tx_id FROM transactions WHERE id = ?1",
            params![id],
            |row| row.get::<_, Option<i32>>(0),
        )
        .optional()
        .map_err(|e| e.to_string())?
        .flatten();

    if counterpart_id_opt.is_none() {
        if let Some(ref n) = notes {
            // fallback: find by exact notes match
            if let Some((found_id, _found_amount, _found_acc)) = tx
                .query_row(
                    "SELECT id, amount, account_id FROM transactions WHERE notes = ?1 AND category = 'Transfer' AND id != ?2 LIMIT 1",
                    params![n, id],
                    |row| Ok((row.get::<_, i32>(0)?, row.get::<_, f64>(1)?, row.get::<_, i32>(2)?)),
                )
                .optional()
                .map_err(|e| e.to_string())?
            {
                counterpart_id_opt = Some(found_id);
                // set linkage for future operations
                tx.execute(
                    "UPDATE transactions SET linked_tx_id = ?1 WHERE id = ?2",
                    params![found_id, id],
                )
                .map_err(|e| e.to_string())?;
                tx.execute(
                    "UPDATE transactions SET linked_tx_id = ?1 WHERE id = ?2",
                    params![id, found_id],
                )
                .map_err(|e| e.to_string())?;
            }
        }
    }

    if let Some(counterpart_id) = counterpart_id_opt {
        // Get old amount and account for counterpart
        if let Some((old_ctr_amount, ctr_account_id)) = tx
            .query_row(
                "SELECT amount, account_id FROM transactions WHERE id = ?1",
                params![counterpart_id],
                |row| Ok((row.get::<_, f64>(0)?, row.get::<_, i32>(1)?)),
            )
            .optional()
            .map_err(|e| e.to_string())?
        {
            let new_ctr_amount = -amount;
            let ctr_diff = new_ctr_amount - old_ctr_amount;

            // Determine payee for counterpart (source account name)
            let source_name: String = tx
                .query_row(
                    "SELECT name FROM accounts WHERE id = ?1",
                    params![account_id],
                    |row| row.get(0),
                )
                .map_err(|e| e.to_string())?;

            tx.execute(
                "UPDATE transactions SET date = ?1, payee = ?2, notes = ?3, category = ?4, amount = ?5, currency = ?6 WHERE id = ?7",
                params![date, source_name, notes, "Transfer", new_ctr_amount, currency, counterpart_id],
            )
            .map_err(|e| e.to_string())?;

            if ctr_diff.abs() > f64::EPSILON {
                tx.execute(
                    "UPDATE accounts SET balance = balance + ?1 WHERE id = ?2",
                    params![ctr_diff, ctr_account_id],
                )
                .map_err(|e| e.to_string())?;
            }
        }
    }

    tx.commit().map_err(|e| e.to_string())?;

    Ok(Transaction {
        id,
        account_id,
        date,
        payee,
        notes,
        category,
        amount,
        ticker: None,
        shares: None,
        price_per_share: None,
        fee: None,
        currency,
    })
}

#[tauri::command]
fn update_transaction(
    app_handle: AppHandle,
    args: UpdateTransactionArgs,
) -> Result<Transaction, String> {
    let db_path = get_db_path(&app_handle)?;
    update_transaction_db(&db_path, args)
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct UpdateInvestmentTransactionArgs {
    id: i32,
    account_id: i32,
    date: String,
    ticker: String,
    shares: f64,
    price_per_share: f64,
    fee: f64,
    is_buy: bool,
    notes: Option<String>,
    currency: Option<String>,
}

fn update_investment_transaction_db(
    db_path: &PathBuf,
    args: UpdateInvestmentTransactionArgs,
) -> Result<Transaction, String> {
    let UpdateInvestmentTransactionArgs {
        id,
        account_id,
        date,
        ticker,
        shares,
        price_per_share,
        fee,
        is_buy,
        notes,
        currency,
    } = args;

    let mut conn = Connection::open(db_path).map_err(|e| e.to_string())?;

    let tx = conn.transaction().map_err(|e| e.to_string())?;

    // Get old amount and account
    let (old_amount, old_account_id): (f64, i32) = tx
        .query_row(
            "SELECT amount, account_id FROM transactions WHERE id = ?1",
            params![id],
            |row| Ok((row.get(0)?, row.get(1)?)),
        )
        .map_err(|e| e.to_string())?;

    let total_price = shares * price_per_share;

    // Investment Transaction Amount
    // Buy: Money leaves -> -(Total + Fee)
    // Sell: Money enters -> (Total - Fee)
    let amount = if is_buy {
        -(total_price + fee)
    } else {
        total_price - fee
    };

    let investment_shares = if is_buy { shares } else { -shares };

    let final_notes = notes.unwrap_or_else(|| {
        format!(
            "{} {} shares of {}",
            if is_buy { "Bought" } else { "Sold" },
            shares,
            ticker
        )
    });

    tx.execute(
        "UPDATE transactions SET
            account_id = ?1,
            date = ?2,
            payee = ?3,
            notes = ?4,
            category = ?5,
            amount = ?6,
            ticker = ?7,
            shares = ?8,
            price_per_share = ?9,
            fee = ?10,
            currency = ?11
         WHERE id = ?12",
        params![
            account_id,
            date,
            if is_buy { "Buy" } else { "Sell" },
            final_notes,
            "Investment",
            amount,
            ticker,
            investment_shares,
            price_per_share,
            fee,
            currency,
            id
        ],
    )
    .map_err(|e| e.to_string())?;

    let diff = amount - old_amount;
    if old_account_id == account_id {
        if diff.abs() > f64::EPSILON {
            tx.execute(
                "UPDATE accounts SET balance = balance + ?1 WHERE id = ?2",
                params![diff, account_id],
            )
            .map_err(|e| e.to_string())?;
        }
    } else {
        // Move transaction between accounts
        tx.execute(
            "UPDATE accounts SET balance = balance - ?1 WHERE id = ?2",
            params![old_amount, old_account_id],
        )
        .map_err(|e| e.to_string())?;

        tx.execute(
            "UPDATE accounts SET balance = balance + ?1 WHERE id = ?2",
            params![amount, account_id],
        )
        .map_err(|e| e.to_string())?;
    }

    tx.commit().map_err(|e| e.to_string())?;

    Ok(Transaction {
        id,
        account_id,
        date,
        payee: if is_buy {
            "Buy".to_string()
        } else {
            "Sell".to_string()
        },
        notes: Some(final_notes),
        category: Some("Investment".to_string()),
        amount,
        ticker: Some(ticker),
        shares: Some(investment_shares),
        price_per_share: Some(price_per_share),
        fee: Some(fee),
        currency,
    })
}

#[tauri::command]
fn update_investment_transaction(
    app_handle: AppHandle,
    args: UpdateInvestmentTransactionArgs,
) -> Result<Transaction, String> {
    let db_path = get_db_path(&app_handle)?;
    update_investment_transaction_db(&db_path, args)
}

fn delete_transaction_db(db_path: &PathBuf, id: i32) -> Result<(), String> {
    let mut conn = Connection::open(db_path).map_err(|e| e.to_string())?;

    let tx = conn.transaction().map_err(|e| e.to_string())?;

    // Get amount, account_id, notes and linked_tx_id (if any)
    let (amount, account_id, notes, linked): (f64, i32, Option<String>, Option<i32>) = tx
        .query_row(
            "SELECT amount, account_id, notes, linked_tx_id FROM transactions WHERE id = ?1",
            params![id],
            |row| Ok((row.get(0)?, row.get(1)?, row.get(2)?, row.get(3)?)),
        )
        .map_err(|e| e.to_string())?;

    // Delete the requested transaction
    tx.execute("DELETE FROM transactions WHERE id = ?1", params![id])
        .map_err(|e| e.to_string())?;

    tx.execute(
        "UPDATE accounts SET balance = balance - ?1 WHERE id = ?2",
        params![amount, account_id],
    )
    .map_err(|e| e.to_string())?;

    // If there's a linked counterpart, delete it and update its account balance
    if let Some(linked_id) = linked {
        if let Some((ctr_amount, ctr_account_id)) = tx
            .query_row(
                "SELECT amount, account_id FROM transactions WHERE id = ?1",
                params![linked_id],
                |row| Ok((row.get::<_, f64>(0)?, row.get::<_, i32>(1)?)),
            )
            .optional()
            .map_err(|e| e.to_string())?
        {
            tx.execute("DELETE FROM transactions WHERE id = ?1", params![linked_id])
                .map_err(|e| e.to_string())?;

            tx.execute(
                "UPDATE accounts SET balance = balance - ?1 WHERE id = ?2",
                params![ctr_amount, ctr_account_id],
            )
            .map_err(|e| e.to_string())?;
        }
    } else if let Some(ref n) = notes {
        // fallback: try to find counterpart by notes
        if let Some((found_id, ctr_amount, ctr_account_id)) = tx
            .query_row(
                "SELECT id, amount, account_id FROM transactions WHERE notes = ?1 AND category = 'Transfer' LIMIT 1",
                params![n],
                |row| Ok((row.get::<_, i32>(0)?, row.get::<_, f64>(1)?, row.get::<_, i32>(2)?)),
            )
            .optional()
            .map_err(|e| e.to_string())?
        {
            tx.execute("DELETE FROM transactions WHERE id = ?1", params![found_id])
                .map_err(|e| e.to_string())?;

            tx.execute(
                "UPDATE accounts SET balance = balance - ?1 WHERE id = ?2",
                params![ctr_amount, ctr_account_id],
            )
            .map_err(|e| e.to_string())?;
        }
    }

    tx.commit().map_err(|e| e.to_string())?;

    Ok(())
}

#[tauri::command]
fn delete_transaction(app_handle: AppHandle, id: i32) -> Result<(), String> {
    let db_path = get_db_path(&app_handle)?;
    delete_transaction_db(&db_path, id)
}

fn get_payees_db(db_path: &PathBuf) -> Result<Vec<String>, String> {
    let conn = Connection::open(db_path).map_err(|e| e.to_string())?;

    let mut stmt = conn
        .prepare("SELECT DISTINCT payee FROM transactions ORDER BY payee")
        .map_err(|e| e.to_string())?;
    let payee_iter = stmt
        .query_map([], |row| row.get(0))
        .map_err(|e| e.to_string())?;

    let mut payees = Vec::new();
    for payee in payee_iter {
        payees.push(payee.map_err(|e| e.to_string())?);
    }

    Ok(payees)
}

#[tauri::command]
fn get_payees(app_handle: AppHandle) -> Result<Vec<String>, String> {
    let db_path = get_db_path(&app_handle)?;
    get_payees_db(&db_path)
}

fn get_categories_db(db_path: &PathBuf) -> Result<Vec<String>, String> {
    let conn = Connection::open(db_path).map_err(|e| e.to_string())?;

    let mut stmt = conn.prepare("SELECT DISTINCT category FROM transactions WHERE category IS NOT NULL AND category != 'Transfer' ORDER BY category").map_err(|e| e.to_string())?;
    let cat_iter = stmt
        .query_map([], |row| row.get(0))
        .map_err(|e| e.to_string())?;

    let mut categories = Vec::new();
    for cat in cat_iter {
        categories.push(cat.map_err(|e| e.to_string())?);
    }

    Ok(categories)
}

#[tauri::command]
fn get_categories(app_handle: AppHandle) -> Result<Vec<String>, String> {
    let db_path = get_db_path(&app_handle)?;
    get_categories_db(&db_path)
}

#[tauri::command]
async fn search_ticker(
    app_handle: AppHandle,
    query: String,
) -> Result<Vec<YahooSearchQuote>, String> {
    // 1. Get initial search results
    let mut quotes = search_ticker_with_client(
        reqwest::Client::new(),
        "https://query1.finance.yahoo.com".to_string(),
        query,
    )
    .await?;

    if quotes.is_empty() {
        return Ok(quotes);
    }

    // 2. Fetch full quotes to get currencies for these symbols
    let tickers: Vec<String> = quotes.iter().map(|q| q.symbol.clone()).collect();
    let full_quotes = get_stock_quotes(app_handle, tickers)
        .await
        .unwrap_or_default();

    // 3. Merge currency info back into search results
    for q in &mut quotes {
        if let Some(fq) = full_quotes.iter().find(|f| f.symbol == q.symbol) {
            q.currency = fq.currency.clone();
        }
    }

    Ok(quotes)
}

// Helper allowing tests to inject client and base URL
async fn search_ticker_with_client(
    client: reqwest::Client,
    base_url: String,
    query: String,
) -> Result<Vec<YahooSearchQuote>, String> {
    let url = format!("{}/v1/finance/search?q={}", base_url, query);
    let res = client
        .get(&url)
        .header("User-Agent", "Mozilla/5.0")
        .send()
        .await
        .map_err(|e| e.to_string())?;

    let text = res.text().await.map_err(|e| e.to_string())?;
    let response: YahooSearchResponse = serde_json::from_str(&text).map_err(|e| e.to_string())?;

    Ok(response.quotes)
}

#[tauri::command]
async fn get_stock_quotes(
    app_handle: AppHandle,
    tickers: Vec<String>,
) -> Result<Vec<YahooQuote>, String> {
    // Delegate to helper that allows injecting a client and base URL for tests
    get_stock_quotes_with_client(
        reqwest::Client::builder()
            .build()
            .map_err(|e| e.to_string())?,
        "https://query1.finance.yahoo.com".to_string(),
        app_handle,
        tickers,
    )
    .await
}

async fn get_stock_quotes_with_client(
    client: reqwest::Client,
    base_url: String,
    app_handle: AppHandle,
    tickers: Vec<String>,
) -> Result<Vec<YahooQuote>, String> {
    if tickers.is_empty() {
        return Ok(Vec::new());
    }

    let mut tasks = Vec::new();

    for ticker in tickers.clone() {
        let client = client.clone();
        let base_url = base_url.clone();
        tasks.push(tokio::spawn(async move {
            let url = format!("{}/v8/finance/chart/{}?interval=1d&range=1d", base_url, ticker);
            let res = client.get(&url)
                .header("User-Agent", "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36")
                .send()
                .await;

            match res {
                Ok(resp) => {
                    if resp.status().is_success() {
                        let text_res = resp.text().await;
                        match text_res {
                            Ok(text) => {
                                let json: Result<YahooChartResponse, _> = serde_json::from_str(&text);
                                match json {
                                    Ok(data) => {
                                        if let Some(results) = data.chart.result {
                                            if let Some(item) = results.first() {
                                                let price = item.meta.regular_market_price.unwrap_or(0.0);
                                                let prev = item.meta.chart_previous_close
                                                    .or(item.meta.previous_close)
                                                    .unwrap_or(price);

                                                let change_percent = if prev != 0.0 {
                                                    ((price - prev) / prev) * 100.0
                                                } else {
                                                    0.0
                                                };
                                                return Some(YahooQuote {
                                                    symbol: item.meta.symbol.clone(),
                                                    price,
                                                    change_percent,
                                                    currency: item.meta.currency.clone(),
                                                });
                                            }
                                        }
                                    },
                                    Err(e) => {
                                        println!("Failed to parse JSON for {}: {}", ticker, e);
                                    }
                                }
                            },
                            Err(e) => println!("Failed to get text for {}: {}", ticker, e),
                        }
                    } else {
                        println!("Request failed for {}: {}", ticker, resp.status());
                    }
                },
                Err(e) => {
                    println!("Request error for {}: {}", ticker, e);
                }
            }
            None
        }));
    }

    let mut quotes = Vec::new();
    for task in tasks {
        if let Ok(Some(quote)) = task.await {
            quotes.push(quote);
        }
    }

    // Update DB with new quotes
    let db_path = get_db_path(&app_handle)?;
    let mut conn = Connection::open(db_path).map_err(|e| e.to_string())?;
    let tx = conn.transaction().map_err(|e| e.to_string())?;

    {
        let mut stmt = tx.prepare("INSERT OR REPLACE INTO stock_prices (ticker, price, last_updated) VALUES (?1, ?2, datetime('now'))").map_err(|e| e.to_string())?;
        for quote in &quotes {
            stmt.execute(params![quote.symbol, quote.price])
                .map_err(|e| e.to_string())?;
        }
    }
    tx.commit().map_err(|e| e.to_string())?;

    // If we missed some tickers, try to fetch from DB
    let found_symbols: Vec<String> = quotes.iter().map(|q| q.symbol.clone()).collect();
    let missing_tickers: Vec<String> = tickers
        .into_iter()
        .filter(|t| !found_symbols.iter().any(|s| s.eq_ignore_ascii_case(t)))
        .collect();

    if !missing_tickers.is_empty() {
        let conn = Connection::open(get_db_path(&app_handle)?).map_err(|e| e.to_string())?;
        let mut stmt = conn
            .prepare("SELECT ticker, price FROM stock_prices WHERE ticker = ?1 COLLATE NOCASE")
            .map_err(|e| e.to_string())?;

        for ticker in missing_tickers {
            let res: Result<(String, f64), _> =
                stmt.query_row(params![ticker], |row| Ok((row.get(0)?, row.get(1)?)));

            if let Ok((symbol, price)) = res {
                quotes.push(YahooQuote {
                    symbol,
                    price,
                    change_percent: 0.0, // We don't store change percent in DB yet, could add it
                    currency: None,
                });
            }
        }
    }

    Ok(quotes)
}

// Variant that accepts a direct DB path so tests can call without needing an AppHandle
#[allow(dead_code)]
async fn get_stock_quotes_with_client_and_db(
    client: reqwest::Client,
    base_url: String,
    db_path: &PathBuf,
    tickers: Vec<String>,
) -> Result<Vec<YahooQuote>, String> {
    if tickers.is_empty() {
        return Ok(Vec::new());
    }

    let mut tasks = Vec::new();

    for ticker in tickers.clone() {
        let client = client.clone();
        let base_url = base_url.clone();
        tasks.push(tokio::spawn(async move {
            let url = format!("{}/v8/finance/chart/{}?interval=1d&range=1d", base_url.trim_end_matches('/'), ticker);
            let res = client.get(&url)
                .header("User-Agent", "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36")
                .send()
                .await;

            match res {
                Ok(resp) => {
                    if resp.status().is_success() {
                        let text_res = resp.text().await;
                        match text_res {
                            Ok(text) => {
                                let json: Result<YahooChartResponse, _> = serde_json::from_str(&text);
                                match json {
                                    Ok(data) => {
                                        if let Some(results) = data.chart.result {
                                            if let Some(item) = results.first() {
                                                let price = item.meta.regular_market_price.unwrap_or(0.0);
                                                let prev = item.meta.chart_previous_close
                                                    .or(item.meta.previous_close)
                                                    .unwrap_or(price);

                                                let change_percent = if prev != 0.0 {
                                                    ((price - prev) / prev) * 100.0
                                                } else {
                                                    0.0
                                                };
                                                return Some(YahooQuote {
                                                    symbol: item.meta.symbol.clone(),
                                                    price,
                                                    change_percent,
                                                    currency: item.meta.currency.clone(),
                                                });
                                            }
                                        }
                                    },
                                    Err(e) => {
                                        println!("Failed to parse JSON for {}: {}", ticker, e);
                                    }
                                }
                            },
                            Err(e) => println!("Failed to get text for {}: {}", ticker, e),
                        }
                    } else {
                        println!("Request failed for {}: {}", ticker, resp.status());
                    }
                },
                Err(e) => {
                    println!("Request error for {}: {}", ticker, e);
                }
            }
            None
        }));
    }

    let mut quotes = Vec::new();
    for task in tasks {
        if let Ok(Some(quote)) = task.await {
            quotes.push(quote);
        }
    }

    // Update DB with new quotes
    let mut conn = Connection::open(db_path).map_err(|e| e.to_string())?;
    let tx = conn.transaction().map_err(|e| e.to_string())?;

    {
        let mut stmt = tx.prepare("INSERT OR REPLACE INTO stock_prices (ticker, price, last_updated) VALUES (?1, ?2, datetime('now'))").map_err(|e| e.to_string())?;
        for quote in &quotes {
            stmt.execute(params![quote.symbol, quote.price])
                .map_err(|e| e.to_string())?;
        }
    }
    tx.commit().map_err(|e| e.to_string())?;

    // If we missed some tickers, try to fetch from DB
    let found_symbols: Vec<String> = quotes.iter().map(|q| q.symbol.clone()).collect();
    let missing_tickers: Vec<String> = tickers
        .into_iter()
        .filter(|t| !found_symbols.iter().any(|s| s.eq_ignore_ascii_case(t)))
        .collect();

    if !missing_tickers.is_empty() {
        let conn = Connection::open(db_path).map_err(|e| e.to_string())?;
        let mut stmt = conn
            .prepare("SELECT ticker, price FROM stock_prices WHERE ticker = ?1 COLLATE NOCASE")
            .map_err(|e| e.to_string())?;

        for ticker in missing_tickers {
            let res: Result<(String, f64), _> =
                stmt.query_row(params![ticker], |row| Ok((row.get(0)?, row.get(1)?)));

            if let Ok((symbol, price)) = res {
                quotes.push(YahooQuote {
                    symbol,
                    price,
                    change_percent: 0.0, // We don't store change percent in DB yet, could add it
                    currency: None,
                });
            }
        }
    }

    Ok(quotes)
}

#[derive(Serialize, Deserialize, Debug)]
struct DailyPrice {
    date: String,
    price: f64,
}

// Internal helper that performs the main fetching & DB insertion logic. Extracted to make testing easier.
async fn update_daily_stock_prices_with_client_and_base(
    db_path: &std::path::Path,
    client: &reqwest::Client,
    base_url: &str,
    tickers: Vec<String>,
) -> Result<(), String> {
    if tickers.is_empty() {
        return Ok(());
    }

    for ticker in tickers {
        // 1. Get last date from DB
        let last_date_str: Option<String> = {
            let conn = Connection::open(db_path).map_err(|e| e.to_string())?;
            conn.query_row(
                "SELECT MAX(date) FROM daily_stock_prices WHERE ticker = ?1",
                params![ticker],
                |row| row.get(0),
            )
            .optional()
            .map_err(|e| e.to_string())?
            .flatten()
        };

        let start_timestamp = if let Some(date_str) = last_date_str {
            // Parse date and add 1 day
            let date =
                NaiveDate::parse_from_str(&date_str, "%Y-%m-%d").map_err(|e| e.to_string())?;
            let next_day = date.succ_opt().ok_or("Invalid date")?;
            let datetime = next_day.and_hms_opt(0, 0, 0).unwrap();
            datetime.and_utc().timestamp()
        } else {
            // Default to 10 years ago
            Utc::now().timestamp() - 10 * 365 * 24 * 60 * 60
        };

        let end_timestamp = Utc::now().timestamp();

        if start_timestamp >= end_timestamp {
            continue;
        }

        // 2. Fetch from Yahoo
        let url = format!(
            "{}/v8/finance/chart/{}?period1={}&period2={}&interval=1d",
            base_url, ticker, start_timestamp, end_timestamp
        );

        let res = client
            .get(&url)
            .header("User-Agent", "Mozilla/5.0")
            .send()
            .await
            .map_err(|e| e.to_string())?;

        if !res.status().is_success() {
            println!("Failed to fetch history for {}: {}", ticker, res.status());
            continue;
        }

        let text = res.text().await.map_err(|e| e.to_string())?;
        let json: YahooChartResponse = serde_json::from_str(&text).map_err(|e| e.to_string())?;

        // 3. Insert into DB
        if let Some(result) = json.chart.result {
            if let Some(data) = result.first() {
                if let (Some(timestamps), Some(indicators)) = (&data.timestamp, &data.indicators) {
                    if let Some(quotes) = &indicators.quote {
                        if let Some(quote) = quotes.first() {
                            if let Some(closes) = &quote.close {
                                let mut conn =
                                    Connection::open(db_path).map_err(|e| e.to_string())?;
                                let tx = conn.transaction().map_err(|e| e.to_string())?;
                                {
                                    let mut stmt = tx.prepare(
                                        "INSERT OR REPLACE INTO daily_stock_prices (ticker, date, price) VALUES (?1, ?2, ?3)"
                                    )
                                    .map_err(|e: rusqlite::Error| e.to_string())?;

                                    for (i, ts) in timestamps.iter().enumerate() {
                                        if let Some(price) = closes.get(i).and_then(|p| *p) {
                                            let date_str = Utc
                                                .timestamp_opt(*ts, 0)
                                                .unwrap()
                                                .format("%Y-%m-%d")
                                                .to_string();
                                            stmt.execute(params![ticker, date_str, price])
                                                .map_err(|e| e.to_string())?;
                                        }
                                    }
                                }
                                tx.commit().map_err(|e: rusqlite::Error| e.to_string())?;
                            }
                        }
                    }
                }
            }
        }
    }

    Ok(())
}

#[tauri::command]
async fn update_daily_stock_prices(
    app_handle: AppHandle,
    tickers: Vec<String>,
) -> Result<(), String> {
    // Allow overriding base URL via env var for testing
    let base_url = std::env::var("YAHOO_BASE_URL")
        .unwrap_or_else(|_| "https://query1.finance.yahoo.com".to_string());
    let db_path = get_db_path(&app_handle)?;

    let client = reqwest::Client::new();
    update_daily_stock_prices_with_client_and_base(
        std::path::Path::new(&db_path),
        &client,
        &base_url,
        tickers,
    )
    .await
}

// Helper to make `get_daily_stock_prices` testable without an AppHandle
fn get_daily_stock_prices_from_path(
    db_path: &std::path::Path,
    ticker: String,
) -> Result<Vec<DailyPrice>, String> {
    let conn = Connection::open(db_path).map_err(|e| e.to_string())?;

    let mut stmt = conn
        .prepare("SELECT date, price FROM daily_stock_prices WHERE ticker = ?1 ORDER BY date ASC")
        .map_err(|e| e.to_string())?;

    let prices = stmt
        .query_map(params![ticker], |row| {
            Ok(DailyPrice {
                date: row.get(0)?,
                price: row.get(1)?,
            })
        })
        .map_err(|e| e.to_string())?
        .collect::<Result<Vec<_>, _>>()
        .map_err(|e| e.to_string())?;

    Ok(prices)
}

#[tauri::command]
fn get_daily_stock_prices(
    app_handle: AppHandle,
    ticker: String,
) -> Result<Vec<DailyPrice>, String> {
    let db_path = get_db_path(&app_handle)?;
    get_daily_stock_prices_from_path(std::path::Path::new(&db_path), ticker)
}

#[tauri::command]
fn get_system_theme() -> Result<String, String> {
    // Return "dark" or "light" based on heuristics per-platform. Keep implementation small and robust.
    #[cfg(target_os = "linux")]
    {
        use std::process::Command;
        // Try GNOME color-scheme
        if let Ok(o) = Command::new("gsettings")
            .args(["get", "org.gnome.desktop.interface", "color-scheme"])
            .output()
        {
            if o.status.success() {
                let s = String::from_utf8_lossy(&o.stdout).to_lowercase();
                if s.contains("prefer-dark") || s.contains("dark") {
                    return Ok("dark".to_string());
                }
            }
        }
        // Try GTK theme name
        if let Ok(o) = Command::new("gsettings")
            .args(["get", "org.gnome.desktop.interface", "gtk-theme"])
            .output()
        {
            if o.status.success() {
                let s = String::from_utf8_lossy(&o.stdout).to_lowercase();
                if s.contains("dark") {
                    return Ok("dark".to_string());
                }
            }
        }
        // Env var fallback
        if std::env::var("GTK_THEME")
            .map(|v| v.to_lowercase().contains("dark"))
            .unwrap_or(false)
        {
            return Ok("dark".to_string());
        }
        Ok("light".to_string())
    }

    #[cfg(target_os = "macos")]
    {
        use std::process::Command;
        if let Ok(o) = Command::new("defaults")
            .args(["read", "-g", "AppleInterfaceStyle"])
            .output()
        {
            if o.status.success() {
                let s = String::from_utf8_lossy(&o.stdout).to_lowercase();
                if s.contains("dark") {
                    return Ok("dark".to_string());
                }
            }
        }
        Ok("light".to_string())
    }

    #[cfg(target_os = "windows")]
    {
        use std::process::Command;
        if let Ok(o) = Command::new("reg")
            .args([
                "query",
                "HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Themes\\Personalize",
                "/v",
                "AppsUseLightTheme",
            ])
            .output()
        {
            if o.status.success() {
                let s = String::from_utf8_lossy(&o.stdout).to_lowercase();
                if s.contains("0x0") || s.contains("0x00000000") {
                    return Ok("dark".to_string());
                }
            }
        }
        Ok("light".to_string())
    }

    // Fallback for other targets
    #[cfg(not(any(target_os = "linux", target_os = "macos", target_os = "windows")))]
    {
        Ok("light".to_string())
    }
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_process::init())
        .plugin(tauri_plugin_updater::Builder::new().build())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_fs::init())
        .setup(|app| {
            init_db(app.handle())?;

            #[cfg(target_os = "linux")]
            {
                use tauri::Emitter;
                let handle = app.handle().clone();
                std::thread::spawn(move || {
                    use std::time::Duration;
                    let mut last = get_system_theme().unwrap_or_else(|_| "light".to_string());
                    loop {
                        std::thread::sleep(Duration::from_secs(2));
                        let current = get_system_theme().unwrap_or_else(|_| "light".to_string());
                        if current != last {
                            last = current.clone();
                            let _ = handle.emit("system-theme-changed", current);
                        }
                    }
                });
            }

            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            create_account,
            get_accounts,
            create_transaction,
            get_transactions,
            get_all_transactions,
            update_transaction,
            delete_transaction,
            get_payees,
            get_categories,
            create_investment_transaction,
            update_investment_transaction,
            get_stock_quotes,
            update_daily_stock_prices,
            get_daily_stock_prices,
            search_ticker,
            rename_account,
            update_account,
            delete_account,
            // DB path commands
            set_db_path,
            reset_db_path,
            get_db_path_command,
            // Desktop theme helper
            get_system_theme,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}

#[cfg(test)]
mod tests;
