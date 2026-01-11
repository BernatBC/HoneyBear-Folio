use super::common::setup_db;

#[test]
fn test_update_investment_transaction_move_between_accounts() {
    let (_dir, db_path) = setup_db();
    let acc_a = crate::create_account_db(&db_path, "AccountA".to_string(), 1000.0, None).unwrap();
    let acc_b = crate::create_account_db(&db_path, "AccountB".to_string(), 1000.0, None).unwrap();

    // Create initial buy in A
    // Cost: 2*100 + 1 => 201.
    // Bal A: 1000 - 201 = 799.
    let args = crate::CreateInvestmentTransactionArgs {
        account_id: acc_a.id,
        date: "2023-01-01".to_string(),
        ticker: "FOO".to_string(),
        shares: 2.0,
        price_per_share: 100.0,
        fee: 1.0,
        is_buy: true,
        currency: None,
    };

    let created = crate::create_investment_transaction_db(&db_path, args).unwrap();

    let accounts = crate::get_accounts_db(&db_path).unwrap();
    let a_after = accounts.iter().find(|a| a.id == acc_a.id).unwrap().balance;
    let b_after = accounts.iter().find(|a| a.id == acc_b.id).unwrap().balance;
    assert_eq!(a_after, 799.0);
    assert_eq!(b_after, 1000.0);

    // Move to B
    let update_args = crate::UpdateInvestmentTransactionArgs {
        id: created.id,
        account_id: acc_b.id, // Target B
        date: "2023-01-02".to_string(),
        ticker: "FOO".to_string(),
        shares: 2.0,
        price_per_share: 100.0,
        fee: 1.0,
        is_buy: true,
        notes: None,
        currency: None,
    };

    crate::update_investment_transaction_db(&db_path, update_args).unwrap();

    // After move:
    // A should revert the change (+201) -> 1000.
    // B should apply the change (-201) -> 799.
    let accounts_final = crate::get_accounts_db(&db_path).unwrap();
    let a_final = accounts_final
        .iter()
        .find(|a| a.id == acc_a.id)
        .unwrap()
        .balance;
    let b_final = accounts_final
        .iter()
        .find(|a| a.id == acc_b.id)
        .unwrap()
        .balance;

    assert_eq!(a_final, 1000.0);
    assert_eq!(b_final, 799.0);

    // Check transaction account_id updated
    let txs_b = crate::get_transactions_db(&db_path, acc_b.id).unwrap();
    assert!(txs_b.iter().any(|t| t.id == created.id));
}
