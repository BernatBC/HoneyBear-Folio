use rusqlite::{params, Connection, OptionalExtension};
use std::path::PathBuf;
use crate::models::{Account, AccountsSummary};

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
