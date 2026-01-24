use crate::models::Account;
use rusqlite::Connection;
use std::collections::HashMap;
use tauri::AppHandle;

pub fn get_custom_rates_map(db_path: &std::path::PathBuf) -> Result<HashMap<String, f64>, String> {
    let conn = Connection::open(db_path).map_err(|e| e.to_string())?;
    let mut map = HashMap::new();
    let mut stmt = conn
        .prepare("SELECT currency, rate FROM custom_exchange_rates")
        .map_err(|e| e.to_string())?;
    let rows = stmt
        .query_map([], |row| {
            Ok((row.get::<_, String>(0)?, row.get::<_, f64>(1)?))
        })
        .map_err(|e| e.to_string())?;

    for r in rows {
        let (c, rate) = r.map_err(|e| e.to_string())?;
        map.insert(c, rate);
    }
    Ok(map)
}

pub fn calculate_account_balances(
    mut accounts: Vec<Account>,
    raw_data: Vec<(i32, String, f64)>,
    target: &str,
    rates: &HashMap<String, f64>,
    custom_rates: &HashMap<String, f64>,
) -> Vec<Account> {
    let mut account_currency_map: HashMap<i32, String> = HashMap::new();
    for acc in &accounts {
        if let Some(c) = &acc.currency {
            account_currency_map.insert(acc.id, c.clone());
        }
    }

    // Helper to compute rate
    let compute_rate = |src: &String,
                        dst: &String,
                        rates: &HashMap<String, f64>,
                        custom_rates: &HashMap<String, f64>|
     -> f64 {
        if src == dst {
            return 1.0;
        }

        // 1. Try direct pair first (e.g. EURGBP=X)
        let direct_ticker = format!("{}{}=X", src, dst);
        if let Some(r) = rates.get(&direct_ticker) {
            if *r > 0.0 {
                return *r;
            }
        }

        // 2. Fallback to USD pivot
        let get_rate_to_usd = |curr: &String| -> f64 {
            if curr == "USD" {
                return 1.0;
            }
            if let Some(r) = custom_rates.get(curr) {
                return *r;
            }
            *rates.get(&format!("{}USD=X", curr)).unwrap_or(&1.0)
        };

        let r_src = get_rate_to_usd(src);
        let r_dst = get_rate_to_usd(dst);

        if r_dst == 0.0 {
            return 1.0;
        }
        r_src / r_dst
    };

    let mut sums: HashMap<i32, f64> = HashMap::new();
    for (acc_id, tx_curr, amt) in raw_data {
        let acc_currency = account_currency_map
            .get(&acc_id)
            .map(|s| s.as_str())
            .unwrap_or(target);
        let rate = compute_rate(&tx_curr, &acc_currency.to_string(), rates, custom_rates);
        let val = amt * rate;
        sums.entry(acc_id).and_modify(|e| *e += val).or_insert(val);
    }

    for acc in &mut accounts {
        if let Some(sum) = sums.get(&acc.id) {
            acc.balance = *sum;
        }

        // Set exchange rate to target app currency
        if let Some(acc_curr) = &acc.currency {
            acc.exchange_rate = compute_rate(acc_curr, &target.to_string(), rates, custom_rates);
        } else {
            acc.exchange_rate = 1.0;
        }
    }
    accounts
}

// Custom exchange rate DB helpers moved here (used by tauri commands)
use rusqlite::params;
use std::path::PathBuf;

pub fn set_custom_exchange_rate_db(
    db_path: &PathBuf,
    currency: String,
    rate: f64,
) -> Result<(), String> {
    let conn = Connection::open(db_path).map_err(|e| e.to_string())?;
    conn.execute(
        "INSERT OR REPLACE INTO custom_exchange_rates (currency, rate) VALUES (?1, ?2)",
        params![currency, rate],
    )
    .map_err(|e| e.to_string())?;

    Ok(())
}

pub fn get_custom_exchange_rate_db(
    db_path: &PathBuf,
    currency: String,
) -> Result<Option<f64>, String> {
    let conn = Connection::open(db_path).map_err(|e| e.to_string())?;

    let mut stmt = conn
        .prepare("SELECT rate FROM custom_exchange_rates WHERE currency = ?1")
        .map_err(|e| e.to_string())?;
    let mut rows = stmt.query(params![currency]).map_err(|e| e.to_string())?;

    if let Some(row) = rows.next().map_err(|e| e.to_string())? {
        let rate: f64 = row.get(0).map_err(|e| e.to_string())?;
        Ok(Some(rate))
    } else {
        Ok(None)
    }
}

// System theme detection moved here
#[tauri::command]
pub fn get_system_theme() -> Result<String, String> {
    // Return "dark" or "light" based on heuristics per-platform. Keep implementation small and robust.
    #[cfg(target_os = "linux")]
    {
        use std::process::Command;
        // Try GNOME color-scheme
        if let Ok(o) = Command::new("gsettings")
            .args(["get", "org.gnome.desktop.interface", "color-scheme"])
            .output()
        {
            if o.status.success() {
                let s = String::from_utf8_lossy(&o.stdout).to_lowercase();
                if s.contains("prefer-dark") || s.contains("dark") {
                    return Ok("dark".to_string());
                }
            }
        }
        // Try GTK theme name
        if let Ok(o) = Command::new("gsettings")
            .args(["get", "org.gnome.desktop.interface", "gtk-theme"])
            .output()
        {
            if o.status.success() {
                let s = String::from_utf8_lossy(&o.stdout).to_lowercase();
                if s.contains("dark") {
                    return Ok("dark".to_string());
                }
            }
        }
        // Env var fallback
        if std::env::var("GTK_THEME")
            .map(|v| v.to_lowercase().contains("dark"))
            .unwrap_or(false)
        {
            return Ok("dark".to_string());
        }

        // Flatpak / portal fallback: try reading settings through the portal (works in sandboxed environments)
        // Uses `gdbus` to call org.freedesktop.portal.Settings.Read for org.gnome.desktop.interface keys.
        if let Ok(o) = Command::new("gdbus")
            .args([
                "call",
                "--session",
                "--dest",
                "org.freedesktop.portal.Desktop",
                "--object-path",
                "/org/freedesktop/portal/desktop",
                "--method",
                "org.freedesktop.portal.Settings.Read",
                "org.gnome.desktop.interface",
                "color-scheme",
            ])
            .output()
        {
            if o.status.success() {
                let s = String::from_utf8_lossy(&o.stdout).to_lowercase();
                if s.contains("prefer-dark") || s.contains("dark") {
                    return Ok("dark".to_string());
                }
            }
        }

        // Also try reading gtk-theme via the portal
        if let Ok(o) = Command::new("gdbus")
            .args([
                "call",
                "--session",
                "--dest",
                "org.freedesktop.portal.Desktop",
                "--object-path",
                "/org/freedesktop/portal/desktop",
                "--method",
                "org.freedesktop.portal.Settings.Read",
                "org.gnome.desktop.interface",
                "gtk-theme",
            ])
            .output()
        {
            if o.status.success() {
                let s = String::from_utf8_lossy(&o.stdout).to_lowercase();
                if s.contains("dark") {
                    return Ok("dark".to_string());
                }
            }
        }

        Ok("light".to_string())
    }

    #[cfg(target_os = "macos")]
    {
        use std::process::Command;
        if let Ok(o) = Command::new("defaults")
            .args(["read", "-g", "AppleInterfaceStyle"])
            .output()
        {
            if o.status.success() {
                let s = String::from_utf8_lossy(&o.stdout).to_lowercase();
                if s.contains("dark") {
                    return Ok("dark".to_string());
                }
            }
        }
        Ok("light".to_string())
    }

    #[cfg(target_os = "windows")]
    {
        use std::process::Command;
        if let Ok(o) = Command::new("reg")
            .args([
                "query",
                "HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Themes\\Personalize",
                "/v",
                "AppsUseLightTheme",
            ])
            .output()
        {
            if o.status.success() {
                let s = String::from_utf8_lossy(&o.stdout).to_lowercase();
                if s.contains("0x0") || s.contains("0x00000000") {
                    return Ok("dark".to_string());
                }
            }
        }
        Ok("light".to_string())
    }

    // Fallback for other targets
    #[cfg(not(any(target_os = "linux", target_os = "macos", target_os = "windows")))]
    {
        Ok("light".to_string())
    }
}

#[tauri::command]
pub fn set_custom_exchange_rate(
    app_handle: AppHandle,
    currency: String,
    rate: f64,
) -> Result<(), String> {
    let db_path = crate::db_init::get_db_path(&app_handle)?;
    set_custom_exchange_rate_db(&db_path, currency, rate)
}

#[tauri::command]
pub fn get_custom_exchange_rate(
    app_handle: AppHandle,
    currency: String,
) -> Result<Option<f64>, String> {
    let db_path = crate::db_init::get_db_path(&app_handle)?;
    get_custom_exchange_rate_db(&db_path, currency)
}
