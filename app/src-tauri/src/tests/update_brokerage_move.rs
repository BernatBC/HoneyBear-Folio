use super::common::setup_db;

#[test]
fn test_update_brokerage_transaction_move_between_broker_accounts() {
    let (_dir, db_path) = setup_db();
    let cash_acc = crate::create_account_db(&db_path, "Cash".to_string(), 1000.0, "cash".to_string()).unwrap();
    let broker_a = crate::create_account_db(&db_path, "BrokerA".to_string(), 0.0, "investment".to_string()).unwrap();
    let broker_b = crate::create_account_db(&db_path, "BrokerB".to_string(), 0.0, "investment".to_string()).unwrap();

    // Create initial buy in BrokerA
    let args = crate::CreateBrokerageTransactionArgs {
        brokerage_account_id: broker_a.id,
        cash_account_id: cash_acc.id,
        date: "2023-01-01".to_string(),
        ticker: "FOO".to_string(),
        shares: 2.0,
        price_per_share: 100.0,
        fee: 1.0,
        is_buy: true,
    };

    let created = crate::create_brokerage_transaction_db(&db_path, args).unwrap();

    // Balances after create
    let accounts = crate::get_accounts_db(&db_path).unwrap();
    let cash_after = accounts.iter().find(|a| a.id == cash_acc.id).unwrap().balance;
    let a_after = accounts.iter().find(|a| a.id == broker_a.id).unwrap().balance;
    // cash should be 1000 - (2*100 + 1) = 799
    assert_eq!(cash_after, 799.0);
    assert_eq!(a_after, 200.0);

    // Move brokerage transaction to BrokerB using update (same amounts)
    let update_args = crate::UpdateBrokerageTransactionArgs {
        id: created.id,
        brokerage_account_id: broker_b.id,
        date: "2023-01-02".to_string(),
        ticker: "FOO".to_string(),
        shares: 2.0,
        price_per_share: 100.0,
        fee: 1.0,
        is_buy: true,
    };

    crate::update_brokerage_transaction_db(&db_path, update_args).unwrap();

    // After move: BrokerA should be reverted to 0.0, BrokerB should be 200.0, cash should remain unchanged (-201 applied earlier, updates to cash on update should use same value so no net change)
    let accounts_after = crate::get_accounts_db(&db_path).unwrap();
    let cash_final = accounts_after.iter().find(|a| a.id == cash_acc.id).unwrap().balance;
    let a_final = accounts_after.iter().find(|a| a.id == broker_a.id).unwrap().balance;
    let b_final = accounts_after.iter().find(|a| a.id == broker_b.id).unwrap().balance;

    assert_eq!(a_final, 0.0);
    assert_eq!(b_final, 200.0);
    assert_eq!(cash_final, cash_after);

    // Ensure transaction's account_id moved to BrokerB
    let txs_b = crate::get_transactions_db(&db_path, broker_b.id).unwrap();
    assert!(txs_b.iter().any(|t| t.id == created.id));
}
