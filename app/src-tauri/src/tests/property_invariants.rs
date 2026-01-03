use super::common::setup_db;
use rand::rngs::StdRng;
use rand::{Rng, SeedableRng};

#[test]
fn test_randomized_balance_invariants() {
    let (_dir, db_path) = setup_db();

    let mut rng = StdRng::seed_from_u64(42);

    // Create some accounts with random initial balances
    let mut accounts = Vec::new();
    for i in 0..3 {
        let bal = if i == 2 { 0.0 } else { rng.gen_range(0..500) as f64 };
        let acc = crate::create_account_db(&db_path, format!("Acc{}", i), bal, "cash".to_string()).unwrap();
        accounts.push(acc);
    }

    // Keep track of transaction ids so we can update/delete
    let mut tx_ids: Vec<i32> = Vec::new();

    // Run a deterministic sequence of operations
    for _ in 0..100 {
        let op: f64 = rng.gen();
        if op < 0.6 {
            // create transaction
            let acc_idx = rng.gen_range(0..accounts.len());
            let amount = rng.gen_range(-200..200) as f64;
            if amount == 0.0 { continue; }
            let res = crate::create_transaction_db(&db_path, accounts[acc_idx].id, "2023-01-01".to_string(), "RandPay".to_string(), None, None, amount);
            if let Ok(tx) = res {
                tx_ids.push(tx.id);
            }
        } else if op < 0.85 {
            // update a random tx
            if !tx_ids.is_empty() {
                let idx = rng.gen_range(0..tx_ids.len());
                let tx_id = tx_ids[idx];
                // fetch tx to get account id
                let txs = crate::get_all_transactions_db(&db_path).unwrap();
                if let Some(tx) = txs.iter().find(|t| t.id == tx_id) {
                    let new_amount = rng.gen_range(-300..300) as f64;
                    let args = crate::UpdateTransactionArgs {
                        id: tx.id,
                        account_id: tx.account_id,
                        date: tx.date.clone(),
                        payee: tx.payee.clone(),
                        notes: tx.notes.clone(),
                        category: tx.category.clone(),
                        amount: new_amount,
                    };
                    let _ = crate::update_transaction_db(&db_path, args);
                }
            }
        } else {
            // delete a random tx
            if !tx_ids.is_empty() {
                let idx = rng.gen_range(0..tx_ids.len());
                let tx_id = tx_ids.remove(idx);
                let _ = crate::delete_transaction_db(&db_path, tx_id);
            }
        }
    }

    // Verify invariants: account.balance equals sum of that account's transactions
    let accounts_after = crate::get_accounts_db(&db_path).unwrap();
    for acc in accounts_after {
        let txs = crate::get_transactions_db(&db_path, acc.id).unwrap();
        let sum: f64 = txs.iter().map(|t| t.amount).sum();
        // Floating point small errors allowed
        assert!((acc.balance - sum).abs() < 1e-6, "Balance mismatch for account {}: {} != {}", acc.id, acc.balance, sum);
    }
}
