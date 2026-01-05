use super::common::setup_db;
use rand::rngs::StdRng;
use rand::{Rng, SeedableRng};
use rusqlite::Connection;

#[test]
fn test_randomized_balance_invariants() {
    let (_dir, db_path) = setup_db();

    let mut rng = StdRng::seed_from_u64(42);

    // Create some accounts with random initial balances
    let mut accounts = Vec::new();
    for i in 0..3 {
        let bal = if i == 2 {
            0.0
        } else {
            rng.random_range(0..500) as f64
        };
        let acc = crate::create_account_db(&db_path, format!("Acc{}", i), bal, "cash".to_string())
            .unwrap();
        accounts.push(acc);
    }

    // Keep track of transaction ids so we can update/delete
    let mut tx_ids: Vec<i32> = Vec::new();

    // Run a deterministic sequence of operations
    for _ in 0..100 {
        let op: f64 = rng.random();
        if op < 0.45 {
            // create transaction
            let acc_idx = rng.random_range(0..accounts.len());
            let amount = rng.random_range(-200..200) as f64;
            if amount == 0.0 {
                continue;
            }
            let res = crate::create_transaction_db(
                &db_path,
                accounts[acc_idx].id,
                "2023-01-01".to_string(),
                "RandPay".to_string(),
                None,
                None,
                amount,
                None,
                None,
                None,
                None,
            );
            if let Ok(tx) = res {
                tx_ids.push(tx.id);
            }
        } else if op < 0.65 {
            // create a transfer by using another account's name as payee
            let a = rng.random_range(0..accounts.len());
            let b = (a + 1) % accounts.len();
            let res = crate::create_transaction_db(
                &db_path,
                accounts[a].id,
                "2023-01-01".to_string(),
                accounts[b].name.clone(),
                Some("XFER".to_string()),
                None,
                -rng.random_range(1..150) as f64,
                None,
                None,
                None,
                None,
            );
            if let Ok(tx) = res {
                tx_ids.push(tx.id);
            }
        } else if op < 0.85 {
            // create brokerage transaction
            let brokerage_idx = rng.random_range(0..accounts.len());
            let cash_idx = (brokerage_idx + 1) % accounts.len();
            let args = crate::CreateBrokerageTransactionArgs {
                brokerage_account_id: accounts[brokerage_idx].id,
                cash_account_id: accounts[cash_idx].id,
                date: "2023-01-01".to_string(),
                ticker: "RND".to_string(),
                shares: rng.random_range(1..10) as f64,
                price_per_share: rng.random_range(1..50) as f64,
                fee: rng.random_range(0..5) as f64,
                is_buy: rng.random_bool(0.5),
            };
            let _ = crate::create_brokerage_transaction_db(&db_path, args);
        } else if op < 0.9 {
            // update a random tx
            if !tx_ids.is_empty() {
                let idx = rng.random_range(0..tx_ids.len());
                let tx_id = tx_ids[idx];
                // fetch tx to get account id
                let txs = crate::get_all_transactions_db(&db_path).unwrap();
                if let Some(tx) = txs.iter().find(|t| t.id == tx_id) {
                    let new_amount = rng.random_range(-300..300) as f64;
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
                let idx = rng.random_range(0..tx_ids.len());
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
        assert!(
            (acc.balance - sum).abs() < 1e-6,
            "Balance mismatch for account {}: {} != {}",
            acc.id,
            acc.balance,
            sum
        );
    }

    // Check linked tx invariants explicitly
    let conn = Connection::open(&db_path).unwrap();
    let mut stmt = conn
        .prepare("SELECT id, linked_tx_id FROM transactions WHERE linked_tx_id IS NOT NULL")
        .unwrap();
    let iter = stmt
        .query_map([], |row: &rusqlite::Row| {
            Ok((row.get::<_, i32>(0)?, row.get::<_, i32>(1)?))
        })
        .unwrap();
    for res in iter {
        let (id, linked) = res.unwrap();
        // counterpart should exist and point back
        let back: Option<i32> = conn
            .query_row(
                "SELECT linked_tx_id FROM transactions WHERE id = ?1",
                rusqlite::params![linked],
                |r: &rusqlite::Row| r.get::<_, Option<i32>>(0),
            )
            .unwrap();
        assert_eq!(back.unwrap(), id);
    }
}
