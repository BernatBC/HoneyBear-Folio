use super::common::setup_db;

#[test]
fn test_rename_account() {
    let (_dir, db_path) = setup_db();
    let account =
        crate::create_account_db(&db_path, "Old Name".to_string(), 0.0, "cash".to_string())
            .unwrap();
    let updated = crate::rename_account_db(&db_path, account.id, "New Name".to_string()).unwrap();
    assert_eq!(updated.name, "New Name");
}

#[test]
fn test_rename_account_empty_should_error() {
    let (_dir, db_path) = setup_db();
    let account =
        crate::create_account_db(&db_path, "Old".to_string(), 0.0, "cash".to_string()).unwrap();
    let res = crate::rename_account_db(&db_path, account.id, "   ".to_string());
    assert!(res.is_err());
}

#[test]
fn test_rename_account_missing_id_should_error() {
    let (_dir, db_path) = setup_db();
    let res = crate::rename_account_db(&db_path, -999, "Name".to_string());
    assert!(res.is_err());
}
