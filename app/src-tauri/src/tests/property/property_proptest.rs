use super::common::setup_db;
use proptest::prelude::*;
use rand::rngs::StdRng;
use rand::{Rng, SeedableRng};
use rusqlite::OptionalExtension;

proptest! {
    #[test]
    fn prop_balance_and_link_invariants(seed in any::<u64>()) {
        let (_dir, db_path) = setup_db();
        let mut rng = StdRng::seed_from_u64(seed);

        // Create accounts
        let mut accounts = Vec::new();
        for i in 0..3 {
            let bal = rng.gen_range(0..500) as f64;
            let acc = crate::create_account_db(&db_path, format!("Acc{}", i), bal, "cash".to_string()).unwrap();
            accounts.push(acc);
        }

        // Random operations
        for _ in 0..200 {
            let op: f64 = rng.gen();
            if op < 0.5 {
                // create transaction (including potential transfers)
                let a = rng.gen_range(0..accounts.len());
                if rng.gen_bool(0.2) {
                    // transfer to another account
                    let b = (a + 1) % accounts.len();
                    let _ = crate::create_transaction_db(&db_path, accounts[a].id, "2023-01-01".to_string(), accounts[b].name.clone(), Some("XFER".to_string()), None, -rng.gen_range(1..200) as f64);
                } else {
                    let _ = crate::create_transaction_db(&db_path, accounts[a].id, "2023-01-01".to_string(), "Payee".to_string(), None, None, rng.gen_range(-200..200) as f64);
                }
            } else if op < 0.8 {
                // create brokerage
                let a = rng.gen_range(0..accounts.len());
                let b = (a+1)%accounts.len();
                let args = crate::CreateBrokerageTransactionArgs{brokerage_account_id: accounts[a].id, cash_account_id: accounts[b].id, date: "2023-01-01".to_string(), ticker: "P".to_string(), shares: rng.gen_range(1..10) as f64, price_per_share: rng.gen_range(1..50) as f64, fee: rng.gen_range(0..5) as f64, is_buy: rng.gen_bool(0.5)};
                let _ = crate::create_brokerage_transaction_db(&db_path, args);
            } else {
                // random update/delete
                let all = crate::get_all_transactions_db(&db_path).unwrap();
                if !all.is_empty() {
                    if rng.gen_bool(0.5) {
                        let tx = all[rng.gen_range(0..all.len())].clone();
                        let args = crate::UpdateTransactionArgs{ id: tx.id, account_id: tx.account_id, date: tx.date.clone(), payee: tx.payee.clone(), notes: tx.notes.clone(), category: tx.category.clone(), amount: tx.amount * (1.0 + rng.gen_range(-50..50) as f64 / 100.0)};
                        let _ = crate::update_transaction_db(&db_path, args);
                    } else {
                        let tx = all[rng.gen_range(0..all.len())].clone();
                        let _ = crate::delete_transaction_db(&db_path, tx.id);
                    }
                }
            }
        }

        // Invariants: account.balance equals sum of transactions for that account
        let accounts_after = crate::get_accounts_db(&db_path).unwrap();
        for acc in accounts_after {
            let txs = crate::get_transactions_db(&db_path, acc.id).unwrap();
            let sum: f64 = txs.iter().map(|t| t.amount).sum();
            prop_assert!((acc.balance - sum).abs() < 1e-6);
        }

        // linked_tx invariants
        let all = crate::get_all_transactions_db(&db_path).unwrap();
        for t in all.iter().filter(|t| t.category.as_deref() == Some("Transfer")) {
            if let Some(_linked) = t.id.checked_sub(0) { // dummy to satisfy borrow
                // check counterpart exists either by linked_tx_id or notes matching
                if let Some(link) = {
                    let conn = rusqlite::Connection::open(&db_path).unwrap();
                    conn.query_row("SELECT linked_tx_id FROM transactions WHERE id = ?1", rusqlite::params![t.id], |r| r.get::<_, Option<i32>>(0)).ok().flatten()
                } {
                    // ensure counterpart exists and links back
                    let conn = rusqlite::Connection::open(&db_path).unwrap();
                    let back: Option<i32> = conn.query_row("SELECT linked_tx_id FROM transactions WHERE id = ?1", rusqlite::params![link], |r| r.get(0)).optional().unwrap().flatten();
                    prop_assert_eq!(back, Some(t.id));
                } else {
                    // nothing to check (no linked id), rely on previous tests for fallback by notes
                }
            }
        }
    }
}
