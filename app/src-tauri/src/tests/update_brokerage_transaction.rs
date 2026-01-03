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
