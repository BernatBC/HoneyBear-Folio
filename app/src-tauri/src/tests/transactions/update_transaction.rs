use super::common::setup_db;
use rusqlite::{params, Connection};

#[test]
fn test_update_transaction() {
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
            fee: None,            currency: None,        },
    )
    .unwrap();

    let args = crate::UpdateTransactionArgs {
        id: tx.id,
        account_id: account.id,
        date: "2023-01-02".to_string(),
        payee: "New Payee".to_string(),
        notes: Some("Updated".to_string()),
        category: Some("Food".to_string()),
        amount: -20.0,
        currency: None,
    };

    crate::update_transaction_db(&db_path, args).unwrap();

    let accounts = crate::get_accounts_db(&db_path).unwrap();
    // Balance: 100 - 20 = 80
    assert_eq!(accounts[0].balance, 80.0);
}

#[test]
fn test_update_transaction_missing_id_should_error() {
    let (_dir, db_path) = setup_db();
    let args = crate::UpdateTransactionArgs {
        id: -999,
        account_id: 1,
        date: "2023-01-01".to_string(),
        payee: "X".to_string(),
        notes: None,
        category: None,
        amount: 10.0,
        currency: None,
    };

    let res = crate::update_transaction_db(&db_path, args);
    assert!(res.is_err());
}

#[test]
fn test_update_transaction_finds_counterpart_by_notes() {
    let (_dir, db_path) = setup_db();
    let acc1 = crate::create_account_db(&db_path, "Acc1".to_string(), 100.0).unwrap();
    let acc2 = crate::create_account_db(&db_path, "Acc2".to_string(), 0.0).unwrap();

    // Insert two transactions manually without linked_tx_id but with matching notes
    let conn = Connection::open(&db_path).unwrap();
    conn.execute(
        "INSERT INTO transactions (account_id, date, payee, notes, category, amount) VALUES (?1, ?2, ?3, ?4, ?5, ?6)",
        params![acc1.id, "2023-01-01", acc2.name, "XFER", "Transfer", -50.0],
    ).unwrap();
    let tx1_id = conn.last_insert_rowid() as i32;

    conn.execute(
        "INSERT INTO transactions (account_id, date, payee, notes, category, amount) VALUES (?1, ?2, ?3, ?4, ?5, ?6)",
        params![acc2.id, "2023-01-01", acc1.name, "XFER", "Transfer", 50.0],
    ).unwrap();
    let _tx2_id = conn.last_insert_rowid() as i32;

    // Adjust account balances to reflect those transactions
    conn.execute(
        "UPDATE accounts SET balance = balance + ?1 WHERE id = ?2",
        params![-50.0, acc1.id],
    )
    .unwrap();
    conn.execute(
        "UPDATE accounts SET balance = balance + ?1 WHERE id = ?2",
        params![50.0, acc2.id],
    )
    .unwrap();

    // Now update tx1 amount to -60.0 using update_transaction_db which should find counterpart by notes
    let args = crate::UpdateTransactionArgs {
        id: tx1_id,
        account_id: acc1.id,
        date: "2023-01-02".to_string(),
        payee: acc2.name.clone(),
        notes: Some("XFER".to_string()),
        category: Some("Transfer".to_string()),
        amount: -60.0,
        currency: None,
    };

    crate::update_transaction_db(&db_path, args).unwrap();

    // Verify balances updated: acc1: 100 - 60 = 40, acc2: 0 + 60 = 60
    let accounts = crate::get_accounts_db(&db_path).unwrap();
    let a1 = accounts.iter().find(|a| a.id == acc1.id).unwrap();
    let a2 = accounts.iter().find(|a| a.id == acc2.id).unwrap();

    assert_eq!(a1.balance, 40.0);
    assert_eq!(a2.balance, 60.0);

    // Verify counterpart transaction amount updated to 60.0 and payee set to source account name
    let txs2 = crate::get_transactions_db(&db_path, acc2.id).unwrap();
    assert_eq!(txs2.len(), 1);
    assert_eq!(txs2[0].amount, 60.0);
    assert_eq!(txs2[0].payee, acc1.name);
}

#[test]
fn test_update_transaction_updates_counterpart_when_linked() {
    let (_dir, db_path) = setup_db();
    let acc1 = crate::create_account_db(&db_path, "Acc1".to_string(), 100.0).unwrap();
    let acc2 = crate::create_account_db(&db_path, "Acc2".to_string(), 0.0).unwrap();

    // Create transfer via API which should link txs
    let tx = crate::create_transaction_db(
        &db_path,
        crate::CreateTransactionArgs {
            account_id: acc1.id,
            date: "2023-01-01".to_string(),
            payee: acc2.name.clone(),
            notes: Some("X".to_string()),
            category: None,
            amount: -40.0,
            ticker: None,
            shares: None,
            price_per_share: None,
            fee: None,
            currency: None,
        },
    )
    .unwrap();

    // Verify counterpart exists
    let txs2 = crate::get_transactions_db(&db_path, acc2.id).unwrap();
    assert_eq!(txs2.len(), 1);

    // Update original tx amount to -50.0 -- counterpart should update and balances adjust
    let args = crate::UpdateTransactionArgs {
        id: tx.id,
        account_id: acc1.id,
        date: "2023-01-02".to_string(),
        payee: acc2.name.clone(),
        notes: Some("X".to_string()),
        category: Some("Transfer".to_string()),
        amount: -50.0,
        currency: None,
    };

    crate::update_transaction_db(&db_path, args).unwrap();

    let accounts = crate::get_accounts_db(&db_path).unwrap();
    let a1 = accounts.iter().find(|a| a.id == acc1.id).unwrap();
    let a2 = accounts.iter().find(|a| a.id == acc2.id).unwrap();

    assert_eq!(a1.balance, 50.0);
    assert_eq!(a2.balance, 50.0);

    let txs2_after = crate::get_transactions_db(&db_path, acc2.id).unwrap();
    assert_eq!(txs2_after.len(), 1);
    assert_eq!(txs2_after[0].amount, 50.0);
    assert_eq!(txs2_after[0].payee, acc1.name);
}

#[test]
fn test_update_transaction_no_amount_change_doesnt_alter_balances() {
    let (_dir, db_path) = setup_db();
    let account = crate::create_account_db(&db_path, "T".to_string(), 100.0).unwrap();
    let tx = crate::create_transaction_db(
        &db_path,
        crate::CreateTransactionArgs {
            account_id: account.id,
            date: "2023-01-01".to_string(),
            payee: "Payee".to_string(),
            notes: None,
            category: None,
            amount: -20.0,
            ticker: None,
            shares: None,
            price_per_share: None,
            fee: None,
            currency: None,
        },
    )
    .unwrap();

    let args = crate::UpdateTransactionArgs {
        id: tx.id,
        account_id: account.id,
        date: "2023-01-02".to_string(),
        payee: "Payee2".to_string(),
        notes: Some("Note".to_string()),
        category: Some("Misc".to_string()),
        amount: -20.0,
        currency: None,
    };

    crate::update_transaction_db(&db_path, args).unwrap();

    let accounts = crate::get_accounts_db(&db_path).unwrap();
    assert_eq!(
        accounts
            .iter()
            .find(|a| a.id == account.id)
            .unwrap()
            .balance,
        80.0
    );
}
