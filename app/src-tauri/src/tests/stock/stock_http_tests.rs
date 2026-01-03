use super::common::setup_db;
use httpmock::Method::GET;
use httpmock::MockServer;
use serde_json::json;
use tokio;

#[tokio::test]
async fn test_search_ticker_success() {
    let server = MockServer::start();

    let search_mock = server.mock(|when, then| {
        when.method(GET)
            .path("/v1/finance/search")
            .query_param("q", "AAPL");
        then.status(200)
            .header("content-type", "application/json")
            .body(json!({"quotes": [{"symbol": "AAPL", "shortname": "Apple"}]}).to_string());
    });

    let client = reqwest::Client::new();
    let resp = crate::search_ticker_with_client(client, server.base_url(), "AAPL".to_string())
        .await
        .unwrap();

    assert_eq!(resp.len(), 1);
    assert_eq!(resp[0].symbol, "AAPL");

    search_mock.assert();
}

#[tokio::test]
async fn test_get_stock_quotes_with_partial_fail_and_db_fallback() {
    let (_dir, db_path) = setup_db();
    let server = MockServer::start();

    // Successful response for FOO
    let foo_mock = server.mock(|when, then| {
        when.method(GET).path("/v8/finance/chart/FOO");
        then.status(200)
            .header("content-type", "application/json")
            .body(json!({"chart": {"result": [{"meta": {"symbol": "FOO", "regularMarketPrice": 110.0, "chartPreviousClose": 100.0}}]}}).to_string());
    });

    // Failure for BAA (return 500). This should trigger DB fallback later
    let _baa_mock = server.mock(|when, then| {
        when.method(GET).path("/v8/finance/chart/BAA");
        then.status(500);
    });

    // Pre-insert BAA into DB to be used as fallback
    let conn = rusqlite::Connection::open(&db_path).unwrap();
    conn.execute("INSERT OR REPLACE INTO stock_prices (ticker, price, last_updated) VALUES (?1, ?2, datetime('now'))", rusqlite::params!["BAA", 42.0]).unwrap();

    let client = reqwest::Client::new();
    let quotes = crate::get_stock_quotes_with_client_and_db(
        client,
        server.base_url(),
        &db_path,
        vec!["FOO".to_string(), "BAA".to_string()],
    )
    .await
    .unwrap();

    // FOO should be present with price 110, BAA should come from DB with price 42
    assert!(quotes
        .iter()
        .any(|q| q.symbol == "FOO" && (q.price - 110.0).abs() < 1e-6));
    assert!(quotes
        .iter()
        .any(|q| q.symbol == "BAA" && (q.price - 42.0).abs() < 1e-6));

    foo_mock.assert();
}
