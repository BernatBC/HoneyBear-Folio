use crate::models::{YahooChartResponse, YahooQuote, YahooSearchQuote, DailyPrice};
use rusqlite::{params, Connection, OptionalExtension};
use chrono::{NaiveDate, TimeZone, Utc};

pub async fn search_ticker_with_client(
    client: reqwest::Client,
    base_url: String,
    query: String,
) -> Result<Vec<YahooSearchQuote>, String> {
    let url = format!("{}/v1/finance/search?q={}", base_url, query);
    let res = client
        .get(&url)
        .header("User-Agent", "Mozilla/5.0")
        .send()
        .await
        .map_err(|e| e.to_string())?;

    let text = res.text().await.map_err(|e| e.to_string())?;
    let response: crate::models::YahooSearchResponse = serde_json::from_str(&text).map_err(|e| e.to_string())?;

    Ok(response.quotes)
}

// Search helper that enriches results with currency info using get_stock_quotes
pub async fn search_ticker(
    app_handle: tauri::AppHandle,
    query: String,
) -> Result<Vec<YahooSearchQuote>, String> {
    // 1. Get initial search results
    let mut quotes = search_ticker_with_client(reqwest::Client::new(), "https://query1.finance.yahoo.com".to_string(), query).await?;

    if quotes.is_empty() {
        return Ok(quotes);
    }

    // 2. Fetch full quotes to get currencies for these symbols
    let tickers: Vec<String> = quotes.iter().map(|q| q.symbol.clone()).collect();
    let full_quotes = get_stock_quotes(app_handle, tickers)
        .await
        .unwrap_or_default();

    // 3. Merge currency info back into search results
    for q in &mut quotes {
        if let Some(fq) = full_quotes.iter().find(|f| f.symbol == q.symbol) {
            q.currency = fq.currency.clone();
        }
    }

    Ok(quotes)
}

pub async fn get_stock_quotes(
    app_handle: tauri::AppHandle,
    tickers: Vec<String>,
) -> Result<Vec<YahooQuote>, String> {
    get_stock_quotes_with_client(
        reqwest::Client::builder()
            .build()
            .map_err(|e| e.to_string())?,
        "https://query1.finance.yahoo.com".to_string(),
        app_handle,
        tickers,
    )
    .await
}

pub async fn get_stock_quotes_with_client(
    client: reqwest::Client,
    base_url: String,
    app_handle: tauri::AppHandle,
    tickers: Vec<String>,
) -> Result<Vec<YahooQuote>, String> {
    if tickers.is_empty() {
        return Ok(Vec::new());
    }

    let mut tasks = Vec::new();

    for ticker in tickers.clone() {
        let client = client.clone();
        let base_url = base_url.clone();
        tasks.push(tokio::spawn(async move {
            let url = format!("{}/v8/finance/chart/{}?interval=1d&range=1d", base_url, ticker);
            let res = client.get(&url)
                .header("User-Agent", "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36")
                .send()
                .await;

            match res {
                Ok(resp) => {
                    if resp.status().is_success() {
                        let text_res = resp.text().await;
                        match text_res {
                            Ok(text) => {
                                let json: Result<YahooChartResponse, _> = serde_json::from_str(&text);
                                match json {
                                    Ok(data) => {
                                        if let Some(results) = data.chart.result {
                                            if let Some(item) = results.first() {
                                                let price = item.meta.regular_market_price.unwrap_or(0.0);
                                                let prev = item.meta.chart_previous_close
                                                    .or(item.meta.previous_close)
                                                    .unwrap_or(price);

                                                let change_percent = if prev != 0.0 {
                                                    ((price - prev) / prev) * 100.0
                                                } else {
                                                    0.0
                                                };
                                                return Some(YahooQuote {
                                                    symbol: item.meta.symbol.clone(),
                                                    price,
                                                    change_percent,
                                                    currency: item.meta.currency.clone(),
                                                    quote_type: item.meta.instrument_type.clone(),
                                                });
                                            }
                                        }
                                    },
                                    Err(e) => {
                                        println!("Failed to parse JSON for {}: {}", ticker, e);
                                    }
                                }
                            },
                            Err(e) => println!("Failed to get text for {}: {}", ticker, e),
                        }
                    } else {
                        println!("Request failed for {}: {}", ticker, resp.status());
                    }
                },
                Err(e) => {
                    println!("Request error for {}: {}", ticker, e);
                }
            }
            None
        }));
    }

    let mut quotes = Vec::new();
    for task in tasks {
        if let Ok(Some(quote)) = task.await {
            quotes.push(quote);
        }
    }

    // Update DB with new quotes
    let db_path = crate::db_init::get_db_path(&app_handle)?;
    let mut conn = Connection::open(db_path).map_err(|e| e.to_string())?;
    let tx = conn.transaction().map_err(|e| e.to_string())?;

    {
        let mut stmt = tx.prepare("INSERT OR REPLACE INTO stock_prices (ticker, price, last_updated) VALUES (?1, ?2, datetime('now'))").map_err(|e| e.to_string())?;
        for quote in &quotes {
            stmt.execute(params![quote.symbol, quote.price])
                .map_err(|e| e.to_string())?;
        }
    }
    tx.commit().map_err(|e| e.to_string())?;

    // If we missed some tickers, try to fetch from DB
    let found_symbols: Vec<String> = quotes.iter().map(|q| q.symbol.clone()).collect();
    let missing_tickers: Vec<String> = tickers
        .into_iter()
        .filter(|t| !found_symbols.iter().any(|s| s.eq_ignore_ascii_case(t)))
        .collect();

    if !missing_tickers.is_empty() {
        let conn = Connection::open(crate::db_init::get_db_path(&app_handle)?).map_err(|e| e.to_string())?;
        let mut stmt = conn
            .prepare("SELECT ticker, price FROM stock_prices WHERE ticker = ?1 COLLATE NOCASE")
            .map_err(|e| e.to_string())?;

        for ticker in missing_tickers {
            let res: Result<(String, f64), _> =
                stmt.query_row(params![ticker], |row| Ok((row.get(0)?, row.get(1)?)));

            if let Ok((symbol, price)) = res {
                quotes.push(YahooQuote {
                    symbol,
                    price,
                    change_percent: 0.0,
                    currency: None,
                    quote_type: None,
                });
            }
        }
    }

    Ok(quotes)
}

pub async fn get_stock_quotes_with_client_and_db(
    client: reqwest::Client,
    base_url: String,
    db_path: &std::path::Path,
    tickers: Vec<String>,
) -> Result<Vec<YahooQuote>, String> {
    if tickers.is_empty() {
        return Ok(Vec::new());
    }

    let mut tasks = Vec::new();

    for ticker in tickers.clone() {
        let client = client.clone();
        let base_url = base_url.clone();
        tasks.push(tokio::spawn(async move {
            let url = format!("{}/v8/finance/chart/{}?interval=1d&range=1d", base_url.trim_end_matches('/'), ticker);
            let res = client.get(&url)
                .header("User-Agent", "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36")
                .send()
                .await;

            match res {
                Ok(resp) => {
                    if resp.status().is_success() {
                        let text_res = resp.text().await;
                        match text_res {
                            Ok(text) => {
                                let json: Result<YahooChartResponse, _> = serde_json::from_str(&text);
                                match json {
                                    Ok(data) => {
                                        if let Some(results) = data.chart.result {
                                            if let Some(item) = results.first() {
                                                let price = item.meta.regular_market_price.unwrap_or(0.0);
                                                let prev = item.meta.chart_previous_close
                                                    .or(item.meta.previous_close)
                                                    .unwrap_or(price);

                                                let change_percent = if prev != 0.0 {
                                                    ((price - prev) / prev) * 100.0
                                                } else {
                                                    0.0
                                                };
                                                return Some(YahooQuote {
                                                    symbol: item.meta.symbol.clone(),
                                                    price,
                                                    change_percent,
                                                    currency: item.meta.currency.clone(),
                                                    quote_type: item.meta.instrument_type.clone(),
                                                });
                                            }
                                        }
                                    },
                                    Err(e) => {
                                        println!("Failed to parse JSON for {}: {}", ticker, e);
                                    }
                                }
                            },
                            Err(e) => println!("Failed to get text for {}: {}", ticker, e),
                        }
                    } else {
                        println!("Request failed for {}: {}", ticker, resp.status());
                    }
                },
                Err(e) => {
                    println!("Request error for {}: {}", ticker, e);
                }
            }
            None
        }));
    }

    let mut quotes = Vec::new();
    for task in tasks {
        if let Ok(Some(quote)) = task.await {
            quotes.push(quote);
        }
    }

    // Update DB with new quotes
    let mut conn = Connection::open(db_path).map_err(|e| e.to_string())?;
    let tx = conn.transaction().map_err(|e| e.to_string())?;

    {
        let mut stmt = tx.prepare("INSERT OR REPLACE INTO stock_prices (ticker, price, last_updated) VALUES (?1, ?2, datetime('now'))").map_err(|e| e.to_string())?;
        for quote in &quotes {
            stmt.execute(params![quote.symbol, quote.price])
                .map_err(|e| e.to_string())?;
        }
    }
    tx.commit().map_err(|e| e.to_string())?;

    // If we missed some tickers, try to fetch from DB
    let found_symbols: Vec<String> = quotes.iter().map(|q| q.symbol.clone()).collect();
    let missing_tickers: Vec<String> = tickers
        .into_iter()
        .filter(|t| !found_symbols.iter().any(|s| s.eq_ignore_ascii_case(t)))
        .collect();

    if !missing_tickers.is_empty() {
        let conn = Connection::open(db_path).map_err(|e| e.to_string())?;
        let mut stmt = conn
            .prepare("SELECT ticker, price FROM stock_prices WHERE ticker = ?1 COLLATE NOCASE")
            .map_err(|e| e.to_string())?;

        for ticker in missing_tickers {
            let res: Result<(String, f64), _> =
                stmt.query_row(params![ticker], |row| Ok((row.get(0)?, row.get(1)?)));

            if let Ok((symbol, price)) = res {
                quotes.push(YahooQuote {
                    symbol,
                    price,
                    change_percent: 0.0,
                    currency: None,
                    quote_type: None,
                });
            }
        }
    }

    Ok(quotes)
}

pub async fn update_daily_stock_prices_with_client_and_base(
    db_path: &std::path::Path,
    client: &reqwest::Client,
    base_url: &str,
    tickers: Vec<String>,
) -> Result<(), String> {
    if tickers.is_empty() {
        return Ok(());
    }

    for ticker in tickers {
        // 1. Get last date from DB
        let last_date_str: Option<String> = {
            let conn = Connection::open(db_path).map_err(|e| e.to_string())?;
            conn.query_row(
                "SELECT MAX(date) FROM daily_stock_prices WHERE ticker = ?1",
                params![ticker],
                |row| row.get(0),
            )
            .optional()
            .map_err(|e| e.to_string())?
            .flatten()
        };

        let start_timestamp = if let Some(date_str) = last_date_str {
            // Parse date and add 1 day
            let date =
                NaiveDate::parse_from_str(&date_str, "%Y-%m-%d").map_err(|e| e.to_string())?;
            let next_day = date.succ_opt().ok_or("Invalid date")?;
            let datetime = next_day.and_hms_opt(0, 0, 0).unwrap();
            datetime.and_utc().timestamp()
        } else {
            // Default to 10 years ago
            Utc::now().timestamp() - 10 * 365 * 24 * 60 * 60
        };

        let end_timestamp = Utc::now().timestamp();

        if start_timestamp >= end_timestamp {
            continue;
        }

        // 2. Fetch from Yahoo
        let url = format!(
            "{}/v8/finance/chart/{}?period1={}&period2={}&interval=1d",
            base_url, ticker, start_timestamp, end_timestamp
        );

        let res = client
            .get(&url)
            .header("User-Agent", "Mozilla/5.0")
            .send()
            .await
            .map_err(|e| e.to_string())?;

        if !res.status().is_success() {
            println!("Failed to fetch history for {}: {}", ticker, res.status());
            continue;
        }

        let text = res.text().await.map_err(|e| e.to_string())?;
        let json: crate::models::YahooChartResponse = serde_json::from_str(&text).map_err(|e| e.to_string())?;

        // 3. Insert into DB
        if let Some(result) = json.chart.result {
            if let Some(data) = result.first() {
                if let (Some(timestamps), Some(indicators)) = (&data.timestamp, &data.indicators) {
                    if let Some(quotes) = &indicators.quote {
                        if let Some(quote) = quotes.first() {
                            if let Some(closes) = &quote.close {
                                let mut conn =
                                    Connection::open(db_path).map_err(|e| e.to_string())?;
                                let tx = conn.transaction().map_err(|e| e.to_string())?;
                                {
                                    let mut stmt = tx.prepare(
                                        "INSERT OR REPLACE INTO daily_stock_prices (ticker, date, price) VALUES (?1, ?2, ?3)"
                                    )
                                    .map_err(|e: rusqlite::Error| e.to_string())?;

                                    for (i, ts) in timestamps.iter().enumerate() {
                                        if let Some(price) = closes.get(i).and_then(|p| *p) {
                                            let date_str = Utc
                                                .timestamp_opt(*ts, 0)
                                                .unwrap()
                                                .format("%Y-%m-%d")
                                                .to_string();
                                            stmt.execute(params![ticker, date_str, price])
                                                .map_err(|e| e.to_string())?;
                                        }
                                    }
                                }
                                tx.commit().map_err(|e: rusqlite::Error| e.to_string())?;
                            }
                        }
                    }
                }
            }
        }
    }

    Ok(())
}

pub async fn update_daily_stock_prices(
    app_handle: tauri::AppHandle,
    tickers: Vec<String>,
) -> Result<(), String> {
    // Allow overriding base URL via env var for testing
    let base_url = std::env::var("YAHOO_BASE_URL")
        .unwrap_or_else(|_| "https://query1.finance.yahoo.com".to_string());
    let db_path = crate::db_init::get_db_path(&app_handle)?;

    let client = reqwest::Client::new();
    update_daily_stock_prices_with_client_and_base(
        std::path::Path::new(&db_path),
        &client,
        &base_url,
        tickers,
    )
    .await
}

pub fn get_daily_stock_prices_from_path(
    db_path: &std::path::Path,
    ticker: String,
) -> Result<Vec<DailyPrice>, String> {
    let conn = Connection::open(db_path).map_err(|e| e.to_string())?;

    let mut stmt = conn
        .prepare("SELECT date, price FROM daily_stock_prices WHERE ticker = ?1 ORDER BY date ASC")
        .map_err(|e| e.to_string())?;

    let prices = stmt
        .query_map(params![ticker], |row| {
            Ok(DailyPrice {
                date: row.get(0)?,
                price: row.get(1)?,
            })
        })
        .map_err(|e| e.to_string())?
        .collect::<Result<Vec<_>, _>>()
        .map_err(|e| e.to_string())?;

    Ok(prices)
}

pub fn get_daily_stock_prices(app_handle: tauri::AppHandle, ticker: String) -> Result<Vec<DailyPrice>, String> {
    let db_path = crate::db_init::get_db_path(&app_handle)?;
    get_daily_stock_prices_from_path(std::path::Path::new(&db_path), ticker)
}

pub async fn check_currency_availability(app_handle: tauri::AppHandle, currency: String) -> Result<bool, String> {
    if currency == "USD" {
        return Ok(true);
    }

    let ticker = format!("{}USD=X", currency);
    let client = reqwest::Client::builder()
        .build()
        .map_err(|e| e.to_string())?;

    let quotes = get_stock_quotes_with_client(
        client,
        "https://query1.finance.yahoo.com".to_string(),
        app_handle,
        vec![ticker],
    )
    .await?;

    Ok(!quotes.is_empty())
}
