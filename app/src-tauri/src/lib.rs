
use std::collections::{HashMap, HashSet};
use std::fs;
use std::path::PathBuf;
use tauri::AppHandle;

mod models;
mod db_init;
mod accounts;
mod transactions;
mod rules;
mod markets;
mod utils;

pub use crate::models::{
    Account,
    Transaction,
    Rule,
    DailyPrice,
    YahooQuote,
    YahooSearchQuote,
    YahooChartResponse,
    YahooSearchResponse,
    AppSettings,
};

// Re-export utility helpers used by tests
pub use crate::utils::{
    calculate_account_balances,
    get_custom_exchange_rate_db,
    set_custom_exchange_rate_db,
    get_system_theme as get_system_theme_fn,
};

// Re-export transactions helpers
pub use crate::transactions::{
    get_payees_db,
    get_categories_db,
};

// Re-export markets search helper
// (no direct re-export to avoid name collision with the tauri command wrapper)

pub use crate::transactions::{
    CreateTransactionArgs,
    CreateInvestmentTransactionArgs,
    UpdateTransactionArgs,
    UpdateInvestmentTransactionArgs,
    // re-export module helpers for tests
    create_transaction_db,
    create_investment_transaction_db,
    update_transaction_db,
    update_investment_transaction_db,
    delete_transaction_db,
    get_transactions_db,
    get_all_transactions_db,
};

// Re-export accounts helpers used by tests
pub use crate::accounts::{
    create_account_db,
    rename_account_db,
    update_account_db,
    delete_account_db,
    get_accounts_db,
    get_accounts_summary_db,
};

// Re-export rules helpers used by tests
pub use crate::rules::{
    get_rules_db,
    create_rule_db,
    update_rule_db,
    delete_rule_db,
    update_rules_order_db,
};

// Re-export markets helpers used by tests
pub use crate::markets::{
    search_ticker_with_client,
    get_stock_quotes_with_client_and_db,
    update_daily_stock_prices_with_client_and_base,
    get_daily_stock_prices_from_path,
};



// Test-only helpers to allow testing settings and init_db logic without an AppHandle
#[cfg(test)]
mod test_helpers;

#[cfg(test)]
pub(crate) use test_helpers::{
    create_account_in_dir, create_transaction_in_dir, get_db_path_for_dir, init_db_at_path,
    read_settings_from_dir, write_settings_to_dir,
};





#[tauri::command]
fn set_db_path(app_handle: AppHandle, path: String) -> Result<(), String> {
    let mut settings = db_init::read_settings(&app_handle)?;
    settings.db_path = Some(path.clone());
    db_init::write_settings(&app_handle, &settings)?;

    // Ensure any parent dir exists and initialize DB at new path
    let pb = PathBuf::from(path);
    if let Some(parent) = pb.parent() {
        if !parent.exists() {
            fs::create_dir_all(parent).map_err(|e| e.to_string())?;
        }
    }

    db_init::init_db(&app_handle)?;
    Ok(())
}

#[tauri::command]
fn reset_db_path(app_handle: AppHandle) -> Result<(), String> {
    let mut settings = db_init::read_settings(&app_handle)?;
    settings.db_path = None;
    db_init::write_settings(&app_handle, &settings)?;

    // Ensure default DB exists
    db_init::init_db(&app_handle)?;
    Ok(())
}

#[tauri::command]
fn get_db_path_command(app_handle: AppHandle) -> Result<String, String> {
    let pb = db_init::get_db_path(&app_handle)?;
    Ok(pb.to_string_lossy().to_string())
}



#[tauri::command]
fn create_account(
    app_handle: AppHandle,
    name: String,
    balance: f64,
    currency: Option<String>,
) -> Result<Account, String> {
    let db_path = db_init::get_db_path(&app_handle)?;
    accounts::create_account_db(&db_path, name, balance, currency)
}



#[tauri::command]
fn rename_account(app_handle: AppHandle, id: i32, new_name: String) -> Result<Account, String> {
    let db_path = db_init::get_db_path(&app_handle)?;
    accounts::rename_account_db(&db_path, id, new_name)
}



#[tauri::command]
fn update_account(
    app_handle: AppHandle,
    id: i32,
    name: String,
    currency: Option<String>,
) -> Result<Account, String> {
    let db_path = db_init::get_db_path(&app_handle)?;
    accounts::update_account_db(&db_path, id, name, currency)
}



#[tauri::command]
fn delete_account(app_handle: AppHandle, id: i32) -> Result<(), String> {
    let db_path = db_init::get_db_path(&app_handle)?;
    accounts::delete_account_db(&db_path, id)
}





#[tauri::command]
async fn get_accounts(
    app_handle: AppHandle,
    target_currency: Option<String>,
) -> Result<Vec<Account>, String> {
    let db_path = db_init::get_db_path(&app_handle)?;
    let target = target_currency.unwrap_or_else(|| "USD".to_string());

    let db_path_clone = db_path.clone();
    let target_clone = target.clone();

    // Use spawn_blocking for DB operations
    let summary = tauri::async_runtime::spawn_blocking(move || {
        accounts::get_accounts_summary_db(&db_path_clone, &target_clone)
    })
    .await
    .map_err(|e| e.to_string())??;

    let accounts = summary.accounts;
    let raw_data = summary.raw_data;

    // Load custom rates
    let custom_rates = utils::get_custom_rates_map(&db_path)?;

    // Determine which rates we need to fetch
    // Each account might have a specific currency preference.
    // If set, we convert all its txs to that currency.
    // If not set, we convert to global target.

    let mut account_currency_map: HashMap<i32, String> = HashMap::new();
    for acc in &accounts {
        if let Some(c) = &acc.currency {
            account_currency_map.insert(acc.id, c.clone());
        }
    }

    let mut tickers_to_fetch = HashSet::new();

    // 1. Identify all unique currencies involved
    let mut all_currencies = HashSet::new();
    all_currencies.insert(target.clone());
    for acc in &accounts {
        if let Some(c) = &acc.currency {
            all_currencies.insert(c.clone());
        }
    }
    for (_, tx_curr, _) in &raw_data {
        all_currencies.insert(tx_curr.clone());
    }

    // 2. Identify yahoo currencies (non-USD, non-custom)
    // We treat anything not in custom_rates as potentially on Yahoo.
    // We will verify by fetching X->USD for all of them.
    let mut yahoo_currencies = HashSet::new();
    for c in &all_currencies {
        if c != "USD" && !custom_rates.contains_key(c) {
            yahoo_currencies.insert(c.clone());
        }
    }

    // 3. Always fetch USD fallback for all yahoo currencies
    for c in &yahoo_currencies {
        tickers_to_fetch.insert(format!("{}USD=X", c));
    }

    // 4. Also fetch direct pairs if both sides are likely on Yahoo (to prefer direct rate)
    for (acc_id, tx_curr, _) in &raw_data {
        let acc_currency = account_currency_map.get(acc_id).unwrap_or(&target);
        if tx_curr != acc_currency {
            // If both are yahoo currencies (or USD), try fetching direct pair
            let is_yahoo_or_usd = |c: &String| c == "USD" || yahoo_currencies.contains(c);
            if is_yahoo_or_usd(tx_curr) && is_yahoo_or_usd(acc_currency) {
                tickers_to_fetch.insert(format!("{}{}=X", tx_curr, acc_currency));
            }
        }
    }

    // Also for account currency -> target currency
    for acc in &accounts {
        if let Some(acc_curr) = &acc.currency {
            if acc_curr != &target {
                let is_yahoo_or_usd = |c: &String| c == "USD" || yahoo_currencies.contains(c);
                if is_yahoo_or_usd(acc_curr) && is_yahoo_or_usd(&target) {
                    tickers_to_fetch.insert(format!("{}{}=X", acc_curr, target));
                }
            }
        }
    }

    let mut rates = HashMap::new();
    if !tickers_to_fetch.is_empty() {
        let tickers: Vec<String> = tickers_to_fetch.into_iter().collect();
        let client = reqwest::Client::builder()
            .build()
            .map_err(|e| e.to_string())?;

        let quotes = markets::get_stock_quotes_with_client(
            client,
            "https://query1.finance.yahoo.com".to_string(),
            app_handle.clone(),
            tickers,
        )
        .await?;

        for q in quotes {
            rates.insert(q.symbol.clone(), q.price);
        }
    }

    let accounts = utils::calculate_account_balances(accounts, raw_data, &target, &rates, &custom_rates);
    Ok(accounts)
}



#[tauri::command]
fn create_transaction(
    app_handle: AppHandle,
    args: CreateTransactionArgs,
) -> Result<Transaction, String> {
    let db_path = db_init::get_db_path(&app_handle)?;
    transactions::create_transaction_db(&db_path, args)
}



#[tauri::command]
fn get_transactions(app_handle: AppHandle, account_id: i32) -> Result<Vec<Transaction>, String> {
    let db_path = db_init::get_db_path(&app_handle)?;
    transactions::get_transactions_db(&db_path, account_id)
}



#[tauri::command]
fn get_all_transactions(app_handle: AppHandle) -> Result<Vec<Transaction>, String> {
    let db_path = db_init::get_db_path(&app_handle)?;
    transactions::get_all_transactions_db(&db_path)
}



#[tauri::command]
fn create_investment_transaction(
    app_handle: AppHandle,
    args: CreateInvestmentTransactionArgs,
) -> Result<Transaction, String> {
    let db_path = db_init::get_db_path(&app_handle)?;
    transactions::create_investment_transaction_db(&db_path, args)
}



#[tauri::command]
fn update_transaction(
    app_handle: AppHandle,
    args: UpdateTransactionArgs,
) -> Result<Transaction, String> {
    let db_path = db_init::get_db_path(&app_handle)?;
    transactions::update_transaction_db(&db_path, args)
}



#[tauri::command]
fn update_investment_transaction(
    app_handle: AppHandle,
    args: UpdateInvestmentTransactionArgs,
) -> Result<Transaction, String> {
    let db_path = db_init::get_db_path(&app_handle)?;
    transactions::update_investment_transaction_db(&db_path, args)
}



#[tauri::command]
fn delete_transaction(app_handle: AppHandle, id: i32) -> Result<(), String> {
    let db_path = db_init::get_db_path(&app_handle)?;
    transactions::delete_transaction_db(&db_path, id)
}



#[tauri::command]
fn get_payees(app_handle: AppHandle) -> Result<Vec<String>, String> {
    let db_path = db_init::get_db_path(&app_handle)?;
    transactions::get_payees_db(&db_path)
}

#[tauri::command]
fn get_categories(app_handle: AppHandle) -> Result<Vec<String>, String> {
    let db_path = db_init::get_db_path(&app_handle)?;
    transactions::get_categories_db(&db_path)
} 

#[tauri::command]
fn set_custom_exchange_rate(
    app_handle: AppHandle,
    currency: String,
    rate: f64,
) -> Result<(), String> {
    let db_path = db_init::get_db_path(&app_handle)?;
    utils::set_custom_exchange_rate_db(&db_path, currency, rate)
}

#[tauri::command]
fn get_custom_exchange_rate(
    app_handle: AppHandle,
    currency: String,
) -> Result<Option<f64>, String> {
    let db_path = db_init::get_db_path(&app_handle)?;
    utils::get_custom_exchange_rate_db(&db_path, currency)
} 

#[tauri::command]
async fn check_currency_availability(
    app_handle: AppHandle,
    currency: String,
) -> Result<bool, String> {
    markets::check_currency_availability(app_handle, currency).await
}

// Rules commands (forward to rules module)
#[tauri::command]
fn get_rules(app_handle: AppHandle) -> Result<Vec<Rule>, String> {
    let db_path = db_init::get_db_path(&app_handle)?;
    rules::get_rules_db(&db_path)
}

#[tauri::command]
fn create_rule(
    app_handle: AppHandle,
    priority: i32,
    match_field: String,
    match_pattern: String,
    action_field: String,
    action_value: String,
) -> Result<i32, String> {
    let db_path = db_init::get_db_path(&app_handle)?;
    rules::create_rule_db(
        &db_path,
        priority,
        match_field,
        match_pattern,
        action_field,
        action_value,
    )
}

#[tauri::command]
fn update_rule(
    app_handle: AppHandle,
    id: i32,
    priority: i32,
    match_field: String,
    match_pattern: String,
    action_field: String,
    action_value: String,
) -> Result<(), String> {
    let db_path = db_init::get_db_path(&app_handle)?;
    rules::update_rule_db(
        &db_path,
        id,
        priority,
        match_field,
        match_pattern,
        action_field,
        action_value,
    )
}

#[tauri::command]
fn delete_rule(app_handle: AppHandle, id: i32) -> Result<(), String> {
    let db_path = db_init::get_db_path(&app_handle)?;
    rules::delete_rule_db(&db_path, id)
}

#[tauri::command]
fn update_rules_order(app_handle: AppHandle, rule_ids: Vec<i32>) -> Result<(), String> {
    let db_path = db_init::get_db_path(&app_handle)?;
    rules::update_rules_order_db(&db_path, rule_ids)
}

#[tauri::command]
async fn search_ticker(app_handle: AppHandle, query: String) -> Result<Vec<YahooSearchQuote>, String> {
    markets::search_ticker(app_handle, query).await
} 



#[tauri::command]
async fn get_stock_quotes(
    app_handle: AppHandle,
    tickers: Vec<String>,
) -> Result<Vec<YahooQuote>, String> {
    markets::get_stock_quotes(app_handle, tickers).await
}





// Internal helper that performs the main fetching & DB insertion logic. Extracted to make testing easier.


#[tauri::command]
async fn update_daily_stock_prices(
    app_handle: AppHandle,
    tickers: Vec<String>,
) -> Result<(), String> {
    markets::update_daily_stock_prices(app_handle, tickers).await
}



#[tauri::command]
fn get_daily_stock_prices(
    app_handle: AppHandle,
    ticker: String,
) -> Result<Vec<DailyPrice>, String> {
    markets::get_daily_stock_prices(app_handle, ticker)
}

#[tauri::command]
fn get_system_theme() -> Result<String, String> {
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

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_process::init())
        .plugin(tauri_plugin_updater::Builder::new().build())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_shell::init())
        .setup(|app| {
            db_init::init_db(app.handle())?;

            #[cfg(target_os = "linux")]
            {
                use tauri::Emitter;
                let handle = app.handle().clone();
                std::thread::spawn(move || {
                    use std::time::Duration;
                    let mut last = utils::get_system_theme().unwrap_or_else(|_| "light".to_string());
                    loop {
                        std::thread::sleep(Duration::from_secs(2));
                        let current = utils::get_system_theme().unwrap_or_else(|_| "light".to_string());
                        if current != last {
                            last = current.clone();
                            let _ = handle.emit("system-theme-changed", current);
                        }
                    }
                });
            }

            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            create_account,
            get_accounts,
            create_transaction,
            get_transactions,
            get_all_transactions,
            update_transaction,
            delete_transaction,
            get_payees,
            get_categories,
            create_investment_transaction,
            update_investment_transaction,
            get_stock_quotes,
            update_daily_stock_prices,
            get_daily_stock_prices,
            search_ticker,
            rename_account,
            update_account,
            delete_account,
            // DB path commands
            set_db_path,
            reset_db_path,
            get_db_path_command,
            // Desktop theme helper
            get_system_theme,
            set_custom_exchange_rate,
            get_custom_exchange_rate,
            check_currency_availability,
            get_rules,
            create_rule,
            update_rule,
            delete_rule,
            update_rules_order,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}

#[cfg(test)]
mod tests;
