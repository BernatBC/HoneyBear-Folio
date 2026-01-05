use super::common::setup_db;

#[test]
fn test_create_transaction() {
    let (_dir, db_path) = setup_db();
    let account = crate::create_account_db(
        &db_path,
        "Test Account".to_string(),
        100.0,
        "cash".to_string(),
    )
    .unwrap();

    let tx = crate::create_transaction_db(
        &db_path,
        account.id,
        "2023-01-01".to_string(),
        "Payee".to_string(),
        Some("Notes".to_string()),
        Some("Category".to_string()),
        -50.0,
        None,
        None,
        None,
        None,
    )
    .unwrap();

    assert_eq!(tx.amount, -50.0);

    let accounts = crate::get_accounts_db(&db_path).unwrap();
    assert_eq!(accounts[0].balance, 50.0); // 100 - 50
}

#[test]
fn test_get_all_transactions() {
    let (_dir, db_path) = setup_db();
    let acc1 =
        crate::create_account_db(&db_path, "A1".to_string(), 100.0, "cash".to_string()).unwrap();
    let acc2 =
        crate::create_account_db(&db_path, "A2".to_string(), 100.0, "cash".to_string()).unwrap();

    crate::create_transaction_db(
        &db_path,
        acc1.id,
        "2023-01-01".to_string(),
        "P1".to_string(),
        None,
        None,
        -10.0,
        None,
        None,
        None,
        None,
    )
    .unwrap();
    crate::create_transaction_db(
        &db_path,
        acc2.id,
        "2023-01-02".to_string(),
        "P2".to_string(),
        None,
        None,
        -20.0,
        None,
        None,
        None,
        None,
    )
    .unwrap();

    let all = crate::get_all_transactions_db(&db_path).unwrap();
    // Both accounts had opening balance txs plus the two created txs => total 4
    assert_eq!(all.len(), 4);
    // There should be at least one transaction with date 2023-01-02
    assert!(all.iter().any(|t| t.date == "2023-01-02"));
}
#[test]
fn test_create_transaction_transfer_details() {
    let (_dir, db_path) = setup_db();
    let acc1 =
        crate::create_account_db(&db_path, "A1".to_string(), 100.0, "cash".to_string()).unwrap();
    let acc2 =
        crate::create_account_db(&db_path, "A2".to_string(), 0.0, "cash".to_string()).unwrap();

    let tx = crate::create_transaction_db(
        &db_path,
        acc1.id,
        "2023-01-05".to_string(),
        acc2.name.clone(),
        None,
        None,
        -50.0,
        None,
        None,
        None,
        None,
    )
    .unwrap();
    assert_eq!(tx.category.as_deref(), Some("Transfer"));

    // counterpart exists in acc2
    let txs2 = crate::get_transactions_db(&db_path, acc2.id).unwrap();
    assert_eq!(txs2.len(), 1);
    assert_eq!(txs2[0].amount, 50.0);
    assert_eq!(txs2[0].payee, acc1.name);
}

#[test]
fn test_get_transactions_ordering() {
    let (_dir, db_path) = setup_db();
    let acc =
        crate::create_account_db(&db_path, "Ord".to_string(), 0.0, "cash".to_string()).unwrap();
    crate::create_transaction_db(
        &db_path,
        acc.id,
        "2023-01-01".to_string(),
        "P1".to_string(),
        None,
        None,
        -10.0,
        None,
        None,
        None,
        None,
    )
    .unwrap();
    crate::create_transaction_db(
        &db_path,
        acc.id,
        "2023-02-01".to_string(),
        "P2".to_string(),
        None,
        None,
        -20.0,
        None,
        None,
        None,
        None,
    )
    .unwrap();
    let txs = crate::get_transactions_db(&db_path, acc.id).unwrap();
    assert!(txs.len() >= 2);
    assert_eq!(txs[0].date, "2023-02-01");
    assert_eq!(txs[1].date, "2023-01-01");
}

#[test]
fn test_create_transaction_with_nonexistent_account_errors_due_to_foreign_key() {
    let (_dir, db_path) = setup_db();
    // creating a transaction with a non-existent account id should fail due to FK constraint
    let res = crate::create_transaction_db(
        &db_path,
        -999,
        "2023-01-01".to_string(),
        "Someone".to_string(),
        None,
        Some("Food".to_string()),
        -10.0,
        None,
        None,
        None,
        None,
    );
    assert!(res.is_err());

    // ensure no accounts were created with that id
    let accounts = crate::get_accounts_db(&db_path).unwrap();
    assert!(accounts.iter().all(|a| a.id != -999));
}

#[test]
fn test_create_transaction_preserves_nontransfer_category() {
    let (_dir, db_path) = setup_db();
    let acc =
        crate::create_account_db(&db_path, "A".to_string(), 100.0, "cash".to_string()).unwrap();
    let tx = crate::create_transaction_db(
        &db_path,
        acc.id,
        "2023-01-02".to_string(),
        "NonAccountPayee".to_string(),
        None,
        Some("Entertainment".to_string()),
        -15.0,
        None,
        None,
        None,
        None,
    )
    .unwrap();
    assert_eq!(tx.category.as_deref(), Some("Entertainment"));
}

#[test]
fn test_create_transaction_with_ticker_shares_price_fee() {
    let (_dir, db_path) = setup_db();
    let acc = crate::create_account_db(&db_path, "Invest".to_string(), 1000.0, "cash".to_string())
        .unwrap();

    let tx = crate::create_transaction_db(
        &db_path,
        acc.id,
        "2023-01-03".to_string(),
        "Broker".to_string(),
        Some("Bought shares".to_string()),
        Some("Investment".to_string()),
        -1505.0,
        Some("AAPL".to_string()),
        Some(10.0),
        Some(150.0),
        Some(5.0),
    )
    .unwrap();

    // Returned transaction has the investment fields set
    assert_eq!(tx.ticker.as_deref(), Some("AAPL"));
    assert_eq!(tx.shares, Some(10.0));
    assert_eq!(tx.price_per_share, Some(150.0));
    assert_eq!(tx.fee, Some(5.0));

    // Persisted row should match
    let txs = crate::get_transactions_db(&db_path, acc.id).unwrap();
    let found = txs.iter().find(|t| t.id == tx.id).unwrap();
    assert_eq!(found.ticker, tx.ticker);
    assert_eq!(found.shares, tx.shares);
    assert_eq!(found.price_per_share, tx.price_per_share);
    assert_eq!(found.fee, tx.fee);

    // Account balance updated accordingly
    let account = crate::get_accounts_db(&db_path)
        .unwrap()
        .into_iter()
        .find(|a| a.id == acc.id)
        .unwrap();
    assert!((account.balance - (-505.0)).abs() < 1e-6);
}
