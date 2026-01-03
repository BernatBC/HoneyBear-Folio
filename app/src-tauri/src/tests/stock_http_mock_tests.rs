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
