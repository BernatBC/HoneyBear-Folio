use super::common::setup_db;

#[test]
fn test_get_payees_and_categories() {
    let (_dir, db_path) = setup_db();
    let acc = crate::create_account_db(&db_path, "A".to_string(), 100.0).unwrap();

    crate::create_transaction_db(
        &db_path,
        crate::CreateTransactionArgs {
            account_id: acc.id,
            date: "2023-01-01".to_string(),
            payee: "Payee1".to_string(),
            notes: None,
            category: Some("Food".to_string()),
            amount: -10.0,
            ticker: None,
            shares: None,
            price_per_share: None,
            fee: None,            currency: None,        },
    )
    .unwrap();
    crate::create_transaction_db(
        &db_path,
        crate::CreateTransactionArgs {
            account_id: acc.id,
            date: "2023-01-02".to_string(),
            payee: "Payee2".to_string(),
            notes: None,
            category: Some("Bills".to_string()),
            amount: -20.0,
            ticker: None,
            shares: None,
            price_per_share: None,
            fee: None,
            currency: None,
        },
    )
    .unwrap();

    // Add a transfer (should be categorized as Transfer and not show as category)
    let acc2 = crate::create_account_db(&db_path, "Acc2".to_string(), 0.0).unwrap();
    crate::create_transaction_db(
        &db_path,
        crate::CreateTransactionArgs {
            account_id: acc.id,
            date: "2023-01-03".to_string(),
            payee: acc2.name.clone(),
            notes: Some("XFER".to_string()),
            category: None,
            amount: -30.0,
            ticker: None,
            shares: None,
            price_per_share: None,
            fee: None,
            currency: None,
        },
    )
    .unwrap();

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

#[test]
fn test_get_payees_and_categories_empty() {
    let (_dir, db_path) = setup_db();
    let payees = crate::get_payees_db(&db_path).unwrap();
    let cats = crate::get_categories_db(&db_path).unwrap();
    assert!(payees.is_empty());
    assert!(cats.is_empty());
}

#[test]
fn test_payees_and_categories_sorted() {
    let (_dir, db_path) = setup_db();
    // Use zero opening balance to avoid the "Opening Balance" payee
    let acc = crate::create_account_db(&db_path, "A".to_string(), 0.0).unwrap();
    crate::create_transaction_db(
        &db_path,
        crate::CreateTransactionArgs {
            account_id: acc.id,
            date: "2023-01-03".to_string(),
            payee: "ZPay".to_string(),
            notes: None,
            category: Some("ZCat".to_string()),
            amount: -10.0,
            ticker: None,
            shares: None,
            price_per_share: None,
            fee: None,
            currency: None,
        },
    )
    .unwrap();
    crate::create_transaction_db(
        &db_path,
        crate::CreateTransactionArgs {
            account_id: acc.id,
            date: "2023-01-02".to_string(),
            payee: "APay".to_string(),
            notes: None,
            category: Some("ACat".to_string()),
            amount: -5.0,
            ticker: None,
            shares: None,
            price_per_share: None,
            fee: None,
            currency: None,
        },
    )
    .unwrap();

    let payees = crate::get_payees_db(&db_path).unwrap();
    assert_eq!(payees, vec!["APay".to_string(), "ZPay".to_string()]);

    let cats = crate::get_categories_db(&db_path).unwrap();
    assert_eq!(cats, vec!["ACat".to_string(), "ZCat".to_string()]);
}
