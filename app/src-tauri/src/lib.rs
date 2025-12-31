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
struct YahooChartResult {
    meta: YahooChartMeta,
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

#[derive(Serialize, Deserialize, Debug)]
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

fn get_db_path(app_handle: &AppHandle) -> Result<PathBuf, String> {
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
            .query_map([], |row| Ok(row.get::<_, String>(1)?))
            .map_err(|e| e.to_string())?;
        for col in col_iter {
            if let Ok(name) = col {
                if name == "linked_tx_id" {
                    has_linked = true;
                    break;
                }
            }
        }
        if !has_linked {
            // Safe to ALTER TABLE to add the nullable column
            conn.execute(
                "ALTER TABLE transactions ADD COLUMN linked_tx_id INTEGER",
                [],
            )
            .map_err(|e| e.to_string())?;
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

    Ok(())
}

#[tauri::command]
fn create_account(
    app_handle: AppHandle,
    name: String,
    balance: f64,
    kind: String,
) -> Result<Account, String> {
    let db_path = get_db_path(&app_handle)?;
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
fn rename_account(app_handle: AppHandle, id: i32, new_name: String) -> Result<Account, String> {
    if new_name.trim().is_empty() {
        return Err("Account name cannot be empty or whitespace-only".to_string());
    }
    let db_path = get_db_path(&app_handle)?;
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
fn delete_account(app_handle: AppHandle, id: i32) -> Result<(), String> {
    let db_path = get_db_path(&app_handle)?;
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
fn get_accounts(app_handle: AppHandle) -> Result<Vec<Account>, String> {
    let db_path = get_db_path(&app_handle)?;
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
fn create_transaction(
    app_handle: AppHandle,
    account_id: i32,
    date: String,
    payee: String,
    notes: Option<String>,
    category: Option<String>,
    amount: f64,
) -> Result<Transaction, String> {
    let db_path = get_db_path(&app_handle)?;
    let mut conn = Connection::open(db_path).map_err(|e| e.to_string())?;

    let tx = conn.transaction().map_err(|e| e.to_string())?;

    // Check if payee matches another account
    let target_account_opt: Option<i32> = tx
        .query_row(
            "SELECT id FROM accounts WHERE name = ?1 AND id != ?2",
            params![payee, account_id],
            |row| row.get(0),
        )
        .optional()
        .map_err(|e| e.to_string())?;

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
    )
    .map_err(|e| e.to_string())?;

    if let Some(target_id) = target_account_opt {
        // Get source account name for the target transaction's payee
        let source_name: String = tx
            .query_row(
                "SELECT name FROM accounts WHERE id = ?1",
                params![account_id],
                |row| row.get(0),
            )
            .map_err(|e| e.to_string())?;

        // Insert target transaction
        tx.execute(
            "INSERT INTO transactions (account_id, date, payee, notes, category, amount) VALUES (?1, ?2, ?3, ?4, ?5, ?6)",
            params![target_id, date, source_name, notes, "Transfer", -amount],
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
            params![-amount, target_id],
        )
        .map_err(|e| e.to_string())?;
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
        ticker: None,
        shares: None,
        price_per_share: None,
        fee: None,
    })
}

#[tauri::command]
fn get_transactions(app_handle: AppHandle, account_id: i32) -> Result<Vec<Transaction>, String> {
    let db_path = get_db_path(&app_handle)?;
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
fn get_all_transactions(app_handle: AppHandle) -> Result<Vec<Transaction>, String> {
    let db_path = get_db_path(&app_handle)?;
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

#[tauri::command]
fn create_brokerage_transaction(
    app_handle: AppHandle,
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

    let db_path = get_db_path(&app_handle)?;
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
fn update_transaction(
    app_handle: AppHandle,
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

    let db_path = get_db_path(&app_handle)?;
    let mut conn = Connection::open(db_path).map_err(|e| e.to_string())?;

    let tx = conn.transaction().map_err(|e| e.to_string())?;

    // Get old amount
    let old_amount: f64 = tx
        .query_row(
            "SELECT amount FROM transactions WHERE id = ?1",
            params![id],
            |row| row.get(0),
        )
        .map_err(|e| e.to_string())?;

    tx.execute(
        "UPDATE transactions SET date = ?1, payee = ?2, notes = ?3, category = ?4, amount = ?5 WHERE id = ?6",
        params![date, payee, notes, category, amount, id],
    ).map_err(|e| e.to_string())?;

    let diff = amount - old_amount;
    if diff.abs() > f64::EPSILON {
        tx.execute(
            "UPDATE accounts SET balance = balance + ?1 WHERE id = ?2",
            params![diff, account_id],
        )
        .map_err(|e| e.to_string())?;
    }

    // Try to find and update corresponding transfer transaction if any
    let mut counterpart_id_opt: Option<i32> = tx
        .query_row(
            "SELECT linked_tx_id FROM transactions WHERE id = ?1",
            params![id],
            |row| row.get(0),
        )
        .optional()
        .map_err(|e| e.to_string())?;

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

#[tauri::command]
fn update_brokerage_transaction(
    app_handle: AppHandle,
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

    let db_path = get_db_path(&app_handle)?;
    let mut conn = Connection::open(db_path).map_err(|e| e.to_string())?;

    let tx = conn.transaction().map_err(|e| e.to_string())?;

    // Get old amount and notes to locate the corresponding cash transaction
    let (old_amount, old_notes): (f64, String) = tx
        .query_row(
            "SELECT amount, notes FROM transactions WHERE id = ?1",
            params![id],
            |row| Ok((row.get(0)?, row.get(1)?)),
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

    tx.execute(
        "UPDATE transactions SET date = ?1, payee = ?2, notes = ?3, category = ?4, amount = ?5, ticker = ?6, shares = ?7, price_per_share = ?8, fee = ?9 WHERE id = ?10",
        params![
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
    if diff.abs() > f64::EPSILON {
        tx.execute(
            "UPDATE accounts SET balance = balance + ?1 WHERE id = ?2",
            params![diff, brokerage_account_id],
        )
        .map_err(|e| e.to_string())?;
    }

    // Try to find matching cash (transfer) transaction by exact notes match
    if let Some((cash_id, old_cash_amount, cash_account_id)) = tx
        .query_row(
            "SELECT id, amount, account_id FROM transactions WHERE notes = ?1 AND category = 'Transfer' LIMIT 1",
            params![old_notes],
            |row| Ok((row.get::<_, i32>(0)?, row.get::<_, f64>(1)?, row.get::<_, i32>(2)?)),
        )
        .optional()
        .map_err(|e| e.to_string())?
    {
        let new_cash_amount = if is_buy { -(total_price + fee) } else { total_price - fee };
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
fn delete_transaction(app_handle: AppHandle, id: i32) -> Result<(), String> {
    let db_path = get_db_path(&app_handle)?;
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
fn get_payees(app_handle: AppHandle) -> Result<Vec<String>, String> {
    let db_path = get_db_path(&app_handle)?;
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
fn get_categories(app_handle: AppHandle) -> Result<Vec<String>, String> {
    let db_path = get_db_path(&app_handle)?;
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
async fn search_ticker(query: String) -> Result<Vec<YahooSearchQuote>, String> {
    let url = format!(
        "https://query1.finance.yahoo.com/v1/finance/search?q={}",
        query
    );
    let client = reqwest::Client::new();
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
    if tickers.is_empty() {
        return Ok(Vec::new());
    }

    let client = reqwest::Client::builder()
        .build()
        .map_err(|e| e.to_string())?;

    let mut tasks = Vec::new();

    for ticker in tickers.clone() {
        let client = client.clone();
        tasks.push(tokio::spawn(async move {
            let url = format!("https://query1.finance.yahoo.com/v8/finance/chart/{}?interval=1d&range=1d", ticker);
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

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
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
            search_ticker,
            rename_account,
            delete_account,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
