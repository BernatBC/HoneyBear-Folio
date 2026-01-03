use tempfile::tempdir;

#[test]
fn test_concurrent_init_db_is_idempotent() {
    let dir = tempdir().unwrap();
    let db_path = dir.path().join("concurrent.db");

    let mut handles = Vec::new();
    for _ in 0..10 {
        let path_clone = db_path.clone();
        handles.push(std::thread::spawn(move || {
            crate::init_db_at_path(&path_clone).unwrap();
        }));
    }

    for h in handles {
        h.join().expect("thread panicked");
    }

    // Ensure linked_tx_id column exists
    let conn = rusqlite::Connection::open(&db_path).unwrap();
    let has_linked_after: bool = conn.prepare("PRAGMA table_info(transactions)").unwrap().query_map([], |row| row.get::<_, String>(1)).unwrap().flatten().any(|c| c=="linked_tx_id");
    assert!(has_linked_after);
}
