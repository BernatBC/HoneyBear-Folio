use rusqlite::{params, Connection, OptionalExtension};
use std::path::PathBuf;
use crate::models::{Account, AccountsSummary};
use tauri::AppHandle;
use std::collections::{HashMap, HashSet};

pub fn create_account_db(
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

    tx.execute(
        "INSERT INTO accounts (name, balance, currency) VALUES (?1, ?2, ?3)",
        params![name_trimmed, balance_to_set, currency],
    )
    .map_err(|e| e.to_string())?;

    let id = tx.last_insert_rowid() as i32;

    // Create opening transaction if balance is non-zero
    if balance.abs() > f64::EPSILON {
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

pub fn rename_account_db(db_path: &PathBuf, id: i32, new_name: String) -> Result<Account, String> {
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

    conn.execute("UPDATE accounts SET name = ?1 WHERE id = ?2", params![new_trim, id])
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

pub fn update_account_db(
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

pub fn delete_account_db(db_path: &PathBuf, id: i32) -> Result<(), String> {
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

pub fn get_accounts_db(db_path: &PathBuf) -> Result<Vec<Account>, String> {
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

pub fn get_accounts_summary_db(db_path: &PathBuf, target: &str) -> Result<AccountsSummary, String> {
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

#[tauri::command]
pub fn create_account(
    app_handle: AppHandle,
    name: String,
    balance: f64,
    currency: Option<String>,
) -> Result<Account, String> {
    let db_path = crate::db_init::get_db_path(&app_handle)?;
    create_account_db(&db_path, name, balance, currency)
}

#[tauri::command]
pub fn rename_account(app_handle: AppHandle, id: i32, new_name: String) -> Result<Account, String> {
    let db_path = crate::db_init::get_db_path(&app_handle)?;
    rename_account_db(&db_path, id, new_name)
}

#[tauri::command]
pub fn update_account(
    app_handle: AppHandle,
    id: i32,
    name: String,
    currency: Option<String>,
) -> Result<Account, String> {
    let db_path = crate::db_init::get_db_path(&app_handle)?;
    update_account_db(&db_path, id, name, currency)
}

#[tauri::command]
pub fn delete_account(app_handle: AppHandle, id: i32) -> Result<(), String> {
    let db_path = crate::db_init::get_db_path(&app_handle)?;
    delete_account_db(&db_path, id)
}

#[tauri::command]
pub async fn get_accounts(
    app_handle: AppHandle,
    target_currency: Option<String>,
) -> Result<Vec<Account>, String> {
    let db_path = crate::db_init::get_db_path(&app_handle)?;
    let target = target_currency.unwrap_or_else(|| "USD".to_string());

    let db_path_clone = db_path.clone();
    let target_clone = target.clone();

    // Use spawn_blocking for DB operations
    let summary = tauri::async_runtime::spawn_blocking(move || {
        get_accounts_summary_db(&db_path_clone, &target_clone)
    })
    .await
    .map_err(|e| e.to_string())??;

    let accounts = summary.accounts;
    let raw_data = summary.raw_data;

    // Load custom rates
    let custom_rates = crate::utils::get_custom_rates_map(&db_path)?;

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

    // 1. Identify all unique currencies involved
    let mut all_currencies = HashSet::new();
    all_currencies.insert(target.clone());
    for acc in &accounts {
        if let Some(c) = &acc.currency {
            all_currencies.insert(c.clone());
        }
    }
    for (_, tx_curr, _) in &raw_data {
        all_currencies.insert(tx_curr.clone());
    }

    // 2. Identify yahoo currencies (non-USD, non-custom)
    // We treat anything not in custom_rates as potentially on Yahoo.
    // We will verify by fetching X->USD for all of them.
    let mut yahoo_currencies = HashSet::new();
    for c in &all_currencies {
        if c != "USD" && !custom_rates.contains_key(c) {
            yahoo_currencies.insert(c.clone());
        }
    }

    // 3. Always fetch USD fallback for all yahoo currencies
    for c in &yahoo_currencies {
        tickers_to_fetch.insert(format!("{}USD=X", c));
    }

    // 4. Also fetch direct pairs if both sides are likely on Yahoo (to prefer direct rate)
    for (acc_id, tx_curr, _) in &raw_data {
        let acc_currency = account_currency_map.get(acc_id).unwrap_or(&target);
        if tx_curr != acc_currency {
            // If both are yahoo currencies (or USD), try fetching direct pair
            let is_yahoo_or_usd = |c: &String| c == "USD" || yahoo_currencies.contains(c);
            if is_yahoo_or_usd(tx_curr) && is_yahoo_or_usd(acc_currency) {
                tickers_to_fetch.insert(format!("{}{}=X", tx_curr, acc_currency));
            }
        }
    }

    // Also for account currency -> target currency
    for acc in &accounts {
        if let Some(acc_curr) = &acc.currency {
            if acc_curr != &target {
                let is_yahoo_or_usd = |c: &String| c == "USD" || yahoo_currencies.contains(c);
                if is_yahoo_or_usd(acc_curr) && is_yahoo_or_usd(&target) {
                    tickers_to_fetch.insert(format!("{}{}=X", acc_curr, target));
                }
            }
        }
    }

    let mut rates = HashMap::new();
    if !tickers_to_fetch.is_empty() {
        let tickers: Vec<String> = tickers_to_fetch.into_iter().collect();
        let client = reqwest::Client::builder()
            .build()
            .map_err(|e| e.to_string())?;

        let quotes = crate::markets::get_stock_quotes_with_client(
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

    let accounts = crate::utils::calculate_account_balances(accounts, raw_data, &target, &rates, &custom_rates);
    Ok(accounts)
}
