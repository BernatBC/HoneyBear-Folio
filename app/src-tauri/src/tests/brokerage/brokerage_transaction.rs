use super::common::setup_db;

#[test]
fn test_brokerage_transaction() {
    let (_dir, db_path) = setup_db();
    let cash_acc = crate::create_account_db(&db_path, "Cash".to_string(), 1000.0, "cash".to_string()).unwrap();
    let brokerage_acc = crate::create_account_db(&db_path, "Brokerage".to_string(), 0.0, "investment".to_string()).unwrap();

    let args = crate::CreateBrokerageTransactionArgs {
        brokerage_account_id: brokerage_acc.id,
        cash_account_id: cash_acc.id,
        date: "2023-01-01".to_string(),
        ticker: "AAPL".to_string(),
        shares: 10.0,
        price_per_share: 150.0,
        fee: 5.0,
        is_buy: true,
    };

    let created = crate::create_brokerage_transaction_db(&db_path, args).unwrap();

    let accounts = crate::get_accounts_db(&db_path).unwrap();
    let cash_new = accounts.iter().find(|a| a.id == cash_acc.id).unwrap();
    let brokerage_new = accounts.iter().find(|a| a.id == brokerage_acc.id).unwrap();

    // Cash: 1000 - (10 * 150 + 5) = 1000 - 1505 = -505
    assert_eq!(cash_new.balance, -505.0);

    // Brokerage: 0 + (10 * 150) = 1500
    assert_eq!(brokerage_new.balance, 1500.0);

    // Returned transaction should contain ticker/shares/fee/category
    assert_eq!(created.ticker.as_deref(), Some("AAPL"));
    assert_eq!(created.shares, Some(10.0));
    assert_eq!(created.fee, Some(5.0));
    assert_eq!(created.category.as_deref(), Some("Investment"));
}

#[test]
fn test_brokerage_transaction_sell() {
    let (_dir, db_path) = setup_db();
    let cash_acc = crate::create_account_db(&db_path, "Cash".to_string(), 1000.0, "cash".to_string()).unwrap();
    let brokerage_acc = crate::create_account_db(&db_path, "Brokerage".to_string(), 0.0, "investment".to_string()).unwrap();

    let args = crate::CreateBrokerageTransactionArgs {
        brokerage_account_id: brokerage_acc.id,
        cash_account_id: cash_acc.id,
        date: "2023-01-01".to_string(),
        ticker: "AAPL".to_string(),
        shares: 10.0,
        price_per_share: 150.0,
        fee: 5.0,
        is_buy: false,
    };

    let created = crate::create_brokerage_transaction_db(&db_path, args).unwrap();

    let accounts = crate::get_accounts_db(&db_path).unwrap();
    let cash_new = accounts.iter().find(|a| a.id == cash_acc.id).unwrap();
    let brokerage_new = accounts.iter().find(|a| a.id == brokerage_acc.id).unwrap();

    // For a sell: brokerage decreases by 1500, cash increases by 1500 - 5 = 1495
    assert_eq!(cash_new.balance, 2495.0);
    assert_eq!(brokerage_new.balance, -1500.0);

    // Returned transaction should reflect negative shares for sell
    assert_eq!(created.ticker.as_deref(), Some("AAPL"));
    assert_eq!(created.shares, Some(-10.0));
    assert_eq!(created.fee, Some(5.0));
    assert_eq!(created.category.as_deref(), Some("Investment"));
}
#[test]
fn test_create_brokerage_transaction_missing_brokerage_account_should_error() {
    let (_dir, db_path) = setup_db();
    let cash_acc = crate::create_account_db(&db_path, "Cash".to_string(), 100.0, "cash".to_string()).unwrap();

    let args = crate::CreateBrokerageTransactionArgs {
        brokerage_account_id: -999,
        cash_account_id: cash_acc.id,
        date: "2023-01-01".to_string(),
        ticker: "FOO".to_string(),
        shares: 1.0,
        price_per_share: 100.0,
        fee: 1.0,
        is_buy: true,
    };

    let res = crate::create_brokerage_transaction_db(&db_path, args);
    assert!(res.is_err());
}