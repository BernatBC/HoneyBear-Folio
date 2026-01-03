use super::common::setup_db;

#[test]
fn test_get_payees_and_categories() {
    let (_dir, db_path) = setup_db();
    let acc = crate::create_account_db(&db_path, "A".to_string(), 100.0, "cash".to_string()).unwrap();

    crate::create_transaction_db(&db_path, acc.id, "2023-01-01".to_string(), "Payee1".to_string(), None, Some("Food".to_string()), -10.0).unwrap();
    crate::create_transaction_db(&db_path, acc.id, "2023-01-02".to_string(), "Payee2".to_string(), None, Some("Bills".to_string()), -20.0).unwrap();

    // Add a transfer (should be categorized as Transfer and not show as category)
    let acc2 = crate::create_account_db(&db_path, "Acc2".to_string(), 0.0, "cash".to_string()).unwrap();
    crate::create_transaction_db(&db_path, acc.id, "2023-01-03".to_string(), acc2.name.clone(), Some("XFER".to_string()), None, -30.0).unwrap();

    let payees = crate::get_payees_db(&db_path).unwrap();
    assert!(payees.contains(&"Payee1".to_string()));
    assert!(payees.contains(&"Payee2".to_string()));
    assert!(payees.contains(&acc2.name));

    let cats = crate::get_categories_db(&db_path).unwrap();
    assert!(cats.contains(&"Food".to_string()));
    assert!(cats.contains(&"Bills".to_string()));
    // Transfer should not be present
    assert!(!cats.contains(&"Transfer".to_string()));
}
