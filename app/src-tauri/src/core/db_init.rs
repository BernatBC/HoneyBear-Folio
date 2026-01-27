use rusqlite::Connection;
use std::fs;
use std::path::PathBuf;
use tauri::{AppHandle, Manager};

use crate::models::AppSettings;

pub fn settings_file_path(app_handle: &AppHandle) -> Result<PathBuf, String> {
    let app_dir = app_handle
        .path()
        .app_data_dir()
        .map_err(|e| e.to_string())?;
    if !app_dir.exists() {
        fs::create_dir_all(&app_dir).map_err(|e| e.to_string())?;
    }
    Ok(app_dir.join("settings.json"))
}

pub fn read_settings(app_handle: &AppHandle) -> Result<AppSettings, String> {
    let settings_path = settings_file_path(app_handle)?;
    if settings_path.exists() {
        let contents = fs::read_to_string(&settings_path).map_err(|e| e.to_string())?;
        let s: AppSettings = serde_json::from_str(&contents).map_err(|e| e.to_string())?;
        Ok(s)
    } else {
        Ok(AppSettings::default())
    }
}

pub fn write_settings(app_handle: &AppHandle, settings: &AppSettings) -> Result<(), String> {
    let settings_path = settings_file_path(app_handle)?;
    let json = serde_json::to_string_pretty(settings).map_err(|e| e.to_string())?;
    fs::write(&settings_path, json).map_err(|e| e.to_string())?;
    Ok(())
}

pub fn get_db_path(app_handle: &AppHandle) -> Result<PathBuf, String> {
    // If the user has configured an override, use it
    if let Ok(settings) = read_settings(app_handle) {
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

    let app_dir = app_handle
        .path()
        .app_data_dir()
        .map_err(|e| e.to_string())?;
    if !app_dir.exists() {
        fs::create_dir_all(&app_dir).map_err(|e| e.to_string())?;
    }
    Ok(app_dir.join("honeybear.db"))
}

pub fn init_db(app_handle: &AppHandle) -> Result<(), String> {
    let db_path = get_db_path(app_handle)?;
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
            match conn.execute(
                "ALTER TABLE transactions ADD COLUMN linked_tx_id INTEGER",
                [],
            ) {
                Ok(_) => {}
                Err(e) => {
                    let s = e.to_string();
                    if !s.contains("duplicate column name") && !s.contains("already exists") {
                        return Err(s);
                    }
                }
            }
        }
    }

    // Ensure we have a column for currency (multi-currency support)
    {
        let mut stmt = conn
            .prepare("PRAGMA table_info(transactions)")
            .map_err(|e| e.to_string())?;
        let mut has_currency = false;
        let col_iter = stmt
            .query_map([], |row| row.get::<_, String>(1))
            .map_err(|e| e.to_string())?;
        for name in col_iter.flatten() {
            if name == "currency" {
                has_currency = true;
                break;
            }
        }
        if !has_currency {
            match conn.execute("ALTER TABLE transactions ADD COLUMN currency TEXT", []) {
                Ok(_) => {}
                Err(e) => {
                    let s = e.to_string();
                    if !s.contains("duplicate column name") && !s.contains("already exists") {
                        return Err(s);
                    }
                }
            }
        }
    }

    // Ensure we have a column for currency in accounts
    {
        let mut stmt = conn
            .prepare("PRAGMA table_info(accounts)")
            .map_err(|e| e.to_string())?;
        let mut has_currency = false;
        let col_iter = stmt
            .query_map([], |row| row.get::<_, String>(1))
            .map_err(|e| e.to_string())?;
        for name in col_iter.flatten() {
            if name == "currency" {
                has_currency = true;
                break;
            }
        }
        if !has_currency {
            match conn.execute("ALTER TABLE accounts ADD COLUMN currency TEXT", []) {
                Ok(_) => {}
                Err(e) => {
                    let s = e.to_string();
                    if !s.contains("duplicate column name") && !s.contains("already exists") {
                        return Err(s);
                    }
                }
            }
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

    conn.execute(
        "CREATE TABLE IF NOT EXISTS daily_stock_prices (
            ticker TEXT NOT NULL,
            date TEXT NOT NULL,
            price REAL NOT NULL,
            PRIMARY KEY (ticker, date)
        )",
        [],
    )
    .map_err(|e| e.to_string())?;

    conn.execute(
        "CREATE TABLE IF NOT EXISTS rules (
            id INTEGER PRIMARY KEY,
            priority INTEGER NOT NULL DEFAULT 0,
            match_field TEXT NOT NULL,
            match_pattern TEXT NOT NULL,
            action_field TEXT NOT NULL,
            action_value TEXT NOT NULL,
            logic TEXT NOT NULL DEFAULT 'and',
            conditions TEXT NOT NULL DEFAULT '[]',
            actions TEXT NOT NULL DEFAULT '[]'
        )",
        [],
    )
    .map_err(|e| e.to_string())?;

    // Migration: Add new columns to existing rules table if they don't exist
    let _ = conn.execute("ALTER TABLE rules ADD COLUMN logic TEXT NOT NULL DEFAULT 'and'", []);
    let _ = conn.execute("ALTER TABLE rules ADD COLUMN conditions TEXT NOT NULL DEFAULT '[]'", []);
    let _ = conn.execute("ALTER TABLE rules ADD COLUMN actions TEXT NOT NULL DEFAULT '[]'", []);

    conn.execute(
        "CREATE TABLE IF NOT EXISTS custom_exchange_rates (
            currency TEXT PRIMARY KEY,
            rate REAL NOT NULL
        )",
        [],
    )
    .map_err(|e| e.to_string())?;

    Ok(())
}

#[tauri::command]
pub fn set_db_path(app_handle: AppHandle, path: String) -> Result<(), String> {
    let mut settings = read_settings(&app_handle)?;
    settings.db_path = Some(path.clone());
    write_settings(&app_handle, &settings)?;

    // Ensure any parent dir exists and initialize DB at new path
    let pb = PathBuf::from(path);
    if let Some(parent) = pb.parent() {
        if !parent.exists() {
            fs::create_dir_all(parent).map_err(|e| e.to_string())?;
        }
    }

    init_db(&app_handle)?;
    Ok(())
}

#[tauri::command]
pub fn reset_db_path(app_handle: AppHandle) -> Result<(), String> {
    let mut settings = read_settings(&app_handle)?;
    settings.db_path = None;
    write_settings(&app_handle, &settings)?;

    // Ensure default DB exists
    init_db(&app_handle)?;
    Ok(())
}

#[tauri::command]
pub fn get_db_path_command(app_handle: AppHandle) -> Result<String, String> {
    let pb = get_db_path(&app_handle)?;
    Ok(pb.to_string_lossy().to_string())
}
