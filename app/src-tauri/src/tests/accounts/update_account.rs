use super::common::setup_db;

#[test]
fn test_update_account_currency() {
    let (_dir, db_path) = setup_db();
    let acc = crate::create_account_db(&db_path, "UpdAcct".to_string(), 0.0, None).unwrap();

    let updated = crate::update_account_db(&db_path, acc.id, "UpdAcct".to_string(), Some("EUR".to_string())).unwrap();
    assert_eq!(updated.currency.as_deref(), Some("EUR"));

    // Ensure persisted value
    let accounts = crate::get_accounts_db(&db_path).unwrap();
    let a = accounts.into_iter().find(|a| a.id == acc.id).unwrap();
    assert_eq!(a.currency.as_deref(), Some("EUR"));
}
