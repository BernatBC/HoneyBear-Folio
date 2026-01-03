use super::common::setup_db;

#[test]
fn test_delete_account() {
    let (_dir, db_path) = setup_db();
    let account =
        crate::create_account_db(&db_path, "To Delete".to_string(), 0.0, "cash".to_string())
            .unwrap();
    crate::delete_account_db(&db_path, account.id).unwrap();
    let accounts = crate::get_accounts_db(&db_path).unwrap();
    assert!(accounts.is_empty());
}

#[test]
fn test_delete_account_with_transactions() {
    let (_dir, db_path) = setup_db();
    let account =
        crate::create_account_db(&db_path, "ToDelete".to_string(), 100.0, "cash".to_string())
            .unwrap();
    crate::create_transaction_db(
        &db_path,
        account.id,
        "2023-01-02".to_string(),
        "Payee".to_string(),
        None,
        None,
        -20.0,
    )
    .unwrap();
    let txs_before = crate::get_transactions_db(&db_path, account.id).unwrap();
    assert!(txs_before.len() >= 1);

    crate::delete_account_db(&db_path, account.id).unwrap();

    let accounts = crate::get_accounts_db(&db_path).unwrap();
    assert!(accounts.iter().all(|a| a.id != account.id));

    let txs_after = crate::get_transactions_db(&db_path, account.id).unwrap();
    assert!(txs_after.is_empty());
}
