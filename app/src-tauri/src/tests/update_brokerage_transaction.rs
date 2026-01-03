use super::common::setup_db;

#[test]
fn test_update_brokerage_transaction_missing_id_should_error() {
    let (_dir, db_path) = setup_db();
    let args = crate::UpdateBrokerageTransactionArgs {
        id: -999,
        brokerage_account_id: 1,
        date: "2023-01-01".to_string(),
        ticker: "AAPL".to_string(),
        shares: 1.0,
        price_per_share: 100.0,
        fee: 1.0,
        is_buy: true,
    };

    let res = crate::update_brokerage_transaction_db(&db_path, args);
    assert!(res.is_err());
}

#[test]
fn test_update_brokerage_transaction_updates_cash_counterpart() {
    let (_dir, db_path) = setup_db();
    let cash_acc = crate::create_account_db(&db_path, "Cash".to_string(), 1000.0, "cash".to_string()).unwrap();
    let brokerage_acc = crate::create_account_db(&db_path, "Brokerage".to_string(), 0.0, "investment".to_string()).unwrap();

    // Create initial buy: 10 * 100 + fee 2 => brokerage +1000, cash -(1000+2) = -2.0 (since initial cash was 1000)
    let args = crate::CreateBrokerageTransactionArgs {
        brokerage_account_id: brokerage_acc.id,
        cash_account_id: cash_acc.id,
        date: "2023-01-01".to_string(),
        ticker: "FOO".to_string(),
        shares: 10.0,
        price_per_share: 100.0,
        fee: 2.0,
        is_buy: true,
    };

    let created = crate::create_brokerage_transaction_db(&db_path, args).unwrap();

    let accounts = crate::get_accounts_db(&db_path).unwrap();
    let cash_before = accounts.iter().find(|a| a.id == cash_acc.id).unwrap().balance;
    let brokerage_before = accounts.iter().find(|a| a.id == brokerage_acc.id).unwrap().balance;
    assert_eq!(cash_before, -2.0);
    assert_eq!(brokerage_before, 1000.0);

    // Update to 5 shares at 200 with fee 1 -> total_price = 1000, brokerage amount = +1000, cash amount = -(1000+1) = -1.0
    let update_args = crate::UpdateBrokerageTransactionArgs {
        id: created.id,
        brokerage_account_id: brokerage_acc.id,
        date: "2023-01-02".to_string(),
        ticker: "FOO".to_string(),
        shares: 5.0,
        price_per_share: 200.0,
        fee: 1.0,
        is_buy: true,
    };

    crate::update_brokerage_transaction_db(&db_path, update_args).unwrap();

    let accounts_after = crate::get_accounts_db(&db_path).unwrap();
    let cash_after = accounts_after.iter().find(|a| a.id == cash_acc.id).unwrap().balance;
    let brokerage_after = accounts_after.iter().find(|a| a.id == brokerage_acc.id).unwrap().balance;

    // brokerage: was 1000 -> now 1000 (same) so no change expected
    assert_eq!(brokerage_after, 1000.0);
    // cash: initial 1000 - (10*100 + 2) = -2.0; after update: 1000 - (5*200 + 1) = -1.0
    assert_eq!(cash_before, -2.0);
    assert_eq!(cash_after, -1.0);
}
