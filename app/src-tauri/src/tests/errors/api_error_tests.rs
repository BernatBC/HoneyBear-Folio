use super::common::setup_db;

#[test]
fn test_create_brokerage_transaction_missing_cash_account_should_error() {
    let (_dir, db_path) = setup_db();
    let brokerage_acc = crate::create_account_db(
        &db_path,
        "Brokerage".to_string(),
        0.0,
        "investment".to_string(),
    )
    .unwrap();

    let args = crate::CreateBrokerageTransactionArgs {
        brokerage_account_id: brokerage_acc.id,
        cash_account_id: -999,
        date: "2023-01-01".to_string(),
        ticker: "FOO".to_string(),
        shares: 1.0,
        price_per_share: 100.0,
        fee: 1.0,
        is_buy: true,
    };

    let res = crate::create_brokerage_transaction_db(&db_path, args);
    assert!(res.is_err());
}

#[test]
fn test_get_transactions_nonexistent_account_returns_empty() {
    let (_dir, db_path) = setup_db();
    let txs = crate::get_transactions_db(&db_path, -999).unwrap();
    assert!(txs.is_empty());
}

#[test]
fn test_delete_account_with_missing_id_noop() {
    let (_dir, db_path) = setup_db();

    // create an account so the DB isn't empty
    let _ = crate::create_account_db(&db_path, "Exists".to_string(), 100.0, "cash".to_string())
        .unwrap();

    // deleting non-existent id should return Ok and not affect existing accounts
    let res = crate::delete_account_db(&db_path, -999);
    assert!(res.is_ok());

    let accounts = crate::get_accounts_db(&db_path).unwrap();
    assert_eq!(accounts.len(), 1);
}
