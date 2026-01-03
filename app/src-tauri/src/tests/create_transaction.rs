use super::common::setup_db;

#[test]
fn test_create_transaction() {
    let (_dir, db_path) = setup_db();
    let account = crate::create_account_db(&db_path, "Test Account".to_string(), 100.0, "cash".to_string()).unwrap();

    let tx = crate::create_transaction_db(
        &db_path,
        account.id,
        "2023-01-01".to_string(),
        "Payee".to_string(),
        Some("Notes".to_string()),
        Some("Category".to_string()),
        -50.0
    ).unwrap();

    assert_eq!(tx.amount, -50.0);

    let accounts = crate::get_accounts_db(&db_path).unwrap();
    assert_eq!(accounts[0].balance, 50.0); // 100 - 50
}

#[test]
fn test_get_all_transactions() {
    let (_dir, db_path) = setup_db();
    let acc1 = crate::create_account_db(&db_path, "A1".to_string(), 100.0, "cash".to_string()).unwrap();
    let acc2 = crate::create_account_db(&db_path, "A2".to_string(), 100.0, "cash".to_string()).unwrap();

    crate::create_transaction_db(&db_path, acc1.id, "2023-01-01".to_string(), "P1".to_string(), None, None, -10.0).unwrap();
    crate::create_transaction_db(&db_path, acc2.id, "2023-01-02".to_string(), "P2".to_string(), None, None, -20.0).unwrap();

    let all = crate::get_all_transactions_db(&db_path).unwrap();
    // Both accounts had opening balance txs plus the two created txs => total 4
    assert_eq!(all.len(), 4);
    // There should be at least one transaction with date 2023-01-02
    assert!(all.iter().any(|t| t.date == "2023-01-02".to_string()));
}
