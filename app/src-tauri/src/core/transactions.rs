use crate::models::Transaction;
use rusqlite::{params, Connection, OptionalExtension};
use std::path::PathBuf;
use tauri::AppHandle;

#[derive(serde::Deserialize)]
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
    pub currency: Option<String>,
}

pub fn create_transaction_db(
    db_path: &PathBuf,
    args: CreateTransactionArgs,
) -> Result<Transaction, String> {
    let mut conn = Connection::open(db_path).map_err(|e| e.to_string())?;

    // Apply rules before starting transaction
    let rules = crate::rules::get_rules_db(db_path).unwrap_or_default();
    let mut temp_tx = Transaction {
        id: 0,
        account_id: args.account_id,
        date: args.date.clone(),
        payee: args.payee.clone(),
        notes: args.notes.clone(),
        category: args.category.clone(),
        amount: args.amount,
        ticker: args.ticker.clone(),
        shares: args.shares,
        price_per_share: args.price_per_share,
        fee: args.fee,
        currency: args.currency.clone(),
    };
    crate::rules::apply_rules_to_transaction(&mut temp_tx, &rules);

    let final_payee = temp_tx.payee;
    let final_notes = temp_tx.notes;
    let final_category_from_rules = temp_tx.category;

    let tx = conn.transaction().map_err(|e| e.to_string())?;

    // Check if payee matches another account for Transfer detection
    let target_account_info: Option<i32> = tx
        .query_row(
            "SELECT id FROM accounts WHERE name = ?1 AND id != ?2",
            params![final_payee, args.account_id],
            |row| row.get(0),
        )
        .optional()
        .map_err(|e| e.to_string())?;

    let final_category = if target_account_info.is_some() {
        Some("Transfer".to_string())
    } else {
        final_category_from_rules
    };

    tx.execute(
        "INSERT INTO transactions (account_id, date, payee, notes, category, amount, ticker, shares, price_per_share, fee, currency) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11)",
        params![args.account_id, args.date, final_payee, final_notes, final_category, args.amount, args.ticker, args.shares, args.price_per_share, args.fee, args.currency],
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
        payee: final_payee,
        notes: final_notes,
        category: final_category,
        amount: args.amount,
        ticker: args.ticker,
        shares: args.shares,
        price_per_share: args.price_per_share,
        fee: args.fee,
        currency: args.currency,
    })
}

pub fn get_transactions_db(db_path: &PathBuf, account_id: i32) -> Result<Vec<Transaction>, String> {
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

pub fn get_all_transactions_db(db_path: &PathBuf) -> Result<Vec<Transaction>, String> {
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

// Payees and categories helpers moved from `lib.rs` here
pub fn get_payees_db(db_path: &PathBuf) -> Result<Vec<String>, String> {
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

pub fn get_categories_db(db_path: &PathBuf) -> Result<Vec<String>, String> {
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

#[derive(serde::Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CreateInvestmentTransactionArgs {
    pub account_id: i32,
    pub date: String,
    pub ticker: String,
    pub shares: f64,
    pub price_per_share: f64,
    pub fee: f64,
    pub is_buy: bool,
    pub currency: Option<String>,
}

pub fn create_investment_transaction_db(
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

    // Apply rules
    let rules = crate::rules::get_rules_db(db_path).unwrap_or_default();
    let is_buy_local = is_buy; // avoid move issues
    let mut temp_tx = Transaction {
        id: 0,
        account_id,
        date: date.clone(),
        payee: if is_buy_local {
            "Buy".to_string()
        } else {
            "Sell".to_string()
        },
        notes: Some(format!(
            "{} {} shares of {}",
            if is_buy_local { "Bought" } else { "Sold" },
            shares,
            ticker
        )),
        category: Some("Investment".to_string()),
        amount: if is_buy_local {
            -(shares * price_per_share + fee)
        } else {
            shares * price_per_share - fee
        },
        ticker: Some(ticker.clone()),
        shares: Some(if is_buy_local { shares } else { -shares }),
        price_per_share: Some(price_per_share),
        fee: Some(fee),
        currency: currency.clone(),
    };
    crate::rules::apply_rules_to_transaction(&mut temp_tx, &rules);

    let final_payee = temp_tx.payee;
    let final_notes = temp_tx.notes;
    let final_category = temp_tx.category;

    let tx = conn.transaction().map_err(|e| e.to_string())?;

    let total_price = shares * price_per_share;
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
            final_payee,
            final_notes,
            final_category,
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
        payee: final_payee,
        notes: final_notes,
        category: final_category,
        amount,
        ticker: Some(ticker),
        shares: Some(investment_shares),
        price_per_share: Some(price_per_share),
        fee: Some(fee),
        currency,
    })
}

#[derive(serde::Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct UpdateTransactionArgs {
    pub id: i32,
    pub account_id: i32,
    pub date: String,
    pub payee: String,
    pub notes: Option<String>,
    pub category: Option<String>,
    pub amount: f64,
    pub currency: Option<String>,
}

pub fn update_transaction_db(
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

#[derive(serde::Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct UpdateInvestmentTransactionArgs {
    pub id: i32,
    pub account_id: i32,
    pub date: String,
    pub ticker: String,
    pub shares: f64,
    pub price_per_share: f64,
    pub fee: f64,
    pub is_buy: bool,
    pub notes: Option<String>,
    pub currency: Option<String>,
}

pub fn update_investment_transaction_db(
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

pub fn delete_transaction_db(db_path: &PathBuf, id: i32) -> Result<(), String> {
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
pub fn create_transaction(
    app_handle: AppHandle,
    args: CreateTransactionArgs,
) -> Result<Transaction, String> {
    let db_path = crate::db_init::get_db_path(&app_handle)?;
    create_transaction_db(&db_path, args)
}

#[tauri::command]
pub fn get_transactions(
    app_handle: AppHandle,
    account_id: i32,
) -> Result<Vec<Transaction>, String> {
    let db_path = crate::db_init::get_db_path(&app_handle)?;
    get_transactions_db(&db_path, account_id)
}

#[tauri::command]
pub fn get_all_transactions(app_handle: AppHandle) -> Result<Vec<Transaction>, String> {
    let db_path = crate::db_init::get_db_path(&app_handle)?;
    get_all_transactions_db(&db_path)
}

#[tauri::command]
pub fn create_investment_transaction(
    app_handle: AppHandle,
    args: CreateInvestmentTransactionArgs,
) -> Result<Transaction, String> {
    let db_path = crate::db_init::get_db_path(&app_handle)?;
    create_investment_transaction_db(&db_path, args)
}

#[tauri::command]
pub fn update_transaction(
    app_handle: AppHandle,
    args: UpdateTransactionArgs,
) -> Result<Transaction, String> {
    let db_path = crate::db_init::get_db_path(&app_handle)?;
    update_transaction_db(&db_path, args)
}

#[tauri::command]
pub fn update_investment_transaction(
    app_handle: AppHandle,
    args: UpdateInvestmentTransactionArgs,
) -> Result<Transaction, String> {
    let db_path = crate::db_init::get_db_path(&app_handle)?;
    update_investment_transaction_db(&db_path, args)
}

#[tauri::command]
pub fn delete_transaction(app_handle: AppHandle, id: i32) -> Result<(), String> {
    let db_path = crate::db_init::get_db_path(&app_handle)?;
    delete_transaction_db(&db_path, id)
}

#[tauri::command]
pub fn get_payees(app_handle: AppHandle) -> Result<Vec<String>, String> {
    let db_path = crate::db_init::get_db_path(&app_handle)?;
    get_payees_db(&db_path)
}

#[tauri::command]
pub fn get_categories(app_handle: AppHandle) -> Result<Vec<String>, String> {
    let db_path = crate::db_init::get_db_path(&app_handle)?;
    get_categories_db(&db_path)
}
