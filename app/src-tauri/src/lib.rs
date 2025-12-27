use rusqlite::{params, Connection, OptionalExtension};
use serde::{Deserialize, Serialize};
use tauri::{AppHandle, Manager};
use std::path::PathBuf;
use std::fs;

#[derive(Serialize, Deserialize, Debug)]
struct Account {
    id: i32,
    name: String,
    balance: f64,
}

#[derive(Serialize, Deserialize, Debug)]
struct Transaction {
    id: i32,
    account_id: i32,
    date: String,
    payee: String,
    notes: Option<String>,
    category: Option<String>,
    amount: f64,
}

fn get_db_path(app_handle: &AppHandle) -> Result<PathBuf, String> {
    let app_dir = app_handle.path().app_data_dir().map_err(|e| e.to_string())?;
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
            balance REAL NOT NULL
        )",
        [],
    ).map_err(|e| e.to_string())?;

    conn.execute(
        "CREATE TABLE IF NOT EXISTS transactions (
            id INTEGER PRIMARY KEY,
            account_id INTEGER NOT NULL,
            date TEXT NOT NULL,
            payee TEXT NOT NULL,
            notes TEXT,
            category TEXT,
            amount REAL NOT NULL,
            FOREIGN KEY(account_id) REFERENCES accounts(id)
        )",
        [],
    ).map_err(|e| e.to_string())?;
    
    Ok(())
}

#[tauri::command]
fn create_account(app_handle: AppHandle, name: String, balance: f64) -> Result<Account, String> {
    let db_path = get_db_path(&app_handle)?;
    let conn = Connection::open(db_path).map_err(|e| e.to_string())?;
    
    conn.execute(
        "INSERT INTO accounts (name, balance) VALUES (?1, ?2)",
        params![name, balance],
    ).map_err(|e| e.to_string())?;
    
    let id = conn.last_insert_rowid() as i32;
    
    Ok(Account {
        id,
        name,
        balance,
    })
}

#[tauri::command]
fn get_accounts(app_handle: AppHandle) -> Result<Vec<Account>, String> {
    let db_path = get_db_path(&app_handle)?;
    let conn = Connection::open(db_path).map_err(|e| e.to_string())?;
    
    let mut stmt = conn.prepare("SELECT id, name, balance FROM accounts").map_err(|e| e.to_string())?;
    let account_iter = stmt.query_map([], |row| {
        Ok(Account {
            id: row.get(0)?,
            name: row.get(1)?,
            balance: row.get(2)?,
        })
    }).map_err(|e| e.to_string())?;
    
    let mut accounts = Vec::new();
    for account in account_iter {
        accounts.push(account.map_err(|e| e.to_string())?);
    }
    
    Ok(accounts)
}

#[tauri::command]
fn create_transaction(
    app_handle: AppHandle, 
    account_id: i32, 
    date: String, 
    payee: String, 
    notes: Option<String>, 
    category: Option<String>, 
    amount: f64
) -> Result<Transaction, String> {
    let db_path = get_db_path(&app_handle)?;
    let mut conn = Connection::open(db_path).map_err(|e| e.to_string())?;
    
    let tx = conn.transaction().map_err(|e| e.to_string())?;

    // Check if payee matches another account
    let target_account_opt: Option<i32> = tx.query_row(
        "SELECT id FROM accounts WHERE name = ?1 AND id != ?2",
        params![payee, account_id],
        |row| row.get(0),
    ).optional().map_err(|e| e.to_string())?;

    let final_category = if target_account_opt.is_some() {
        Some("Transfer".to_string())
    } else {
        category.clone()
    };

    tx.execute(
        "INSERT INTO transactions (account_id, date, payee, notes, category, amount) VALUES (?1, ?2, ?3, ?4, ?5, ?6)",
        params![account_id, date, payee, notes, final_category, amount],
    ).map_err(|e| e.to_string())?;
    
    let id = tx.last_insert_rowid() as i32;

    tx.execute(
        "UPDATE accounts SET balance = balance + ?1 WHERE id = ?2",
        params![amount, account_id],
    ).map_err(|e| e.to_string())?;

    if let Some(target_id) = target_account_opt {
        // Get source account name for the target transaction's payee
        let source_name: String = tx.query_row(
            "SELECT name FROM accounts WHERE id = ?1",
            params![account_id],
            |row| row.get(0),
        ).map_err(|e| e.to_string())?;

        // Insert target transaction
        tx.execute(
            "INSERT INTO transactions (account_id, date, payee, notes, category, amount) VALUES (?1, ?2, ?3, ?4, ?5, ?6)",
            params![target_id, date, source_name, notes, "Transfer", -amount],
        ).map_err(|e| e.to_string())?;

        // Update target account balance
        tx.execute(
            "UPDATE accounts SET balance = balance + ?1 WHERE id = ?2",
            params![-amount, target_id],
        ).map_err(|e| e.to_string())?;
    }

    tx.commit().map_err(|e| e.to_string())?;
    
    Ok(Transaction {
        id,
        account_id,
        date,
        payee,
        notes,
        category: final_category,
        amount,
    })
}

#[tauri::command]
fn get_transactions(app_handle: AppHandle, account_id: i32) -> Result<Vec<Transaction>, String> {
    let db_path = get_db_path(&app_handle)?;
    let conn = Connection::open(db_path).map_err(|e| e.to_string())?;
    
    let mut stmt = conn.prepare("SELECT id, account_id, date, payee, notes, category, amount FROM transactions WHERE account_id = ?1 ORDER BY date DESC, id DESC").map_err(|e| e.to_string())?;
    let transaction_iter = stmt.query_map(params![account_id], |row| {
        Ok(Transaction {
            id: row.get(0)?,
            account_id: row.get(1)?,
            date: row.get(2)?,
            payee: row.get(3)?,
            notes: row.get(4)?,
            category: row.get(5)?,
            amount: row.get(6)?,
        })
    }).map_err(|e| e.to_string())?;
    
    let mut transactions = Vec::new();
    for transaction in transaction_iter {
        transactions.push(transaction.map_err(|e| e.to_string())?);
    }
    
    Ok(transactions)
}

#[tauri::command]
fn get_all_transactions(app_handle: AppHandle) -> Result<Vec<Transaction>, String> {
    let db_path = get_db_path(&app_handle)?;
    let conn = Connection::open(db_path).map_err(|e| e.to_string())?;
    
    let mut stmt = conn.prepare("SELECT id, account_id, date, payee, notes, category, amount FROM transactions ORDER BY date DESC, id DESC").map_err(|e| e.to_string())?;
    let transaction_iter = stmt.query_map([], |row| {
        Ok(Transaction {
            id: row.get(0)?,
            account_id: row.get(1)?,
            date: row.get(2)?,
            payee: row.get(3)?,
            notes: row.get(4)?,
            category: row.get(5)?,
            amount: row.get(6)?,
        })
    }).map_err(|e| e.to_string())?;
    
    let mut transactions = Vec::new();
    for transaction in transaction_iter {
        transactions.push(transaction.map_err(|e| e.to_string())?);
    }
    
    Ok(transactions)
}

#[tauri::command]
fn update_transaction(
    app_handle: AppHandle,
    id: i32,
    account_id: i32,
    date: String,
    payee: String,
    notes: Option<String>,
    category: Option<String>,
    amount: f64
) -> Result<Transaction, String> {
    let db_path = get_db_path(&app_handle)?;
    let mut conn = Connection::open(db_path).map_err(|e| e.to_string())?;
    
    let tx = conn.transaction().map_err(|e| e.to_string())?;

    // Get old amount
    let old_amount: f64 = tx.query_row(
        "SELECT amount FROM transactions WHERE id = ?1",
        params![id],
        |row| row.get(0),
    ).map_err(|e| e.to_string())?;

    tx.execute(
        "UPDATE transactions SET date = ?1, payee = ?2, notes = ?3, category = ?4, amount = ?5 WHERE id = ?6",
        params![date, payee, notes, category, amount, id],
    ).map_err(|e| e.to_string())?;

    let diff = amount - old_amount;
    if diff.abs() > f64::EPSILON {
        tx.execute(
            "UPDATE accounts SET balance = balance + ?1 WHERE id = ?2",
            params![diff, account_id],
        ).map_err(|e| e.to_string())?;
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
    })
}

#[tauri::command]
fn delete_transaction(app_handle: AppHandle, id: i32) -> Result<(), String> {
    let db_path = get_db_path(&app_handle)?;
    let mut conn = Connection::open(db_path).map_err(|e| e.to_string())?;
    
    let tx = conn.transaction().map_err(|e| e.to_string())?;

    // Get amount and account_id
    let (amount, account_id): (f64, i32) = tx.query_row(
        "SELECT amount, account_id FROM transactions WHERE id = ?1",
        params![id],
        |row| Ok((row.get(0)?, row.get(1)?)),
    ).map_err(|e| e.to_string())?;

    tx.execute(
        "DELETE FROM transactions WHERE id = ?1",
        params![id],
    ).map_err(|e| e.to_string())?;

    tx.execute(
        "UPDATE accounts SET balance = balance - ?1 WHERE id = ?2",
        params![amount, account_id],
    ).map_err(|e| e.to_string())?;

    tx.commit().map_err(|e| e.to_string())?;
    
    Ok(())
}

#[tauri::command]
fn get_payees(app_handle: AppHandle) -> Result<Vec<String>, String> {
    let db_path = get_db_path(&app_handle)?;
    let conn = Connection::open(db_path).map_err(|e| e.to_string())?;
    
    let mut stmt = conn.prepare("SELECT DISTINCT payee FROM transactions ORDER BY payee").map_err(|e| e.to_string())?;
    let payee_iter = stmt.query_map([], |row| row.get(0)).map_err(|e| e.to_string())?;
    
    let mut payees = Vec::new();
    for payee in payee_iter {
        payees.push(payee.map_err(|e| e.to_string())?);
    }
    
    Ok(payees)
}

#[tauri::command]
fn get_categories(app_handle: AppHandle) -> Result<Vec<String>, String> {
    let db_path = get_db_path(&app_handle)?;
    let conn = Connection::open(db_path).map_err(|e| e.to_string())?;
    
    let mut stmt = conn.prepare("SELECT DISTINCT category FROM transactions WHERE category IS NOT NULL AND category != 'Transfer' ORDER BY category").map_err(|e| e.to_string())?;
    let cat_iter = stmt.query_map([], |row| row.get(0)).map_err(|e| e.to_string())?;
    
    let mut categories = Vec::new();
    for cat in cat_iter {
        categories.push(cat.map_err(|e| e.to_string())?);
    }
    
    Ok(categories)
}

#[tauri::command]
fn greet(name: &str) -> String {
    format!("Hello, {}! You've been greeted from Rust!", name)
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .setup(|app| {
            init_db(app.handle())?;
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            greet, 
            create_account, 
            get_accounts, 
            create_transaction, 
            get_transactions,
            get_all_transactions,
            update_transaction,
            delete_transaction,
            get_payees,
            get_categories
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
