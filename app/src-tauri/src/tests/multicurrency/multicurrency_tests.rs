use super::super::common::setup_db;
use tempfile::tempdir;


#[test]
fn test_transactions_store_currency() {
    let (_dir, db_path) = setup_db();
    let acc = crate::create_account_db(&db_path, "A".to_string(), 1000.0, None).unwrap();

    let tx = crate::create_transaction_db(
        &db_path,
        crate::CreateTransactionArgs {
            account_id: acc.id,
            date: "2023-01-01".to_string(),
            payee: "Payee".to_string(),
            notes: None,
            category: None,
            amount: -10.0,
            ticker: None,
            shares: None,
            price_per_share: None,
            fee: None,
            currency: Some("EUR".to_string()),
        },
    )
    .unwrap();

    let txs = crate::get_transactions_db(&db_path, acc.id).unwrap();
    assert!(txs.iter().any(|t| t.id == tx.id && t.currency.as_deref() == Some("EUR")));
}

#[test]
fn test_json_export_import_preserves_currency() {
    // Setup source DB and create account + transaction with non-default currency
    let src_dir = tempdir().unwrap();
    let src_path = src_dir.path().to_path_buf();
    let acc = crate::create_account_in_dir(&src_path, "ImportAccount".to_string(), 100.0).unwrap();
    let src_db = crate::get_db_path_for_dir(&src_path).unwrap();

    crate::create_transaction_db(
        &src_db,
        crate::CreateTransactionArgs {
            account_id: acc.id,
            date: "2023-01-02".to_string(),
            payee: "PayeeX".to_string(),
            notes: Some("Note".to_string()),
            category: Some("Misc".to_string()),
            amount: -42.0,
            ticker: None,
            shares: None,
            price_per_share: None,
            fee: None,
            currency: Some("JPY".to_string()),
        },
    )
    .unwrap();

    // Export all transactions as JSON
    let all = crate::get_all_transactions_db(&src_db).unwrap();
    let json = serde_json::to_string(&all).unwrap();

    // Setup destination DB and create an account with the same name so importer can map by name
    let dst_dir = tempdir().unwrap();
    let dst_path = dst_dir.path().to_path_buf();
    let dst_acc = crate::create_account_in_dir(&dst_path, acc.name.clone(), 0.0).unwrap();
    let dst_db = crate::get_db_path_for_dir(&dst_path).unwrap();

    // Deserialize exported JSON
    let parsed: Vec<crate::Transaction> = serde_json::from_str(&json).unwrap();

    // Import: map account by name from source -> find target account id in dest and insert
    let src_accounts = crate::get_accounts_db(&src_db).unwrap();
    let dst_accounts = crate::get_accounts_db(&dst_db).unwrap();

    for p in parsed {
        // Find source account name
        let src_acc = src_accounts.iter().find(|a| a.id == p.account_id).unwrap();
        let mapping_id = dst_accounts
            .iter()
            .find(|a| a.name == src_acc.name)
            .unwrap()
            .id;

        crate::create_transaction_db(
            &dst_db,
            crate::CreateTransactionArgs {
                account_id: mapping_id,
                date: p.date.clone(),
                payee: p.payee.clone(),
                notes: p.notes.clone(),
                category: p.category.clone(),
                amount: p.amount,
                ticker: p.ticker.clone(),
                shares: p.shares,
                price_per_share: p.price_per_share,
                fee: p.fee,
                currency: p.currency.clone(),
            },
        )
        .unwrap();
    }

    // Verify imported transactions preserved currency
    let imported = crate::get_transactions_db(&dst_db, dst_acc.id).unwrap();
    assert!(imported.iter().any(|t| t.currency.as_deref() == Some("JPY")));
}
