use super::common::setup_db;



#[test]
fn test_get_transactions_nonexistent_account_returns_empty() {
    let (_dir, db_path) = setup_db();
    let txs = crate::get_transactions_db(&db_path, -999).unwrap();
    assert!(txs.is_empty());
}

#[test]
fn test_delete_account_with_missing_id_noop() {
    let (_dir, db_path) = setup_db();

    // create an account so the DB isn't empty
    let _ = crate::create_account_db(&db_path, "Exists".to_string(), 100.0)
        .unwrap();

    // deleting non-existent id should return Ok and not affect existing accounts
    let res = crate::delete_account_db(&db_path, -999);
    assert!(res.is_ok());

    let accounts = crate::get_accounts_db(&db_path).unwrap();
    assert_eq!(accounts.len(), 1);
}
