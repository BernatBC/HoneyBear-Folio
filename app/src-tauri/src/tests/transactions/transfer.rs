use super::common::setup_db;

#[test]
fn test_transfer() {
    let (_dir, db_path) = setup_db();
    let acc1 =
        crate::create_account_db(&db_path, "Acc1".to_string(), 100.0).unwrap();
    let acc2 =
        crate::create_account_db(&db_path, "Acc2".to_string(), 0.0).unwrap();

    // Transfer 50 from Acc1 to Acc2
    // Payee should be "Acc2"
    crate::create_transaction_db(
        &db_path,
        crate::CreateTransactionArgs {
            account_id: acc1.id,
            date: "2023-01-01".to_string(),
            payee: "Acc2".to_string(),
            notes: None,
            category: None,
            amount: -50.0,
            ticker: None,
            shares: None,
            price_per_share: None,
            fee: None,
        },
    )
    .unwrap();

    let accounts = crate::get_accounts_db(&db_path).unwrap();
    let acc1_new = accounts.iter().find(|a| a.id == acc1.id).unwrap();
    let acc2_new = accounts.iter().find(|a| a.id == acc2.id).unwrap();

    assert_eq!(acc1_new.balance, 50.0);
    assert_eq!(acc2_new.balance, 50.0);

    let txs1 = crate::get_transactions_db(&db_path, acc1.id).unwrap();
    let txs2 = crate::get_transactions_db(&db_path, acc2.id).unwrap();

    // txs1 has opening balance + transfer
    assert_eq!(txs1.len(), 2);
    // Opening balance is newer (date('now')) than transfer (2023-01-01)
    // So transfer is at index 1
    assert_eq!(txs1[1].category.as_deref(), Some("Transfer"));

    // txs2 has opening balance (if any, but 0 balance doesn't create one)
    assert_eq!(txs2.len(), 1);
    assert_eq!(txs2[0].category.as_deref(), Some("Transfer"));
    assert_eq!(txs2[0].amount, 50.0);
}
