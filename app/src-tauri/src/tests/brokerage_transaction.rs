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

    crate::create_brokerage_transaction_db(&db_path, args).unwrap();

    let accounts = crate::get_accounts_db(&db_path).unwrap();
    let cash_new = accounts.iter().find(|a| a.id == cash_acc.id).unwrap();
    let brokerage_new = accounts.iter().find(|a| a.id == brokerage_acc.id).unwrap();

    // Cash: 1000 - (10 * 150 + 5) = 1000 - 1505 = -505
    assert_eq!(cash_new.balance, -505.0);

    // Brokerage: 0 + (10 * 150) = 1500
    assert_eq!(brokerage_new.balance, 1500.0);
}
