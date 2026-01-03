use super::common::setup_db;
use httpmock::MockServer;
use httpmock::Method::GET;

#[tokio::test]
async fn test_search_ticker_with_mock_server() {
    let server = MockServer::start();

    let _m = server.mock(|when, then| {
        when.method(GET)
            .path("/v1/finance/search")
            .query_param("q", "FOO");
        then.status(200)
            .header("content-type", "application/json")
            .body(r#"{"quotes":[{"symbol":"FOO","shortname":"Foo Inc."}]}"#);
    });

    let client = reqwest::Client::builder().build().unwrap();

    let res = crate::search_ticker_with_client(client, server.base_url(), "FOO".to_string()).await.unwrap();
    assert_eq!(res.len(), 1);
    assert_eq!(res[0].symbol, "FOO");
}

#[tokio::test]
async fn test_get_stock_quotes_with_db_fallback() {
    let (_dir, db_path) = setup_db();
    let server = MockServer::start();

    // Mock return for only FOO
    let _m1 = server.mock(|when, then| {
        when.method(GET).path("/v8/finance/chart/FOO");
        then.status(200)
            .header("content-type", "application/json")
            .body(r#"{"chart": {"result": [{"meta": {"symbol": "FOO", "regularMarketPrice": 110.0, "chartPreviousClose": 100.0}}]}}"#);
    });

    // Insert BAR into DB to be used as fallback
    let conn = rusqlite::Connection::open(&db_path).unwrap();
    conn.execute(
        "INSERT INTO stock_prices (ticker, price, last_updated) VALUES (?1, ?2, datetime('now'))",
        rusqlite::params!["BAR", 42.0],
    ).unwrap();

    let client = reqwest::Client::builder().build().unwrap();
    let quotes = crate::get_stock_quotes_with_client_and_db(client, server.base_url(), &db_path, vec!["FOO".to_string(), "BAR".to_string()]).await.unwrap();

    // Should have both FOO (from API) and BAR (from DB fallback)
    assert!(quotes.iter().any(|q| q.symbol == "FOO" && (q.price - 110.0).abs() < 1e-6));
    assert!(quotes.iter().any(|q| q.symbol == "BAR" && (q.price - 42.0).abs() < 1e-6));

    // Also ensure FOO was written to DB
    let conn2 = rusqlite::Connection::open(&db_path).unwrap();
    let price: f64 = conn2.query_row("SELECT price FROM stock_prices WHERE ticker = ?1", rusqlite::params!["FOO"], |r| r.get(0)).unwrap();
    assert!((price - 110.0).abs() < 1e-6);
}

#[tokio::test]
async fn test_get_stock_quotes_malformed_json_uses_db_fallback() {
    let (_dir, db_path) = setup_db();
    let server = MockServer::start();

    // FOO returns malformed JSON
    let _m_foo = server.mock(|when, then| {
        when.method(GET).path("/v8/finance/chart/FOO");
        then.status(200)
            .header("content-type", "application/json")
            .body("this is not json");
    });

    // Insert BAR into DB to be used as fallback
    let conn = rusqlite::Connection::open(&db_path).unwrap();
    conn.execute(
        "INSERT INTO stock_prices (ticker, price, last_updated) VALUES (?1, ?2, datetime('now'))",
        rusqlite::params!["BAR", 55.5],
    ).unwrap();

    let client = reqwest::Client::builder().build().unwrap();
    let quotes = crate::get_stock_quotes_with_client_and_db(client, server.base_url(), &db_path, vec!["FOO".to_string(), "BAR".to_string()]).await.unwrap();

    // FOO is malformed and should not be returned from API; BAR returns from DB fallback
    assert!(quotes.iter().any(|q| q.symbol == "BAR" && (q.price - 55.5).abs() < 1e-6));
    assert!(!quotes.iter().any(|q| q.symbol == "FOO"));

    // Ensure FOO not added to DB
    let conn2 = rusqlite::Connection::open(&db_path).unwrap();
    let res: Result<f64, _> = conn2.query_row("SELECT price FROM stock_prices WHERE ticker = ?1", rusqlite::params!["FOO"], |r| r.get(0));
    assert!(res.is_err());
}

#[tokio::test]
async fn test_get_stock_quotes_partial_failure_uses_db_fallback() {
    let (_dir, db_path) = setup_db();
    let server = MockServer::start();

    // FOO returns 500
    let _m_foo = server.mock(|when, then| {
        when.method(GET).path("/v8/finance/chart/FOO");
        then.status(500);
    });

    // BAR returns valid JSON
    let _m_bar = server.mock(|when, then| {
        when.method(GET).path("/v8/finance/chart/BAR");
        then.status(200)
            .header("content-type", "application/json")
            .body(r#"{"chart": {"result": [{"meta": {"symbol": "BAR", "regularMarketPrice": 20.0, "chartPreviousClose": 10.0}}]}}"#);
    });

    // Insert FOO in DB as fallback
    let conn = rusqlite::Connection::open(&db_path).unwrap();
    conn.execute(
        "INSERT INTO stock_prices (ticker, price, last_updated) VALUES (?1, ?2, datetime('now'))",
        rusqlite::params!["FOO", 9.5],
    ).unwrap();

    let client = reqwest::Client::builder().build().unwrap();
    let quotes = crate::get_stock_quotes_with_client_and_db(client, server.base_url(), &db_path, vec!["FOO".to_string(), "BAR".to_string()]).await.unwrap();

    // BAR from API, FOO from DB fallback
    assert!(quotes.iter().any(|q| q.symbol == "BAR" && (q.price - 20.0).abs() < 1e-6));
    assert!(quotes.iter().any(|q| q.symbol == "FOO" && (q.price - 9.5).abs() < 1e-6));
}

#[tokio::test]
async fn test_get_stock_quotes_change_percent_div_by_zero_guard() {
    let (_dir, db_path) = setup_db();
    let server = MockServer::start();

    // ZERO returns previous close = 0.0, regularMarketPrice 100.0
    let _m_zero = server.mock(|when, then| {
        when.method(GET).path("/v8/finance/chart/ZERO");
        then.status(200)
            .header("content-type", "application/json")
            .body(r#"{"chart": {"result": [{"meta": {"symbol": "ZERO", "regularMarketPrice": 100.0, "chartPreviousClose": 0.0}}]}}"#);
    });

    let client = reqwest::Client::builder().build().unwrap();
    let quotes = crate::get_stock_quotes_with_client_and_db(client, server.base_url(), &db_path, vec!["ZERO".to_string()]).await.unwrap();

    assert_eq!(quotes.len(), 1);
    assert_eq!(quotes[0].symbol, "ZERO");
    assert_eq!(quotes[0].price, 100.0);
    assert_eq!(quotes[0].change_percent, 0.0);
}
