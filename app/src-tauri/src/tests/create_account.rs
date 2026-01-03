use super::common::setup_db;

#[test]
fn test_create_account() {
    let (_dir, db_path) = setup_db();
    let account = crate::create_account_db(&db_path, "Test Account".to_string(), 100.0, "cash".to_string()).unwrap();
    assert_eq!(account.name, "Test Account");
    assert_eq!(account.balance, 100.0);
    assert_eq!(account.kind, "cash");

    // Check initial transaction
    let transactions = crate::get_transactions_db(&db_path, account.id).unwrap();
    assert_eq!(transactions.len(), 1);
    assert_eq!(transactions[0].amount, 100.0);
    assert_eq!(transactions[0].payee, "Opening Balance");
}

#[test]
fn test_create_account_zero_balance_no_initial_tx() {
    let (_dir, db_path) = setup_db();
    let account = crate::create_account_db(&db_path, "Zero".to_string(), 0.0, "cash".to_string()).unwrap();
    let txs = crate::get_transactions_db(&db_path, account.id).unwrap();
    assert_eq!(txs.len(), 0);
}
