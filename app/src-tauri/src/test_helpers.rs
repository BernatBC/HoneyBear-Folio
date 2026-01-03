use std::fs;
use std::path::PathBuf;
use rusqlite::Connection;

// Test-only helpers to allow testing settings and init_db logic without an AppHandle

pub(crate) fn settings_file_path_for_dir(dir: &PathBuf) -> PathBuf {
    dir.join("settings.json")
}

pub(crate) fn write_settings_to_dir(dir: &PathBuf, settings: &super::AppSettings) -> Result<(), String> {
    let settings_path = settings_file_path_for_dir(dir);
    let json = serde_json::to_string_pretty(settings).map_err(|e| e.to_string())?;
    fs::write(&settings_path, json).map_err(|e| e.to_string())?;
    Ok(())
}

pub(crate) fn read_settings_from_dir(dir: &PathBuf) -> Result<super::AppSettings, String> {
    let settings_path = settings_file_path_for_dir(dir);
    if settings_path.exists() {
        let contents = fs::read_to_string(&settings_path).map_err(|e| e.to_string())?;
        let s: super::AppSettings = serde_json::from_str(&contents).map_err(|e| e.to_string())?;
        Ok(s)
    } else {
        Ok(super::AppSettings::default())
    }
}

pub(crate) fn get_db_path_for_dir(dir: &PathBuf) -> Result<PathBuf, String> {
    // If the user has configured an override, use it
    if let Ok(settings) = read_settings_from_dir(dir) {
        if let Some(ref p) = settings.db_path {
            let pb = PathBuf::from(p);
            // Ensure parent dir exists
            if let Some(parent) = pb.parent() {
                if !parent.exists() {
                    fs::create_dir_all(parent).map_err(|e| e.to_string())?;
                }
            }
            return Ok(pb);
        }
    }

    // Default path
    let app_dir = dir;
    if !app_dir.exists() {
        fs::create_dir_all(&app_dir).map_err(|e| e.to_string())?;
    }
    Ok(app_dir.join("honeybear.db"))
}

pub(crate) fn init_db_at_path(db_path: &PathBuf) -> Result<(), String> {
    // Ensure parent dir exists
    if let Some(parent) = db_path.parent() {
        if !parent.exists() {
            fs::create_dir_all(parent).map_err(|e| e.to_string())?;
        }
    }

    let conn = Connection::open(db_path).map_err(|e| e.to_string())?;

    conn.execute(
        "CREATE TABLE IF NOT EXISTS accounts (
            id INTEGER PRIMARY KEY,
            name TEXT NOT NULL,
            balance REAL NOT NULL,
            kind TEXT DEFAULT 'cash'
        )",
        [],
    )
    .map_err(|e| e.to_string())?;

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
            FOREIGN KEY(account_id) REFERENCES accounts(id)
        )",
        [],
    )
    .map_err(|e| e.to_string())?;

    // Ensure we have a column to link transfer pairs so updates/deletes can keep both sides in sync
    {
        let mut stmt = conn
            .prepare("PRAGMA table_info(transactions)")
            .map_err(|e| e.to_string())?;
        let mut has_linked = false;
        let col_iter = stmt
            .query_map([], |row| row.get::<_, String>(1))
            .map_err(|e| e.to_string())?;
        for name in col_iter.flatten() {
            if name == "linked_tx_id" {
                has_linked = true;
                break;
            }
        }
        if !has_linked {
            // Safe to ALTER TABLE to add the nullable column
            conn.execute(
                "ALTER TABLE transactions ADD COLUMN linked_tx_id INTEGER",
                [],
            )
            .map_err(|e| e.to_string())?;
        }
    }

    conn.execute(
        "CREATE TABLE IF NOT EXISTS stock_prices (
            ticker TEXT PRIMARY KEY,
            price REAL NOT NULL,
            last_updated TEXT NOT NULL
        )",
        [],
    )
    .map_err(|e| e.to_string())?;

    Ok(())
}
