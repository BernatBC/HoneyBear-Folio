use super::common::setup_db;
#[test]
fn test_update_brokerage_transaction_missing_id_should_error() {
    let (_dir, db_path) = setup_db();
    let args = crate::UpdateBrokerageTransactionArgs {
        id: -999,
        brokerage_account_id: 1,
        date: "2023-01-01".to_string(),
        ticker: "AAPL".to_string(),
        shares: 1.0,
        price_per_share: 100.0,
        fee: 1.0,
        is_buy: true,
    };

    let res = crate::update_brokerage_transaction_db(&db_path, args);
    assert!(res.is_err());
}

#[test]
fn test_update_brokerage_transaction_updates_cash_counterpart() {
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

    // Create initial buy: 10 * 100 + fee 2 => brokerage +1000, cash -(1000+2) = -2.0 (since initial cash was 1000)
    let args = crate::CreateBrokerageTransactionArgs {
        brokerage_account_id: brokerage_acc.id,
        cash_account_id: cash_acc.id,
        date: "2023-01-01".to_string(),
        ticker: "FOO".to_string(),
        shares: 10.0,
        price_per_share: 100.0,
        fee: 2.0,
        is_buy: true,
    };

    let created = crate::create_brokerage_transaction_db(&db_path, args).unwrap();

    let accounts = crate::get_accounts_db(&db_path).unwrap();
    let cash_before = accounts
        .iter()
        .find(|a| a.id == cash_acc.id)
        .unwrap()
        .balance;
    let brokerage_before = accounts
        .iter()
        .find(|a| a.id == brokerage_acc.id)
        .unwrap()
        .balance;
    assert_eq!(cash_before, -2.0);
    assert_eq!(brokerage_before, 1000.0);

    // Update to 5 shares at 200 with fee 1 -> total_price = 1000, brokerage amount = +1000, cash amount = -(1000+1) = -1.0
    let update_args = crate::UpdateBrokerageTransactionArgs {
        id: created.id,
        brokerage_account_id: brokerage_acc.id,
        date: "2023-01-02".to_string(),
        ticker: "FOO".to_string(),
        shares: 5.0,
        price_per_share: 200.0,
        fee: 1.0,
        is_buy: true,
    };

    crate::update_brokerage_transaction_db(&db_path, update_args).unwrap();

    let accounts_after = crate::get_accounts_db(&db_path).unwrap();
    let cash_after = accounts_after
        .iter()
        .find(|a| a.id == cash_acc.id)
        .unwrap()
        .balance;
    let brokerage_after = accounts_after
        .iter()
        .find(|a| a.id == brokerage_acc.id)
        .unwrap()
        .balance;

    // brokerage: was 1000 -> now 1000 (same) so no change expected
    assert_eq!(brokerage_after, 1000.0);
    // cash: initial 1000 - (10*100 + 2) = -2.0; after update: 1000 - (5*200 + 1) = -1.0
    assert_eq!(cash_before, -2.0);
    assert_eq!(cash_after, -1.0);
}

#[test]
fn test_update_brokerage_transaction_fallback_by_notes() {
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

    // Create initial buy which sets linked_tx_id
    let args = crate::CreateBrokerageTransactionArgs {
        brokerage_account_id: brokerage_acc.id,
        cash_account_id: cash_acc.id,
        date: "2023-01-01".to_string(),
        ticker: "FOO".to_string(),
        shares: 10.0,
        price_per_share: 100.0,
        fee: 2.0,
        is_buy: true,
    };

    let created = crate::create_brokerage_transaction_db(&db_path, args).unwrap();

    // Remove linked_tx_id to force fallback via notes
    let conn = rusqlite::Connection::open(&db_path).unwrap();
    conn.execute(
        "UPDATE transactions SET linked_tx_id = NULL WHERE id = ?1",
        rusqlite::params![created.id],
    )
    .unwrap();

    // Also clear linked from cash tx (if any)
    let cash_tx_id: i32 = conn
        .query_row(
            "SELECT id FROM transactions WHERE account_id = ?1 AND category = 'Transfer' LIMIT 1",
            rusqlite::params![cash_acc.id],
            |r| r.get(0),
        )
        .unwrap();
    conn.execute(
        "UPDATE transactions SET linked_tx_id = NULL WHERE id = ?1",
        rusqlite::params![cash_tx_id],
    )
    .unwrap();

    // Update the cash tx notes to match the brokerage tx old notes so fallback by notes succeeds
    let old_notes = created.notes.clone().unwrap();
    conn.execute(
        "UPDATE transactions SET notes = ?1 WHERE id = ?2",
        rusqlite::params![old_notes, cash_tx_id],
    )
    .unwrap();

    // Now run an update which should fallback to matching by old notes
    let update_args = crate::UpdateBrokerageTransactionArgs {
        id: created.id,
        brokerage_account_id: brokerage_acc.id,
        date: "2023-01-02".to_string(),
        ticker: "FOO".to_string(),
        shares: 5.0,
        price_per_share: 200.0,
        fee: 1.0,
        is_buy: true,
    };

    crate::update_brokerage_transaction_db(&db_path, update_args).unwrap();

    // Verify cash tx amount updated (now should be -(5*200 + 1) = -1001). There may be an opening balance tx, so find the Transfer tx.
    let cash_txs = crate::get_transactions_db(&db_path, cash_acc.id).unwrap();
    let transfer_tx = cash_txs
        .iter()
        .find(|t| t.category.as_deref() == Some("Transfer"))
        .expect("Transfer tx not found");
    assert_eq!(transfer_tx.amount, -1001.0);

    // Verify balances as well
    let accounts_after = crate::get_accounts_db(&db_path).unwrap();
    let cash_after = accounts_after
        .iter()
        .find(|a| a.id == cash_acc.id)
        .unwrap()
        .balance;
    let brokerage_after = accounts_after
        .iter()
        .find(|a| a.id == brokerage_acc.id)
        .unwrap()
        .balance;

    assert_eq!(brokerage_after, 1000.0);
    assert_eq!(cash_after, -1.0);
}

#[test]
fn test_update_brokerage_transaction_sell_changes_amounts() {
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

    // Create initial buy: 10 * 100 + fee 2
    let args = crate::CreateBrokerageTransactionArgs {
        brokerage_account_id: brokerage_acc.id,
        cash_account_id: cash_acc.id,
        date: "2023-01-01".to_string(),
        ticker: "FOO".to_string(),
        shares: 10.0,
        price_per_share: 100.0,
        fee: 2.0,
        is_buy: true,
    };

    let created = crate::create_brokerage_transaction_db(&db_path, args).unwrap();

    // Update to sell (is_buy = false) same amounts
    let update_args = crate::UpdateBrokerageTransactionArgs {
        id: created.id,
        brokerage_account_id: brokerage_acc.id,
        date: "2023-01-02".to_string(),
        ticker: "FOO".to_string(),
        shares: 10.0,
        price_per_share: 100.0,
        fee: 2.0,
        is_buy: false,
    };

    crate::update_brokerage_transaction_db(&db_path, update_args).unwrap();

    let accounts_after = crate::get_accounts_db(&db_path).unwrap();
    let cash_after = accounts_after
        .iter()
        .find(|a| a.id == cash_acc.id)
        .unwrap()
        .balance;
    let brokerage_after = accounts_after
        .iter()
        .find(|a| a.id == brokerage_acc.id)
        .unwrap()
        .balance;

    // After change: brokerage becomes -1000.0, cash becomes previous -2.0 -> updated to 998.0
    assert_eq!(brokerage_after, -1000.0);
    assert_eq!(cash_after, 1998.0);
}

#[test]
fn test_update_brokerage_transaction_no_change_when_same_values() {
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

    let args = crate::CreateBrokerageTransactionArgs {
        brokerage_account_id: brokerage_acc.id,
        cash_account_id: cash_acc.id,
        date: "2023-01-01".to_string(),
        ticker: "FOO".to_string(),
        shares: 5.0,
        price_per_share: 200.0,
        fee: 1.0,
        is_buy: true,
    };

    let created = crate::create_brokerage_transaction_db(&db_path, args).unwrap();

    let accounts_before = crate::get_accounts_db(&db_path).unwrap();
    let cash_before = accounts_before
        .iter()
        .find(|a| a.id == cash_acc.id)
        .unwrap()
        .balance;
    let brokerage_before = accounts_before
        .iter()
        .find(|a| a.id == brokerage_acc.id)
        .unwrap()
        .balance;

    // Update with same values
    let update_args = crate::UpdateBrokerageTransactionArgs {
        id: created.id,
        brokerage_account_id: brokerage_acc.id,
        date: "2023-01-01".to_string(),
        ticker: "FOO".to_string(),
        shares: 5.0,
        price_per_share: 200.0,
        fee: 1.0,
        is_buy: true,
    };

    crate::update_brokerage_transaction_db(&db_path, update_args).unwrap();

    let accounts_after = crate::get_accounts_db(&db_path).unwrap();
    let cash_after = accounts_after
        .iter()
        .find(|a| a.id == cash_acc.id)
        .unwrap()
        .balance;
    let brokerage_after = accounts_after
        .iter()
        .find(|a| a.id == brokerage_acc.id)
        .unwrap()
        .balance;

    assert_eq!(cash_before, cash_after);
    assert_eq!(brokerage_before, brokerage_after);
}

#[test]
fn test_update_brokerage_transaction_no_cash_counterpart_does_not_change_cash_account() {
    let (_dir, db_path) = setup_db();
    let cash_acc =
        crate::create_account_db(&db_path, "Cash".to_string(), 1000.0, "cash".to_string()).unwrap();
    let brokerage_acc = crate::create_account_db(
        &db_path,
        "Broker".to_string(),
        0.0,
        "investment".to_string(),
    )
    .unwrap();

    let args = crate::CreateBrokerageTransactionArgs {
        brokerage_account_id: brokerage_acc.id,
        cash_account_id: cash_acc.id,
        date: "2023-01-01".to_string(),
        ticker: "BAR".to_string(),
        shares: 5.0,
        price_per_share: 10.0,
        fee: 1.0,
        is_buy: true,
    };

    let created = crate::create_brokerage_transaction_db(&db_path, args).unwrap();

    // Remove link and change notes so fallback won't find it
    let conn = rusqlite::Connection::open(&db_path).unwrap();
    conn.execute(
        "UPDATE transactions SET linked_tx_id = NULL WHERE id = ?1",
        rusqlite::params![created.id],
    )
    .unwrap();
    // Change cash tx notes to something else
    let cash_tx_id: i32 = conn
        .query_row(
            "SELECT id FROM transactions WHERE account_id = ?1 AND category = 'Transfer' LIMIT 1",
            rusqlite::params![cash_acc.id],
            |r| r.get(0),
        )
        .unwrap();
    conn.execute(
        "UPDATE transactions SET notes = 'DIFFERENT' WHERE id = ?1",
        rusqlite::params![cash_tx_id],
    )
    .unwrap();

    // Update brokerage transaction
    let update_args = crate::UpdateBrokerageTransactionArgs {
        id: created.id,
        brokerage_account_id: brokerage_acc.id,
        date: "2023-01-02".to_string(),
        ticker: "BAR".to_string(),
        shares: 10.0,
        price_per_share: 10.0,
        fee: 1.0,
        is_buy: true,
    };

    crate::update_brokerage_transaction_db(&db_path, update_args).unwrap();

    // Cash account unchanged
    let accounts_after = crate::get_accounts_db(&db_path).unwrap();
    let cash_after = accounts_after
        .iter()
        .find(|a| a.id == cash_acc.id)
        .unwrap()
        .balance;
    // Initial cash was 1000, after buy 5*10+1= -51 -> cash = 949, but after update it should not have been adjusted further because we removed counterpart; update only changes brokerage
    assert_eq!(cash_after, 949.0);
}
