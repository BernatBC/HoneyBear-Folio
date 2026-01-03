use super::*;
use tempfile::tempdir;
use std::path::PathBuf;

fn setup_db() -> (tempfile::TempDir, PathBuf) {
    let dir = tempdir().unwrap();
    let db_path = dir.path().join("test.db");
    
    // Initialize DB schema
    let conn = Connection::open(&db_path).unwrap();
    conn.execute(
        "CREATE TABLE IF NOT EXISTS accounts (
            id INTEGER PRIMARY KEY,
            name TEXT NOT NULL,
            balance REAL NOT NULL,
            kind TEXT DEFAULT 'cash'
        )",
        [],
    ).unwrap();

    conn.execute(
        "CREATE TABLE IF NOT EXISTS transactions (
            id INTEGER PRIMARY KEY,
            account_id INTEGER NOT NULL,
            date TEXT NOT NULL,
            payee TEXT NOT NULL,
            notes TEXT,
            category TEXT,
            amount REAL NOT NULL,
            ticker TEXT,
            shares REAL,
            price_per_share REAL,
            fee REAL,
            linked_tx_id INTEGER,
            FOREIGN KEY(account_id) REFERENCES accounts(id)
        )",
        [],
    ).unwrap();
    
    conn.execute(
        "CREATE TABLE IF NOT EXISTS stock_prices (
            ticker TEXT PRIMARY KEY,
            price REAL NOT NULL,
            last_updated TEXT NOT NULL
        )",
        [],
    ).unwrap();

    (dir, db_path)
}

#[test]
fn test_create_account() {
    let (_dir, db_path) = setup_db();
    let account = create_account_db(&db_path, "Test Account".to_string(), 100.0, "cash".to_string()).unwrap();
    assert_eq!(account.name, "Test Account");
    assert_eq!(account.balance, 100.0);
    assert_eq!(account.kind, "cash");

    // Check initial transaction
    let transactions = get_transactions_db(&db_path, account.id).unwrap();
    assert_eq!(transactions.len(), 1);
    assert_eq!(transactions[0].amount, 100.0);
    assert_eq!(transactions[0].payee, "Opening Balance");
}

#[test]
fn test_rename_account() {
    let (_dir, db_path) = setup_db();
    let account = create_account_db(&db_path, "Old Name".to_string(), 0.0, "cash".to_string()).unwrap();
    let updated = rename_account_db(&db_path, account.id, "New Name".to_string()).unwrap();
    assert_eq!(updated.name, "New Name");
}

#[test]
fn test_delete_account() {
    let (_dir, db_path) = setup_db();
    let account = create_account_db(&db_path, "To Delete".to_string(), 0.0, "cash".to_string()).unwrap();
    delete_account_db(&db_path, account.id).unwrap();
    let accounts = get_accounts_db(&db_path).unwrap();
    assert!(accounts.is_empty());
}

#[test]
fn test_create_transaction() {
    let (_dir, db_path) = setup_db();
    let account = create_account_db(&db_path, "Test Account".to_string(), 100.0, "cash".to_string()).unwrap();
    
    let tx = create_transaction_db(
        &db_path,
        account.id,
        "2023-01-01".to_string(),
        "Payee".to_string(),
        Some("Notes".to_string()),
        Some("Category".to_string()),
        -50.0
    ).unwrap();

    assert_eq!(tx.amount, -50.0);
    
    let accounts = get_accounts_db(&db_path).unwrap();
    assert_eq!(accounts[0].balance, 50.0); // 100 - 50
}

#[test]
fn test_transfer() {
    let (_dir, db_path) = setup_db();
    let acc1 = create_account_db(&db_path, "Acc1".to_string(), 100.0, "cash".to_string()).unwrap();
    let acc2 = create_account_db(&db_path, "Acc2".to_string(), 0.0, "cash".to_string()).unwrap();

    // Transfer 50 from Acc1 to Acc2
    // Payee should be "Acc2"
    create_transaction_db(
        &db_path,
        acc1.id,
        "2023-01-01".to_string(),
        "Acc2".to_string(),
        None,
        None,
        -50.0
    ).unwrap();

    let accounts = get_accounts_db(&db_path).unwrap();
    let acc1_new = accounts.iter().find(|a| a.id == acc1.id).unwrap();
    let acc2_new = accounts.iter().find(|a| a.id == acc2.id).unwrap();

    assert_eq!(acc1_new.balance, 50.0);
    assert_eq!(acc2_new.balance, 50.0);

    let txs1 = get_transactions_db(&db_path, acc1.id).unwrap();
    let txs2 = get_transactions_db(&db_path, acc2.id).unwrap();

    // txs1 has opening balance + transfer
    assert_eq!(txs1.len(), 2);
    // Opening balance is newer (date('now')) than transfer (2023-01-01)
    // So transfer is at index 1
    assert_eq!(txs1[1].category.as_deref(), Some("Transfer"));
    
    // txs2 has opening balance (if any, but 0 balance doesn't create one? wait, create_account checks epsilon)
    // create_account with 0 balance does NOT create initial transaction.
    assert_eq!(txs2.len(), 1);
    assert_eq!(txs2[0].category.as_deref(), Some("Transfer"));
    assert_eq!(txs2[0].amount, 50.0);
}

#[test]
fn test_brokerage_transaction() {
    let (_dir, db_path) = setup_db();
    let cash_acc = create_account_db(&db_path, "Cash".to_string(), 1000.0, "cash".to_string()).unwrap();
    let brokerage_acc = create_account_db(&db_path, "Brokerage".to_string(), 0.0, "investment".to_string()).unwrap();

    let args = CreateBrokerageTransactionArgs {
        brokerage_account_id: brokerage_acc.id,
        cash_account_id: cash_acc.id,
        date: "2023-01-01".to_string(),
        ticker: "AAPL".to_string(),
        shares: 10.0,
        price_per_share: 150.0,
        fee: 5.0,
        is_buy: true,
    };

    create_brokerage_transaction_db(&db_path, args).unwrap();

    let accounts = get_accounts_db(&db_path).unwrap();
    let cash_new = accounts.iter().find(|a| a.id == cash_acc.id).unwrap();
    let brokerage_new = accounts.iter().find(|a| a.id == brokerage_acc.id).unwrap();

    // Cash: 1000 - (10 * 150 + 5) = 1000 - 1505 = -505
    assert_eq!(cash_new.balance, -505.0);
    
    // Brokerage: 0 + (10 * 150) = 1500
    assert_eq!(brokerage_new.balance, 1500.0);
}

#[test]
fn test_update_transaction() {
    let (_dir, db_path) = setup_db();
    let account = create_account_db(&db_path, "Test".to_string(), 100.0, "cash".to_string()).unwrap();
    let tx = create_transaction_db(
        &db_path,
        account.id,
        "2023-01-01".to_string(),
        "Payee".to_string(),
        None,
        None,
        -10.0
    ).unwrap();

    let args = UpdateTransactionArgs {
        id: tx.id,
        account_id: account.id,
        date: "2023-01-02".to_string(),
        payee: "New Payee".to_string(),
        notes: Some("Updated".to_string()),
        category: Some("Food".to_string()),
        amount: -20.0,
    };

    update_transaction_db(&db_path, args).unwrap();

    let accounts = get_accounts_db(&db_path).unwrap();
    // Balance: 100 - 20 = 80
    assert_eq!(accounts[0].balance, 80.0);
}

#[test]
fn test_delete_transaction() {
    let (_dir, db_path) = setup_db();
    let account = create_account_db(&db_path, "Test".to_string(), 100.0, "cash".to_string()).unwrap();
    let tx = create_transaction_db(
        &db_path,
        account.id,
        "2023-01-01".to_string(),
        "Payee".to_string(),
        None,
        None,
        -10.0
    ).unwrap();

    delete_transaction_db(&db_path, tx.id).unwrap();

    let accounts = get_accounts_db(&db_path).unwrap();
    assert_eq!(accounts[0].balance, 100.0);
}