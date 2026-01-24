mod core;
pub use crate::core::{accounts, db_init, markets, models, rules, transactions, utils};

pub use crate::models::{
    Account, AppSettings, DailyPrice, Rule, Transaction, YahooChartResponse, YahooQuote,
    YahooSearchQuote, YahooSearchResponse,
};

// Re-export utility helpers used by tests
pub use crate::utils::{
    calculate_account_balances, get_custom_exchange_rate_db,
    get_system_theme as get_system_theme_fn, set_custom_exchange_rate_db,
};

// Re-export transactions helpers
pub use crate::transactions::{get_categories_db, get_payees_db};

pub use crate::transactions::{
    create_investment_transaction_db,
    // re-export module helpers for tests
    create_transaction_db,
    delete_transaction_db,
    get_all_transactions_db,
    get_transactions_db,
    update_investment_transaction_db,
    update_transaction_db,
    CreateInvestmentTransactionArgs,
    CreateTransactionArgs,
    UpdateInvestmentTransactionArgs,
    UpdateTransactionArgs,
};

// Re-export accounts helpers used by tests
pub use crate::accounts::{
    create_account_db, delete_account_db, get_accounts_db, get_accounts_summary_db,
    rename_account_db, update_account_db,
};

// Re-export rules helpers used by tests
pub use crate::rules::{
    create_rule_db, delete_rule_db, get_rules_db, update_rule_db, update_rules_order_db,
};

// Re-export markets helpers used by tests
pub use crate::markets::{
    get_daily_stock_prices_from_path, get_stock_quotes_with_client_and_db,
    search_ticker_with_client, update_daily_stock_prices_with_client_and_base,
};

// Test-only helpers
#[cfg(test)]
pub(crate) use crate::tests::test_helpers::{
    create_account_in_dir, create_transaction_in_dir, get_db_path_for_dir, init_db_at_path,
    read_settings_from_dir, write_settings_to_dir,
};

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
                    let mut last =
                        utils::get_system_theme().unwrap_or_else(|_| "light".to_string());
                    loop {
                        std::thread::sleep(Duration::from_secs(2));
                        let current =
                            utils::get_system_theme().unwrap_or_else(|_| "light".to_string());
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
            accounts::create_account,
            accounts::rename_account,
            accounts::update_account,
            accounts::delete_account,
            accounts::get_accounts,
            transactions::create_transaction,
            transactions::get_transactions,
            transactions::get_all_transactions,
            transactions::create_investment_transaction,
            transactions::update_transaction,
            transactions::update_investment_transaction,
            transactions::delete_transaction,
            transactions::get_payees,
            transactions::get_categories,
            markets::search_ticker,
            markets::get_stock_quotes,
            markets::update_daily_stock_prices,
            markets::get_daily_stock_prices,
            markets::check_currency_availability,
            db_init::set_db_path,
            db_init::reset_db_path,
            db_init::get_db_path_command,
            utils::get_system_theme,
            utils::set_custom_exchange_rate,
            utils::get_custom_exchange_rate,
            rules::get_rules,
            rules::create_rule,
            rules::update_rule,
            rules::delete_rule,
            rules::update_rules_order,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}

#[cfg(test)]
mod tests;
