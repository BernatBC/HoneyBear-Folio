use super::common::setup_db;

#[test]
fn test_delete_investment_transaction_updates_balance() {
    let (_dir, db_path) = setup_db();
    let acc = crate::create_account_db(&db_path, "Invest Delete".to_string(), 1000.0).unwrap();

    // Create buy: cost 1005. Bal = -5.0.
    let args = crate::CreateInvestmentTransactionArgs {
        account_id: acc.id,
        date: "2023-01-01".to_string(),
        ticker: "FOO".to_string(),
        shares: 10.0,
        price_per_share: 100.0,
        fee: 5.0,
        is_buy: true,
        currency: None,
    };
    let created = crate::create_investment_transaction_db(&db_path, args).unwrap();

    let accounts = crate::get_accounts_db(&db_path).unwrap();
    assert_eq!(accounts[0].balance, -5.0);

    // Delete
    crate::delete_transaction_db(&db_path, created.id).unwrap();

    // Balance should revert to 1000.0.
    // -5.0 + 1005 = 1000.0.
    let accounts_after = crate::get_accounts_db(&db_path).unwrap();
    assert_eq!(accounts_after[0].balance, 1000.0);

    let txs = crate::get_transactions_db(&db_path, acc.id).unwrap();
    assert_eq!(txs.len(), 1);
}
