use super::common::setup_db;

#[test]
fn test_create_account() {
    let (_dir, db_path) = setup_db();
    let account = crate::create_account_db(&db_path, "Test Account".to_string(), 100.0, None).unwrap();
    assert_eq!(account.name, "Test Account");
    assert_eq!(account.balance, 100.0);

    // Check initial transaction
    let transactions = crate::get_transactions_db(&db_path, account.id).unwrap();
    assert_eq!(transactions.len(), 1);
    assert_eq!(transactions[0].amount, 100.0);
    assert_eq!(transactions[0].payee, "Opening Balance");
}

#[test]
fn test_create_account_zero_balance_no_initial_tx() {
    let (_dir, db_path) = setup_db();
    let account = crate::create_account_db(&db_path, "Zero".to_string(), 0.0, None).unwrap();
    let txs = crate::get_transactions_db(&db_path, account.id).unwrap();
    assert_eq!(txs.len(), 0);
}

#[test]
fn test_create_account_negative_balance_creates_initial_tx() {
    let (_dir, db_path) = setup_db();
    let acc = crate::create_account_db(&db_path, "Neg".to_string(), -50.0, None).unwrap();
    let txs = crate::get_transactions_db(&db_path, acc.id).unwrap();
    assert_eq!(txs.len(), 1);
    assert_eq!(txs[0].amount, -50.0);
    assert_eq!(txs[0].payee, "Opening Balance");
}

#[test]
fn test_create_account_initial_tx_details() {
    let (_dir, db_path) = setup_db();
    let account = crate::create_account_db(&db_path, "Detail".to_string(), 200.0, None).unwrap();
    let txs = crate::get_transactions_db(&db_path, account.id).unwrap();
    assert_eq!(txs.len(), 1);
    assert_eq!(txs[0].notes.as_deref(), Some("Initial Balance"));
    assert_eq!(txs[0].category.as_deref(), Some("Income"));
}

#[test]
fn test_get_accounts_returns_all() {
    let (_dir, db_path) = setup_db();
    crate::create_account_db(&db_path, "A".to_string(), 0.0, None).unwrap();
    crate::create_account_db(&db_path, "B".to_string(), 0.0, None).unwrap();
    let accounts = crate::get_accounts_db(&db_path).unwrap();
    assert!(accounts.iter().any(|a| a.name == "A"));
    assert!(accounts.iter().any(|a| a.name == "B"));
}

#[test]
fn test_create_account_duplicate_should_error() {
    let (_dir, db_path) = setup_db();
    crate::create_account_db(&db_path, "Dup".to_string(), 0.0, None).unwrap();
    let res = crate::create_account_db(&db_path, "Dup".to_string(), 0.0, None);
    assert!(res.is_err());

    // Case-insensitive check
    let res2 = crate::create_account_db(&db_path, "dup".to_string(), 0.0, None);
    assert!(res2.is_err());
}

#[test]
fn test_create_duplicate_account_should_error() {
    let (_dir, db_path) = setup_db();
    crate::create_account_db(&db_path, "Dup".to_string(), 0.0, None).unwrap();
    let res = crate::create_account_db(&db_path, "Dup".to_string(), 0.0, None);
    assert!(res.is_err());
}

#[test]
fn test_create_duplicate_account_case_insensitive_should_error() {
    let (_dir, db_path) = setup_db();
    crate::create_account_db(&db_path, "FooBar".to_string(), 0.0, None).unwrap();
    let res = crate::create_account_db(&db_path, "foobar".to_string(), 0.0, None);
    assert!(res.is_err());
}

#[test]
fn test_create_account_with_currency_sets_account_and_tx_currency() {
    let (_dir, db_path) = setup_db();
    let acc = crate::create_account_db(&db_path, "CurAcct".to_string(), 100.0, Some("USD".to_string())).unwrap();
    assert_eq!(acc.currency.as_deref(), Some("USD"));

    let txs = crate::get_transactions_db(&db_path, acc.id).unwrap();
    assert_eq!(txs.len(), 1);
    assert_eq!(txs[0].currency.as_deref(), Some("USD"));
}

#[test]
fn test_create_account_without_currency_transaction_currency_none() {
    let (_dir, db_path) = setup_db();
    let acc = crate::create_account_db(&db_path, "NoCurAcct".to_string(), 50.0, None).unwrap();
    assert_eq!(acc.currency, None);

    let txs = crate::get_transactions_db(&db_path, acc.id).unwrap();
    assert_eq!(txs.len(), 1);
    assert_eq!(txs[0].currency, None);
}
