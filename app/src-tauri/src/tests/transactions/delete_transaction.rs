use super::common::setup_db;
use rusqlite::{params, Connection};

#[test]
fn test_delete_transaction() {
    let (_dir, db_path) = setup_db();
    let account = crate::create_account_db(&db_path, "Test".to_string(), 100.0).unwrap();
    let tx = crate::create_transaction_db(
        &db_path,
        crate::CreateTransactionArgs {
            account_id: account.id,
            date: "2023-01-01".to_string(),
            payee: "Payee".to_string(),
            notes: None,
            category: None,
            amount: -10.0,
            ticker: None,
            shares: None,
            price_per_share: None,
            fee: None,
            currency: None,
        },
    )
    .unwrap();

    crate::delete_transaction_db(&db_path, tx.id).unwrap();

    let accounts = crate::get_accounts_db(&db_path).unwrap();
    assert_eq!(accounts[0].balance, 100.0);
}

#[test]
fn test_delete_transaction_deletes_linked_counterpart() {
    let (_dir, db_path) = setup_db();
    let acc1 = crate::create_account_db(&db_path, "A1".to_string(), 100.0).unwrap();
    let acc2 = crate::create_account_db(&db_path, "A2".to_string(), 0.0).unwrap();

    // Create a transfer via API which should link txs
    let tx = crate::create_transaction_db(
        &db_path,
        crate::CreateTransactionArgs {
            account_id: acc1.id,
            date: "2023-01-01".to_string(),
            payee: acc2.name.clone(),
            notes: None,
            category: None,
            amount: -30.0,
            ticker: None,
            shares: None,
            price_per_share: None,
            fee: None,
            currency: None,
        },
    )
    .unwrap();

    // Inspect DB directly to find linked tx id
    let conn = Connection::open(&db_path).unwrap();
    let linked_id_opt: Option<i32> = conn
        .query_row(
            "SELECT linked_tx_id FROM transactions WHERE id = ?1",
            params![tx.id],
            |row| row.get(0),
        )
        .unwrap();

    assert!(linked_id_opt.is_some());

    // balances before delete
    let accounts = crate::get_accounts_db(&db_path).unwrap();
    let a1_before = accounts.iter().find(|a| a.id == acc1.id).unwrap().balance;
    let a2_before = accounts.iter().find(|a| a.id == acc2.id).unwrap().balance;
    assert_eq!(a1_before, 70.0);
    assert_eq!(a2_before, 30.0);

    // Delete the first transaction
    crate::delete_transaction_db(&db_path, tx.id).unwrap();

    // After delete, both transactions should be gone and balances restored
    let txs1 = crate::get_transactions_db(&db_path, acc1.id).unwrap();
    let txs2 = crate::get_transactions_db(&db_path, acc2.id).unwrap();

    // acc1 had only opening balance and transfer; after deletion it should have only opening balance
    // However opening balance in acc2 was not created (0 initial), so both should have no transfer entries
    assert!(txs1.iter().all(|t| t.id != tx.id));
    if let Some(linked_id) = linked_id_opt {
        assert!(txs2.iter().all(|t| t.id != linked_id));
    }

    let accounts_after = crate::get_accounts_db(&db_path).unwrap();
    let a1_after = accounts_after
        .iter()
        .find(|a| a.id == acc1.id)
        .unwrap()
        .balance;
    let a2_after = accounts_after
        .iter()
        .find(|a| a.id == acc2.id)
        .unwrap()
        .balance;

    assert_eq!(a1_after, 100.0);
    assert_eq!(a2_after, 0.0);
}

#[test]
fn test_delete_transaction_fallback_by_notes() {
    let (_dir, db_path) = setup_db();
    let acc1 = crate::create_account_db(&db_path, "Acc1".to_string(), 100.0).unwrap();
    let acc2 = crate::create_account_db(&db_path, "Acc2".to_string(), 0.0).unwrap();

    // Insert two transactions manually with matching notes but no linked_tx_id
    let conn = Connection::open(&db_path).unwrap();
    conn.execute(
        "INSERT INTO transactions (account_id, date, payee, notes, category, amount) VALUES (?1, ?2, ?3, ?4, ?5, ?6)",
        params![acc1.id, "2023-01-01", acc2.name, "XFER", "Transfer", -20.0],
    ).unwrap();
    let tx1_id = conn.last_insert_rowid() as i32;

    conn.execute(
        "INSERT INTO transactions (account_id, date, payee, notes, category, amount) VALUES (?1, ?2, ?3, ?4, ?5, ?6)",
        params![acc2.id, "2023-01-01", acc1.name, "XFER", "Transfer", 20.0],
    ).unwrap();
    let tx2_id = conn.last_insert_rowid() as i32;

    // Adjust balances to reflect those transactions
    conn.execute(
        "UPDATE accounts SET balance = balance + ?1 WHERE id = ?2",
        params![-20.0, acc1.id],
    )
    .unwrap();
    conn.execute(
        "UPDATE accounts SET balance = balance + ?1 WHERE id = ?2",
        params![20.0, acc2.id],
    )
    .unwrap();

    // Now delete tx1 (it has no linked_tx_id but notes match), delete should remove both
    crate::delete_transaction_db(&db_path, tx1_id).unwrap();

    let txs1 = crate::get_transactions_db(&db_path, acc1.id).unwrap();
    let txs2 = crate::get_transactions_db(&db_path, acc2.id).unwrap();

    assert!(txs1.iter().all(|t| t.id != tx1_id));
    assert!(txs2.iter().all(|t| t.id != tx2_id));

    let accounts_after = crate::get_accounts_db(&db_path).unwrap();
    let a1_after = accounts_after
        .iter()
        .find(|a| a.id == acc1.id)
        .unwrap()
        .balance;
    let a2_after = accounts_after
        .iter()
        .find(|a| a.id == acc2.id)
        .unwrap()
        .balance;

    assert_eq!(a1_after, 100.0);
    assert_eq!(a2_after, 0.0);
}

#[test]
fn test_delete_transaction_missing_id_should_error() {
    let (_dir, db_path) = setup_db();
    let res = crate::delete_transaction_db(&db_path, -999);
    assert!(res.is_err());
}
