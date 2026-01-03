use super::common::setup_db;

#[test]
fn test_delete_account() {
    let (_dir, db_path) = setup_db();
    let account = crate::create_account_db(&db_path, "To Delete".to_string(), 0.0, "cash".to_string()).unwrap();
    crate::delete_account_db(&db_path, account.id).unwrap();
    let accounts = crate::get_accounts_db(&db_path).unwrap();
    assert!(accounts.is_empty());
}
