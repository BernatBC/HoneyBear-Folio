use super::common::setup_db;

#[test]
fn test_investment_transaction_buy() {
    let (_dir, db_path) = setup_db();
    // Unified account
    let acc = crate::create_account_db(&db_path, "Investment Account".to_string(), 1000.0, None).unwrap();

    let args = crate::CreateInvestmentTransactionArgs {
        account_id: acc.id,
        date: "2023-01-01".to_string(),
        ticker: "AAPL".to_string(),
        shares: 10.0,
        price_per_share: 150.0,
        fee: 5.0,
        is_buy: true,
        currency: None,
    };

    let created = crate::create_investment_transaction_db(&db_path, args).unwrap();

    let accounts = crate::get_accounts_db(&db_path).unwrap();
    let acc_new = accounts.iter().find(|a| a.id == acc.id).unwrap();

    // Buy: Money leaves account -> Balance decreases by (10 * 150 + 5) = 1505
    // Initial: 1000. New: 1000 - 1505 = -505.
    assert_eq!(acc_new.balance, -505.0);

    // Returned transaction should contain ticker/shares/fee/category
    assert_eq!(created.ticker.as_deref(), Some("AAPL"));
    assert_eq!(created.shares, Some(10.0));
    assert_eq!(created.fee, Some(5.0));
    assert_eq!(created.category.as_deref(), Some("Investment"));
    assert_eq!(created.amount, -1505.0);
}

#[test]
fn test_investment_transaction_sell() {
    let (_dir, db_path) = setup_db();
    let acc = crate::create_account_db(&db_path, "Investment Account".to_string(), 0.0, None).unwrap();

    let args = crate::CreateInvestmentTransactionArgs {
        account_id: acc.id,
        date: "2023-01-01".to_string(),
        ticker: "AAPL".to_string(),
        shares: 10.0,
        price_per_share: 150.0,
        fee: 5.0,
        is_buy: false,
        currency: None,
    };

    let created = crate::create_investment_transaction_db(&db_path, args).unwrap();

    let accounts = crate::get_accounts_db(&db_path).unwrap();
    let acc_new = accounts.iter().find(|a| a.id == acc.id).unwrap();

    // Sell: Money enters account -> Balance increases by (10 * 150 - 5) = 1495
    // Initial: 0. New: 1495.
    assert_eq!(acc_new.balance, 1495.0);

    // Returned transaction should reflect negative shares for sell
    assert_eq!(created.ticker.as_deref(), Some("AAPL"));
    assert_eq!(created.shares, Some(-10.0));
    assert_eq!(created.fee, Some(5.0));
    assert_eq!(created.category.as_deref(), Some("Investment"));
    assert_eq!(created.amount, 1495.0);
}

#[test]
fn test_create_investment_transaction_missing_account_should_error() {
    let (_dir, db_path) = setup_db();

    let args = crate::CreateInvestmentTransactionArgs {
        account_id: -999,
        date: "2023-01-01".to_string(),
        ticker: "FOO".to_string(),
        shares: 1.0,
        price_per_share: 100.0,
        fee: 1.0,
        is_buy: true,
        currency: None,
    };

    let res = crate::create_investment_transaction_db(&db_path, args);
    assert!(res.is_err());
}
