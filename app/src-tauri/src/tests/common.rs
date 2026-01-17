use rusqlite::Connection;
use std::path::PathBuf;
use tempfile::tempdir;

pub fn setup_db() -> (tempfile::TempDir, PathBuf) {
    let dir = tempdir().unwrap();
    let db_path = dir.path().join("test.db");

    // Initialize DB schema used by tests
    let conn = Connection::open(&db_path).unwrap();
    conn.execute(
        "CREATE TABLE IF NOT EXISTS accounts (
            id INTEGER PRIMARY KEY,
            name TEXT NOT NULL,
            balance REAL NOT NULL,
            currency TEXT,
            kind TEXT DEFAULT 'cash'
        )",
        [],
    )
    .unwrap();

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
            currency TEXT,
            linked_tx_id INTEGER,
            FOREIGN KEY(account_id) REFERENCES accounts(id)
        )",
        [],
    )
    .unwrap();

    conn.execute(
        "CREATE TABLE IF NOT EXISTS stock_prices (
            ticker TEXT PRIMARY KEY,
            price REAL NOT NULL,
            last_updated TEXT NOT NULL
        )",
        [],
    )
    .unwrap();

    conn.execute(
        "CREATE TABLE IF NOT EXISTS rules (
            id INTEGER PRIMARY KEY,
            priority INTEGER NOT NULL DEFAULT 0,
            match_field TEXT NOT NULL,
            match_pattern TEXT NOT NULL,
            action_field TEXT NOT NULL,
            action_value TEXT NOT NULL
        )",
        [],
    )
    .unwrap();

    (dir, db_path)
}
