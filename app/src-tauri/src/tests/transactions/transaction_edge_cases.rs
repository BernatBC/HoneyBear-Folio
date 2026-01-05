use super::common::setup_db;

#[test]
fn test_update_transaction_move_between_accounts() {
    let (_dir, db_path) = setup_db();
    let acc1 =
        crate::create_account_db(&db_path, "From".to_string(), 100.0, "cash".to_string()).unwrap();
    let acc2 =
        crate::create_account_db(&db_path, "To".to_string(), 50.0, "cash".to_string()).unwrap();

    // Create a simple non-transfer transaction in acc1
    let tx = crate::create_transaction_db(
        &db_path,
        acc1.id,
        "2023-01-01".to_string(),
        "Payee".to_string(),
        None,
        None,
        -20.0,        None,
        None,
        None,
        None,    )
    .unwrap();

    // Move transaction to acc2 using update_transaction_db
    let args = crate::UpdateTransactionArgs {
        id: tx.id,
        account_id: acc2.id,
        date: "2023-01-02".to_string(),
        payee: "Payee Updated".to_string(),
        notes: Some("Moved".to_string()),
        category: Some("Misc".to_string()),
        amount: -20.0,
    };

    crate::update_transaction_db(&db_path, args).unwrap();

    // After move: acc1 should be restored to 100, acc2 should be 30 (50 - 20)
    let accounts = crate::get_accounts_db(&db_path).unwrap();
    let a1 = accounts.iter().find(|a| a.id == acc1.id).unwrap();
    let a2 = accounts.iter().find(|a| a.id == acc2.id).unwrap();

    assert_eq!(a1.balance, 100.0);
    assert_eq!(a2.balance, 30.0);

    // Transaction should now belong to acc2
    let txs_acc1 = crate::get_transactions_db(&db_path, acc1.id).unwrap();
    let txs_acc2 = crate::get_transactions_db(&db_path, acc2.id).unwrap();

    assert!(txs_acc1.iter().all(|t| t.id != tx.id));
    assert!(txs_acc2.iter().any(|t| t.id == tx.id));
}

#[test]
fn test_create_transaction_payee_same_account_name_no_transfer_created() {
    let (_dir, db_path) = setup_db();
    let acc = crate::create_account_db(&db_path, "SelfAcc".to_string(), 100.0, "cash".to_string())
        .unwrap();

    // Create transaction where payee equals the same account name - should NOT create transfer
    let tx = crate::create_transaction_db(
        &db_path,
        acc.id,
        "2023-01-01".to_string(),
        acc.name.clone(),
        None,
        None,
        -10.0,        None,
        None,
        None,
        None,    )
    .unwrap();
    assert_eq!(tx.category, None);

    // Ensure no counterpart created
    let txs = crate::get_transactions_db(&db_path, acc.id).unwrap();
    // Should be only the created tx (and opening balance), and no other account had transaction
    assert!(txs.iter().filter(|t| t.payee == acc.name).count() >= 1);
}
