use super::common::setup_db;

#[test]
fn test_update_investment_transaction_missing_id_should_error() {
    let (_dir, db_path) = setup_db();
    let args = crate::UpdateInvestmentTransactionArgs {
        id: -999,
        account_id: 1,
        date: "2023-01-01".to_string(),
        ticker: "AAPL".to_string(),
        shares: 1.0,
        price_per_share: 100.0,
        fee: 1.0,
        is_buy: true,
        notes: None,
        currency: None,
    };

    let res = crate::update_investment_transaction_db(&db_path, args);
    assert!(res.is_err());
}

#[test]
fn test_update_investment_transaction_updates_balance() {
    let (_dir, db_path) = setup_db();
    // Start with 1000
    let acc = crate::create_account_db(&db_path, "Invest".to_string(), 1000.0).unwrap();

    // Create initial buy: 10 * 100 + fee 2 = 1002 cost.
    // Balance: 1000 - 1002 = -2.0.
    let args = crate::CreateInvestmentTransactionArgs {
        account_id: acc.id,
        date: "2023-01-01".to_string(),
        ticker: "FOO".to_string(),
        shares: 10.0,
        price_per_share: 100.0,
        fee: 2.0,
        is_buy: true,
        currency: None,
    };

    let created = crate::create_investment_transaction_db(&db_path, args).unwrap();
    let accounts = crate::get_accounts_db(&db_path).unwrap();
    let acc_after_create = accounts.iter().find(|a| a.id == acc.id).unwrap();
    assert_eq!(acc_after_create.balance, -2.0);

    // Update to 5 shares at 200 with fee 1.
    // New Cost: 5 * 200 + 1 = 1001.
    // Expected Balance: 1000 - 1001 = -1.0.
    let update_args = crate::UpdateInvestmentTransactionArgs {
        id: created.id,
        account_id: acc.id,
        date: "2023-01-02".to_string(),
        ticker: "FOO".to_string(),
        shares: 5.0,
        price_per_share: 200.0,
        fee: 1.0,
        is_buy: true,
        notes: None,
        currency: None,
    };

    crate::update_investment_transaction_db(&db_path, update_args).unwrap();

    let accounts_after = crate::get_accounts_db(&db_path).unwrap();
    let acc_after_update = accounts_after.iter().find(|a| a.id == acc.id).unwrap();

    // Previous balance contribution (-1002) removed, new contribution (-1001) added.
    // -2.0 + 1002 - 1001 = -1.0. Correct.
    assert_eq!(acc_after_update.balance, -1.0);
}

#[test]
fn test_update_investment_transaction_custom_notes() {
    let (_dir, db_path) = setup_db();
    let acc = crate::create_account_db(&db_path, "Invest".to_string(), 1000.0).unwrap();

    let args = crate::CreateInvestmentTransactionArgs {
        account_id: acc.id,
        date: "2023-01-01".to_string(),
        ticker: "FOO".to_string(),
        shares: 10.0,
        price_per_share: 100.0,
        fee: 2.0,
        is_buy: true,
        currency: None,
    };

    let created = crate::create_investment_transaction_db(&db_path, args).unwrap();

    // Update with custom notes
    let custom_note = "CUSTOM NOTE 123".to_string();
    let update_args = crate::UpdateInvestmentTransactionArgs {
        id: created.id,
        account_id: acc.id,
        date: "2023-01-02".to_string(),
        ticker: "FOO".to_string(),
        shares: 10.0,
        price_per_share: 100.0,
        fee: 2.0,
        is_buy: true,
        notes: Some(custom_note.clone()),
        currency: None,
    };

    crate::update_investment_transaction_db(&db_path, update_args).unwrap();

    let txs = crate::get_transactions_db(&db_path, acc.id).unwrap();
    let tx = txs.iter().find(|t| t.id == created.id).unwrap();
    assert_eq!(tx.notes.as_deref(), Some(custom_note.as_str()));
}

#[test]
fn test_update_investment_transaction_sell_changes_amounts() {
    let (_dir, db_path) = setup_db();
    let acc = crate::create_account_db(&db_path, "Invest".to_string(), 1000.0).unwrap();

    // Create initial buy: 10 * 100 + fee 2 = 1002 out.
    // Bal: -2.0.
    let args = crate::CreateInvestmentTransactionArgs {
        account_id: acc.id,
        date: "2023-01-01".to_string(),
        ticker: "FOO".to_string(),
        shares: 10.0,
        price_per_share: 100.0,
        fee: 2.0,
        is_buy: true,
        currency: None,
    };

    let created = crate::create_investment_transaction_db(&db_path, args).unwrap();

    // Update to sell (is_buy = false) same amounts.
    // Sell: 10 * 100 - fee 2 = 998 in.
    // Expected Bal: 1000 + 998 = 1998.0.
    let update_args = crate::UpdateInvestmentTransactionArgs {
        id: created.id,
        account_id: acc.id,
        date: "2023-01-02".to_string(),
        ticker: "FOO".to_string(),
        shares: 10.0,
        price_per_share: 100.0,
        fee: 2.0,
        is_buy: false,
        notes: None,
        currency: None,
    };

    crate::update_investment_transaction_db(&db_path, update_args).unwrap();

    let accounts = crate::get_accounts_db(&db_path).unwrap();
    let acc_new = accounts.iter().find(|a| a.id == acc.id).unwrap();

    assert_eq!(acc_new.balance, 1998.0);
}
