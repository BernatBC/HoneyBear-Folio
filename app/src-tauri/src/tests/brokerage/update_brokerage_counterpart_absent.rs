use super::common::setup_db;

#[test]
fn test_update_brokerage_transaction_when_counterpart_missing() {
    let (_dir, db_path) = setup_db();
    let cash_acc =
        crate::create_account_db(&db_path, "Cash".to_string(), 1000.0, "cash".to_string()).unwrap();
    let brokerage_acc = crate::create_account_db(
        &db_path,
        "Brokerage".to_string(),
        0.0,
        "investment".to_string(),
    )
    .unwrap();

    // Create initial brokerage transaction (buy)
    let args = crate::CreateBrokerageTransactionArgs {
        brokerage_account_id: brokerage_acc.id,
        cash_account_id: cash_acc.id,
        date: "2023-01-01".to_string(),
        ticker: "FOO".to_string(),
        shares: 10.0,
        price_per_share: 100.0,
        fee: 5.0,
        is_buy: true,
    };

    let created = crate::create_brokerage_transaction_db(&db_path, args).unwrap();

    // Capture linked cash tx id and then delete it to simulate missing counterpart
    let conn = rusqlite::Connection::open(&db_path).unwrap();

    let linked_id: Option<i32> = conn
        .query_row(
            "SELECT linked_tx_id FROM transactions WHERE id = ?1",
            rusqlite::params![created.id],
            |r| r.get(0),
        )
        .unwrap();

    assert!(linked_id.is_some());
    conn.execute(
        "DELETE FROM transactions WHERE id = ?1",
        rusqlite::params![linked_id.unwrap()],
    )
    .unwrap();

    // Record balances before update
    let accts_before = crate::get_accounts_db(&db_path).unwrap();
    let cash_before = accts_before
        .iter()
        .find(|a| a.id == cash_acc.id)
        .unwrap()
        .balance;
    let brokerage_before = accts_before
        .iter()
        .find(|a| a.id == brokerage_acc.id)
        .unwrap()
        .balance;

    // Update brokerage transaction (reduce shares and change price/fee)
    let update_args = crate::UpdateBrokerageTransactionArgs {
        id: created.id,
        brokerage_account_id: brokerage_acc.id,
        date: "2023-01-02".to_string(),
        ticker: "FOO".to_string(),
        shares: 5.0,
        price_per_share: 120.0,
        fee: 2.0,
        is_buy: true,
    };

    let updated = crate::update_brokerage_transaction_db(&db_path, update_args).unwrap();

    // Old and new brokerage amounts
    let old_amount = created.amount;
    let new_amount = updated.amount;
    let diff = new_amount - old_amount;

    // Check brokerage account updated by diff and cash account unchanged (counterpart missing)
    let accts_after = crate::get_accounts_db(&db_path).unwrap();
    let cash_after = accts_after
        .iter()
        .find(|a| a.id == cash_acc.id)
        .unwrap()
        .balance;
    let brokerage_after = accts_after
        .iter()
        .find(|a| a.id == brokerage_acc.id)
        .unwrap()
        .balance;

    assert!((brokerage_after - (brokerage_before + diff)).abs() < 1e-6);
    assert!((cash_after - cash_before).abs() < 1e-6);

    // Ensure returned transaction reflects update
    assert_eq!(updated.ticker.as_deref(), Some("FOO"));
    assert_eq!(updated.shares, Some(5.0));
    assert_eq!(updated.price_per_share, Some(120.0));
    assert_eq!(updated.fee, Some(2.0));
    assert_eq!(updated.category.as_deref(), Some("Investment"));
}
