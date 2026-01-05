use chrono::{NaiveDate, TimeZone, Utc};
use rusqlite::{params, Connection, OptionalExtension};
use serde::{Deserialize, Serialize};
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
}

#[derive(Serialize, Deserialize, Debug)]
struct YahooSearchResponse {
    quotes: Vec<YahooSearchQuote>,
}

#[derive(Serialize, Deserialize, Debug)]
struct Account {
    id: i32,
    name: String,
    balance: f64,
    kind: String,
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
    kind: String,
) -> Result<Account, String> {
    let mut conn = Connection::open(db_path).map_err(|e| e.to_string())?;

    let tx = conn.transaction().map_err(|e| e.to_string())?;

    tx.execute(
        "INSERT INTO accounts (name, balance, kind) VALUES (?1, ?2, ?3)",
        params![name, balance, kind],
    )
    .map_err(|e| e.to_string())?;

    let id = tx.last_insert_rowid() as i32;

    if balance.abs() > f64::EPSILON {
        // Create initial transaction
        tx.execute(
            "INSERT INTO transactions (account_id, date, payee, notes, category, amount) VALUES (?1, date('now'), ?2, ?3, ?4, ?5)",
            params![
                id,
                "Opening Balance",
                "Initial Balance",
                "Income",
                balance
            ],
        )
        .map_err(|e| e.to_string())?;
    }

    tx.commit().map_err(|e| e.to_string())?;

    Ok(Account {
        id,
        name,
        balance,
        kind,
    })
}

#[tauri::command]
fn create_account(
    app_handle: AppHandle,
    name: String,
    balance: f64,
    kind: String,
) -> Result<Account, String> {
    let db_path = get_db_path(&app_handle)?;
    create_account_db(&db_path, name, balance, kind)
}

fn rename_account_db(db_path: &PathBuf, id: i32, new_name: String) -> Result<Account, String> {
    if new_name.trim().is_empty() {
        return Err("Account name cannot be empty or whitespace-only".to_string());
    }
    let conn = Connection::open(db_path).map_err(|e| e.to_string())?;

    conn.execute(
        "UPDATE accounts SET name = ?1 WHERE id = ?2",
        params![new_name, id],
    )
    .map_err(|e| e.to_string())?;

    let mut stmt = conn
        .prepare("SELECT id, name, balance, kind FROM accounts WHERE id = ?1")
        .map_err(|e| e.to_string())?;

    let account = stmt
        .query_row(params![id], |row| {
            Ok(Account {
                id: row.get(0)?,
                name: row.get(1)?,
                balance: row.get(2)?,
                kind: row.get(3).unwrap_or("cash".to_string()),
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
        .prepare("SELECT id, name, balance, kind FROM accounts")
        .map_err(|e| e.to_string())?;
    let account_iter = stmt
        .query_map([], |row| {
            Ok(Account {
                id: row.get(0)?,
                name: row.get(1)?,
                balance: row.get(2)?,
                kind: row.get(3).unwrap_or("cash".to_string()),
            })
        })
        .map_err(|e| e.to_string())?;

    let mut accounts = Vec::new();
    for account in account_iter {
        accounts.push(account.map_err(|e| e.to_string())?);
    }

    Ok(accounts)
}

#[tauri::command]
fn get_accounts(app_handle: AppHandle) -> Result<Vec<Account>, String> {
    let db_path = get_db_path(&app_handle)?;
    get_accounts_db(&db_path)
}

#[derive(Serialize, Deserialize, Debug, Clone)]
#[serde(rename_all = "camelCase")]
pub struct CreateTransactionArgs {
    pub account_id: i32,
    pub date: String,
    pub payee: String,
    pub notes: Option<String>,
    pub category: Option<String>,
    pub amount: f64,
    pub ticker: Option<String>,
    pub shares: Option<f64>,
    pub price_per_share: Option<f64>,
    pub fee: Option<f64>,
}

fn create_transaction_db(
    db_path: &PathBuf,
    args: CreateTransactionArgs,
) -> Result<Transaction, String> {
    let mut conn = Connection::open(db_path).map_err(|e| e.to_string())?;

    let tx = conn.transaction().map_err(|e| e.to_string())?;

    // Get source account info
    let (source_kind, source_name): (String, String) = tx
        .query_row(
            "SELECT kind, name FROM accounts WHERE id = ?1",
            params![args.account_id],
            |row| Ok((row.get(0)?, row.get(1)?)),
        )
        .map_err(|e| e.to_string())?;

    // Check if payee matches another account
    let target_account_info: Option<(i32, String)> = tx
        .query_row(
            "SELECT id, kind FROM accounts WHERE name = ?1 AND id != ?2",
            params![args.payee, args.account_id],
            |row| Ok((row.get(0)?, row.get(1)?)),
        )
        .optional()
        .map_err(|e| e.to_string())?;

    let mut final_args = args.clone();
    let mut final_target_id_opt = target_account_info.as_ref().map(|(id, _)| *id);
    let mut skip_target_creation = false;

    if let Some((target_id, ref target_kind)) = target_account_info {
        if source_kind == "brokerage" && target_kind == "cash" {
            // Swap: We want to record this as a transaction on the Cash account.
            final_args.account_id = target_id;
            final_args.payee = source_name.clone();
            final_args.amount = -args.amount;

            // The "target" for the purpose of the rest of the function (the counterpart)
            // is now the Brokerage account (original source).
            // But we want to SKIP creating it.
            final_target_id_opt = Some(args.account_id);
            skip_target_creation = true;
        } else if source_kind == "cash" && target_kind == "brokerage" {
            // Cash -> Brokerage.
            // Create on Cash (Source). Skip Target (Brokerage).
            skip_target_creation = true;
        }
    }

    let final_category = if final_target_id_opt.is_some() {
        Some("Transfer".to_string())
    } else {
        final_args.category.clone()
    };

    tx.execute(
        "INSERT INTO transactions (account_id, date, payee, notes, category, amount, ticker, shares, price_per_share, fee) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10)",
        params![final_args.account_id, final_args.date, final_args.payee, final_args.notes, final_category, final_args.amount, final_args.ticker, final_args.shares, final_args.price_per_share, final_args.fee],
    ).map_err(|e| e.to_string())?;

    let id = tx.last_insert_rowid() as i32;

    tx.execute(
        "UPDATE accounts SET balance = balance + ?1 WHERE id = ?2",
        params![final_args.amount, final_args.account_id],
    )
    .map_err(|e| e.to_string())?;

    if let Some(target_id) = final_target_id_opt {
        if !skip_target_creation {
            // Get source account name for the target transaction's payee
            // Note: If we swapped, final_args.payee is the original source name.
            // But here we need the name of the account we just inserted into (final_args.account_id).
            // Wait, the target transaction's payee should be the name of the source account.
            // If we didn't swap, source is final_args.account_id.
            // If we swapped, source is final_args.account_id (which is the Cash account).

            // Insert target transaction
            tx.execute(
                "INSERT INTO transactions (account_id, date, payee, notes, category, amount) VALUES (?1, ?2, ?3, ?4, ?5, ?6)",
                params![target_id, final_args.date, source_name, final_args.notes, "Transfer", -final_args.amount],
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
                params![-final_args.amount, target_id],
            )
            .map_err(|e| e.to_string())?;
        }
    }

    tx.commit().map_err(|e| e.to_string())?;

    Ok(Transaction {
        id,
        account_id: final_args.account_id,
        date: final_args.date,
        payee: final_args.payee,
        notes: final_args.notes,
        category: final_category,
        amount: final_args.amount,
        ticker: final_args.ticker,
        shares: final_args.shares,
        price_per_share: final_args.price_per_share,
        fee: final_args.fee,
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

    let mut stmt = conn.prepare("SELECT id, account_id, date, payee, notes, category, amount, ticker, shares, price_per_share, fee FROM transactions WHERE account_id = ?1 ORDER BY date DESC, id DESC").map_err(|e| e.to_string())?;
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

    let mut stmt = conn.prepare("SELECT id, account_id, date, payee, notes, category, amount, ticker, shares, price_per_share, fee FROM transactions ORDER BY date DESC, id DESC").map_err(|e| e.to_string())?;
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
struct CreateBrokerageTransactionArgs {
    brokerage_account_id: i32,
    cash_account_id: i32,
    date: String,
    ticker: String,
    shares: f64,
    price_per_share: f64,
    fee: f64,
    is_buy: bool,
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
}

fn create_brokerage_transaction_db(
    db_path: &PathBuf,
    args: CreateBrokerageTransactionArgs,
) -> Result<Transaction, String> {
    let CreateBrokerageTransactionArgs {
        brokerage_account_id,
        cash_account_id,
        date,
        ticker,
        shares,
        price_per_share,
        fee,
        is_buy,
    } = args;

    let mut conn = Connection::open(db_path).map_err(|e| e.to_string())?;

    let tx = conn.transaction().map_err(|e| e.to_string())?;

    let total_price = shares * price_per_share;

    // Brokerage Transaction
    // For brokerage, we record the value change.
    // Buy: +Value (shares * price)
    // Sell: -Value (shares * price)
    // Note: This is a simplification. Usually you track cost basis.
    let brokerage_amount = if is_buy { total_price } else { -total_price };
    let brokerage_shares = if is_buy { shares } else { -shares };

    tx.execute(
        "INSERT INTO transactions (account_id, date, payee, notes, category, amount, ticker, shares, price_per_share, fee) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10)",
        params![
            brokerage_account_id,
            date,
            if is_buy { "Buy" } else { "Sell" }, // Payee as Buy/Sell
            format!("{} {} shares of {}", if is_buy { "Bought" } else { "Sold" }, shares, ticker),
            "Investment",
            brokerage_amount,
            ticker,
            brokerage_shares,
            price_per_share,
            fee
        ],
    ).map_err(|e| e.to_string())?;

    let id = tx.last_insert_rowid() as i32;

    tx.execute(
        "UPDATE accounts SET balance = balance + ?1 WHERE id = ?2",
        params![brokerage_amount, brokerage_account_id],
    )
    .map_err(|e| e.to_string())?;

    // Cash Account Transaction
    // Buy: - (Total + Fee)
    // Sell: + (Total - Fee)
    let cash_amount = if is_buy {
        -(total_price + fee)
    } else {
        total_price - fee
    };

    // Get brokerage account name for payee
    let brokerage_name: String = tx
        .query_row(
            "SELECT name FROM accounts WHERE id = ?1",
            params![brokerage_account_id],
            |row| row.get(0),
        )
        .map_err(|e| e.to_string())?;

    tx.execute(
        "INSERT INTO transactions (account_id, date, payee, notes, category, amount) VALUES (?1, ?2, ?3, ?4, ?5, ?6)",
        params![
            cash_account_id,
            date,
            brokerage_name,
            format!("{} {} shares of {}", if is_buy { "Buy" } else { "Sell" }, shares, ticker),
            "Transfer",
            cash_amount
        ],
    ).map_err(|e| e.to_string())?;

    // Link the cash transaction with the brokerage transaction
    let cash_tx_id = tx.last_insert_rowid() as i32;
    tx.execute(
        "UPDATE transactions SET linked_tx_id = ?1 WHERE id = ?2",
        params![cash_tx_id, id],
    )
    .map_err(|e| e.to_string())?;
    tx.execute(
        "UPDATE transactions SET linked_tx_id = ?1 WHERE id = ?2",
        params![id, cash_tx_id],
    )
    .map_err(|e| e.to_string())?;

    tx.execute(
        "UPDATE accounts SET balance = balance + ?1 WHERE id = ?2",
        params![cash_amount, cash_account_id],
    )
    .map_err(|e| e.to_string())?;

    tx.commit().map_err(|e| e.to_string())?;

    Ok(Transaction {
        id,
        account_id: brokerage_account_id,
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
        amount: brokerage_amount,
        ticker: Some(ticker),
        shares: Some(brokerage_shares),
        price_per_share: Some(price_per_share),
        fee: Some(fee),
    })
}

#[tauri::command]
fn create_brokerage_transaction(
    app_handle: AppHandle,
    args: CreateBrokerageTransactionArgs,
) -> Result<Transaction, String> {
    let db_path = get_db_path(&app_handle)?;
    create_brokerage_transaction_db(&db_path, args)
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
        "UPDATE transactions SET account_id = ?1, date = ?2, payee = ?3, notes = ?4, category = ?5, amount = ?6 WHERE id = ?7",
        params![account_id, date, payee, notes, category, amount, id],
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
                "UPDATE transactions SET date = ?1, payee = ?2, notes = ?3, category = ?4, amount = ?5 WHERE id = ?6",
                params![date, source_name, notes, "Transfer", new_ctr_amount, counterpart_id],
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
struct UpdateBrokerageTransactionArgs {
    id: i32,
    brokerage_account_id: i32,
    date: String,
    ticker: String,
    shares: f64,
    price_per_share: f64,
    fee: f64,
    is_buy: bool,
}

fn update_brokerage_transaction_db(
    db_path: &PathBuf,
    args: UpdateBrokerageTransactionArgs,
) -> Result<Transaction, String> {
    let UpdateBrokerageTransactionArgs {
        id,
        brokerage_account_id,
        date,
        ticker,
        shares,
        price_per_share,
        fee,
        is_buy,
    } = args;

    let mut conn = Connection::open(db_path).map_err(|e| e.to_string())?;

    let tx = conn.transaction().map_err(|e| e.to_string())?;

    // Get old amount, notes and account to locate the corresponding cash transaction and previous brokerage account
    let (old_amount, old_notes, old_account_id): (f64, String, i32) = tx
        .query_row(
            "SELECT amount, notes, account_id FROM transactions WHERE id = ?1",
            params![id],
            |row| Ok((row.get(0)?, row.get(1)?, row.get(2)?)),
        )
        .map_err(|e| e.to_string())?;

    let total_price = shares * price_per_share;
    let brokerage_amount = if is_buy { total_price } else { -total_price };
    let brokerage_shares_signed = if is_buy { shares } else { -shares };
    let new_notes = format!(
        "{} {} shares of {}",
        if is_buy { "Bought" } else { "Sold" },
        shares,
        ticker
    );

    // Update transaction row (including account_id to support moving between brokerage accounts)
    tx.execute(
        "UPDATE transactions SET account_id = ?1, date = ?2, payee = ?3, notes = ?4, category = ?5, amount = ?6, ticker = ?7, shares = ?8, price_per_share = ?9, fee = ?10 WHERE id = ?11",
        params![
            brokerage_account_id,
            date,
            if is_buy { "Buy" } else { "Sell" },
            new_notes,
            "Investment",
            brokerage_amount,
            ticker,
            brokerage_shares_signed,
            price_per_share,
            fee,
            id
        ],
    )
    .map_err(|e| e.to_string())?;

    let diff = brokerage_amount - old_amount;
    if old_account_id == brokerage_account_id {
        if diff.abs() > f64::EPSILON {
            tx.execute(
                "UPDATE accounts SET balance = balance + ?1 WHERE id = ?2",
                params![diff, brokerage_account_id],
            )
            .map_err(|e| e.to_string())?;
        }
    } else {
        // Move the brokerage transaction between accounts: revert old account effect and apply new amount to new account
        tx.execute(
            "UPDATE accounts SET balance = balance - ?1 WHERE id = ?2",
            params![old_amount, old_account_id],
        )
        .map_err(|e| e.to_string())?;

        tx.execute(
            "UPDATE accounts SET balance = balance + ?1 WHERE id = ?2",
            params![brokerage_amount, brokerage_account_id],
        )
        .map_err(|e| e.to_string())?;
    }

    // Try to find matching cash (transfer) transaction by linked_tx_id first, fallback to exact notes match
    let mut cash_row_opt: Option<(i32, f64, i32)> = None;

    // linked_tx_id should have been set when the brokerage transaction was created
    if let Some(linked_id_opt) = tx
        .query_row(
            "SELECT linked_tx_id FROM transactions WHERE id = ?1",
            params![id],
            |row| row.get::<_, Option<i32>>(0),
        )
        .optional()
        .map_err(|e| e.to_string())?
        .flatten()
    {
        if let Some(row) = tx
            .query_row(
                "SELECT id, amount, account_id FROM transactions WHERE id = ?1",
                params![linked_id_opt],
                |row| {
                    Ok((
                        row.get::<_, i32>(0)?,
                        row.get::<_, f64>(1)?,
                        row.get::<_, i32>(2)?,
                    ))
                },
            )
            .optional()
            .map_err(|e| e.to_string())?
        {
            cash_row_opt = Some(row);
        }
    }

    // Fallback to matching by notes if we didn't find a linked tx
    if cash_row_opt.is_none() {
        if let Some((cash_id, old_cash_amount, cash_account_id)) = tx
            .query_row(
                "SELECT id, amount, account_id FROM transactions WHERE notes = ?1 AND category = 'Transfer' LIMIT 1",
                params![old_notes],
                |row| Ok((row.get::<_, i32>(0)?, row.get::<_, f64>(1)?, row.get::<_, i32>(2)?)),
            )
            .optional()
            .map_err(|e| e.to_string())?
        {
            cash_row_opt = Some((cash_id, old_cash_amount, cash_account_id));
        }
    }

    if let Some((cash_id, old_cash_amount, cash_account_id)) = cash_row_opt {
        let new_cash_amount = if is_buy {
            -(total_price + fee)
        } else {
            total_price - fee
        };
        let cash_diff: f64 = new_cash_amount - old_cash_amount;

        tx.execute(
            "UPDATE transactions SET amount = ?1 WHERE id = ?2",
            params![new_cash_amount, cash_id],
        )
        .map_err(|e| e.to_string())?;

        // Ensure linkage between brokerage tx and cash tx
        tx.execute(
            "UPDATE transactions SET linked_tx_id = ?1 WHERE id = ?2",
            params![cash_id, id],
        )
        .map_err(|e| e.to_string())?;
        tx.execute(
            "UPDATE transactions SET linked_tx_id = ?1 WHERE id = ?2",
            params![id, cash_id],
        )
        .map_err(|e| e.to_string())?;

        if cash_diff.abs() > f64::EPSILON {
            tx.execute(
                "UPDATE accounts SET balance = balance + ?1 WHERE id = ?2",
                params![cash_diff, cash_account_id],
            )
            .map_err(|e| e.to_string())?;
        }
    }

    tx.commit().map_err(|e| e.to_string())?;

    Ok(Transaction {
        id,
        account_id: brokerage_account_id,
        date,
        payee: if is_buy {
            "Buy".to_string()
        } else {
            "Sell".to_string()
        },
        notes: Some(new_notes),
        category: Some("Investment".to_string()),
        amount: brokerage_amount,
        ticker: Some(ticker),
        shares: Some(brokerage_shares_signed),
        price_per_share: Some(price_per_share),
        fee: Some(fee),
    })
}

#[tauri::command]
fn update_brokerage_transaction(
    app_handle: AppHandle,
    args: UpdateBrokerageTransactionArgs,
) -> Result<Transaction, String> {
    let db_path = get_db_path(&app_handle)?;
    update_brokerage_transaction_db(&db_path, args)
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
async fn search_ticker(query: String) -> Result<Vec<YahooSearchQuote>, String> {
    // Delegate to the test-injectable helper that accepts a client and base url
    search_ticker_with_client(
        reqwest::Client::new(),
        "https://query1.finance.yahoo.com".to_string(),
        query,
    )
    .await
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
                                                    change_percent
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
                                                    change_percent
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

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_process::init())
        .plugin(tauri_plugin_updater::Builder::new().build())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_fs::init())
        .setup(|app| {
            init_db(app.handle())?;
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
            create_brokerage_transaction,
            update_brokerage_transaction,
            get_stock_quotes,
            update_daily_stock_prices,
            get_daily_stock_prices,
            search_ticker,
            rename_account,
            delete_account,
            // DB path commands
            set_db_path,
            reset_db_path,
            get_db_path_command,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}

#[cfg(test)]
mod tests;
