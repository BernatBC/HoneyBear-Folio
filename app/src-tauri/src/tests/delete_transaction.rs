use super::common::setup_db;

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
