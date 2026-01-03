use tempfile::tempdir;

#[test]
fn test_write_and_read_settings() {
    let dir = tempdir().unwrap();
    let dir_path = dir.path().to_path_buf();

    let s = crate::AppSettings {
        db_path: Some(dir_path.join("db.sqlite").to_string_lossy().to_string()),
    };
    crate::write_settings_to_dir(&dir_path, &s).unwrap();

    let s2 = crate::read_settings_from_dir(&dir_path).unwrap();
    assert_eq!(s2.db_path, s.db_path);
}

#[test]
fn test_get_db_path_override_creates_parent_dir() {
    let dir = tempdir().unwrap();
    let nested = dir.path().join("nested").join("db.sqlite");
    let s = crate::AppSettings {
        db_path: Some(nested.to_string_lossy().to_string()),
    };
    crate::write_settings_to_dir(&dir.path().to_path_buf(), &s).unwrap();

    let pb = crate::get_db_path_for_dir(&dir.path().to_path_buf()).unwrap();
    assert_eq!(pb, nested);
    assert!(nested.parent().unwrap().exists());
}

#[test]
fn test_init_db_adds_linked_tx_column() {
    let dir = tempdir().unwrap();
    let db_path = dir.path().join("test.db");

    // create tables without linked_tx_id
    let conn = rusqlite::Connection::open(&db_path).unwrap();
    conn.execute("CREATE TABLE IF NOT EXISTS accounts (id INTEGER PRIMARY KEY, name TEXT NOT NULL, balance REAL NOT NULL, kind TEXT DEFAULT 'cash')", []).unwrap();
    conn.execute("CREATE TABLE IF NOT EXISTS transactions (id INTEGER PRIMARY KEY, account_id INTEGER NOT NULL, date TEXT NOT NULL, payee TEXT NOT NULL, notes TEXT, category TEXT, amount REAL NOT NULL, ticker TEXT, shares REAL, price_per_share REAL, fee REAL, FOREIGN KEY(account_id) REFERENCES accounts(id))", []).unwrap();

    // ensure linked_tx_id absent
    let has_linked_before: bool = conn
        .prepare("PRAGMA table_info(transactions)")
        .unwrap()
        .query_map([], |row| row.get::<_, String>(1))
        .unwrap()
        .flatten()
        .any(|c| c == "linked_tx_id");
    assert!(!has_linked_before);

    // call init_db_at_path
    crate::init_db_at_path(&db_path).unwrap();

    // check exists
    let conn2 = rusqlite::Connection::open(&db_path).unwrap();
    let has_linked_after: bool = conn2
        .prepare("PRAGMA table_info(transactions)")
        .unwrap()
        .query_map([], |row| row.get::<_, String>(1))
        .unwrap()
        .flatten()
        .any(|c| c == "linked_tx_id");
    assert!(has_linked_after);
}
