use super::common::setup_db;
use rusqlite::{Connection, params};

#[test]
fn test_delete_transaction() {
    let (_dir, db_path) = setup_db();
    let account = crate::create_account_db(&db_path, "Test".to_string(), 100.0, "cash".to_string()).unwrap();
    let tx = crate::create_transaction_db(
        &db_path,
        account.id,
        "2023-01-01".to_string(),
        "Payee".to_string(),
        None,
        None,
        -10.0
    ).unwrap();

    crate::delete_transaction_db(&db_path, tx.id).unwrap();

    let accounts = crate::get_accounts_db(&db_path).unwrap();
    assert_eq!(accounts[0].balance, 100.0);
}

#[test]
fn test_delete_transaction_deletes_linked_counterpart() {
    let (_dir, db_path) = setup_db();
    let acc1 = crate::create_account_db(&db_path, "A1".to_string(), 100.0, "cash".to_string()).unwrap();
    let acc2 = crate::create_account_db(&db_path, "A2".to_string(), 0.0, "cash".to_string()).unwrap();

    // Create a transfer via API which should link txs
    let tx = crate::create_transaction_db(&db_path, acc1.id, "2023-01-01".to_string(), acc2.name.clone(), None, None, -30.0).unwrap();

    // Inspect DB directly to find linked tx id
    let conn = Connection::open(&db_path).unwrap();
    let linked_id_opt: Option<i32> = conn.query_row(
        "SELECT linked_tx_id FROM transactions WHERE id = ?1",
        params![tx.id],
        |row| row.get(0),
    ).unwrap();

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
    let a1_after = accounts_after.iter().find(|a| a.id == acc1.id).unwrap().balance;
    let a2_after = accounts_after.iter().find(|a| a.id == acc2.id).unwrap().balance;

    assert_eq!(a1_after, 100.0);
    assert_eq!(a2_after, 0.0);
}

#[test]
fn test_delete_transaction_fallback_by_notes() {
    let (_dir, db_path) = setup_db();
    let acc1 = crate::create_account_db(&db_path, "Acc1".to_string(), 100.0, "cash".to_string()).unwrap();
    let acc2 = crate::create_account_db(&db_path, "Acc2".to_string(), 0.0, "cash".to_string()).unwrap();

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
    ).unwrap();
    conn.execute(
        "UPDATE accounts SET balance = balance + ?1 WHERE id = ?2",
        params![20.0, acc2.id],
    ).unwrap();

    // Now delete tx1 (it has no linked_tx_id but notes match), delete should remove both
    crate::delete_transaction_db(&db_path, tx1_id).unwrap();

    let txs1 = crate::get_transactions_db(&db_path, acc1.id).unwrap();
    let txs2 = crate::get_transactions_db(&db_path, acc2.id).unwrap();

    assert!(txs1.iter().all(|t| t.id != tx1_id));
    assert!(txs2.iter().all(|t| t.id != tx2_id));

    let accounts_after = crate::get_accounts_db(&db_path).unwrap();
    let a1_after = accounts_after.iter().find(|a| a.id == acc1.id).unwrap().balance;
    let a2_after = accounts_after.iter().find(|a| a.id == acc2.id).unwrap().balance;

    assert_eq!(a1_after, 100.0);
    assert_eq!(a2_after, 0.0);
}

#[test]
fn test_delete_transaction_missing_id_should_error() {
    let (_dir, db_path) = setup_db();
    let res = crate::delete_transaction_db(&db_path, -999);
    assert!(res.is_err());
}

#[test]
fn test_delete_brokerage_transaction_deletes_linked_cash_counterpart() {
    let (_dir, db_path) = setup_db();
    let cash_acc = crate::create_account_db(&db_path, "Cash".to_string(), 500.0, "cash".to_string()).unwrap();
    let brokerage_acc = crate::create_account_db(&db_path, "Broker".to_string(), 1000.0, "investment".to_string()).unwrap();

    let args = crate::CreateBrokerageTransactionArgs {
        brokerage_account_id: brokerage_acc.id,
        cash_account_id: cash_acc.id,
        date: "2023-01-01".to_string(),
        ticker: "FOO".to_string(),
        shares: 2.0,
        price_per_share: 100.0,
        fee: 1.0,
        is_buy: true,
    };

    let created = crate::create_brokerage_transaction_db(&db_path, args).unwrap();

    // Confirm both transactions exist
    let brokerage_txs = crate::get_transactions_db(&db_path, brokerage_acc.id).unwrap();
    let cash_txs = crate::get_transactions_db(&db_path, cash_acc.id).unwrap();
    assert!(brokerage_txs.len() >= 1);
    assert!(cash_txs.iter().any(|t| t.category.as_deref() == Some("Transfer")));

    // Delete the brokerage transaction
    crate::delete_transaction_db(&db_path, created.id).unwrap();

    let brokerage_txs_after = crate::get_transactions_db(&db_path, brokerage_acc.id).unwrap();
    let cash_txs_after = crate::get_transactions_db(&db_path, cash_acc.id).unwrap();

    // Both should be gone (except opening balances)
    assert!(brokerage_txs_after.iter().all(|t| t.id != created.id));
    assert!(cash_txs_after.iter().all(|t| t.category.as_deref() != Some("Transfer")));

    // Balances restored
    let accounts_after = crate::get_accounts_db(&db_path).unwrap();
    let cash_after = accounts_after.iter().find(|a| a.id == cash_acc.id).unwrap().balance;
    let broker_after = accounts_after.iter().find(|a| a.id == brokerage_acc.id).unwrap().balance;

    assert_eq!(cash_after, 500.0);
    assert_eq!(broker_after, 1000.0);
}
