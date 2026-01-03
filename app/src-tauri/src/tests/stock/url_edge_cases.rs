use super::common::setup_db;
use httpmock::Method::GET;
use httpmock::MockServer;

#[tokio::test]
async fn test_get_stock_quotes_base_url_trailing_slash_works() {
    let (_dir, db_path) = setup_db();
    let server = MockServer::start();

    let _m = server.mock(|when, then| {
        when.method(GET).path("/v8/finance/chart/FOO");
        then.status(200)
            .header("content-type", "application/json")
            .body(r#"{"chart": {"result": [{"meta": {"symbol": "FOO", "regularMarketPrice": 50.0, "chartPreviousClose": 25.0}}]}}"#);
    });

    let client = reqwest::Client::builder().build().unwrap();

    // base with trailing slash
    let base_with_slash = format!("{}/", server.base_url());
    let quotes = crate::get_stock_quotes_with_client_and_db(
        client.clone(),
        base_with_slash,
        &db_path,
        vec!["FOO".to_string()],
    )
    .await
    .unwrap();

    assert_eq!(quotes.len(), 1);
    assert_eq!(quotes[0].symbol, "FOO");
    assert!((quotes[0].price - 50.0).abs() < 1e-6);

    // Also ensure DB updated
    let conn = rusqlite::Connection::open(&db_path).unwrap();
    let price: f64 = conn
        .query_row(
            "SELECT price FROM stock_prices WHERE ticker = ?1",
            rusqlite::params!["FOO"],
            |r| r.get(0),
        )
        .unwrap();
    assert!((price - 50.0).abs() < 1e-6);

    // Now without trailing slash (should also work)
    let quotes2 = crate::get_stock_quotes_with_client_and_db(
        reqwest::Client::builder().build().unwrap(),
        server.base_url(),
        &db_path,
        vec!["FOO".to_string()],
    )
    .await
    .unwrap();
    assert!(!quotes2.is_empty());
}
