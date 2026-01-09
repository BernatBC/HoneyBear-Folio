use tempfile::tempdir;

#[test]
fn test_create_account_and_transaction_via_helpers() {
    let dir = tempdir().unwrap();
    let dir_path = dir.path().to_path_buf();

    // Create two accounts via helper that simulates command-layer DB path logic
    let acc1 = crate::create_account_in_dir(&dir_path, "A".to_string(), 100.0)
        .unwrap();
    let acc2 =
        crate::create_account_in_dir(&dir_path, "B".to_string(), 0.0).unwrap();

    assert_eq!(acc1.balance, 100.0);

    // Create a transfer transaction from acc1 to acc2
    let _tx = crate::create_transaction_in_dir(
        &dir_path,
        acc1.id,
        "2023-01-01".to_string(),
        acc2.name.clone(),
        Some("XFER".to_string()),
        None,
        -30.0,
    )
    .unwrap();

    // Validate balances post-transaction
    let db_path = crate::get_db_path_for_dir(&dir_path).unwrap();
    let accounts = crate::get_accounts_db(&db_path).unwrap();
    let a1 = accounts.iter().find(|a| a.id == acc1.id).unwrap();
    let a2 = accounts.iter().find(|a| a.id == acc2.id).unwrap();

    assert!((a1.balance - 70.0).abs() < 1e-6);
    assert!((a2.balance - 30.0).abs() < 1e-6);
}
