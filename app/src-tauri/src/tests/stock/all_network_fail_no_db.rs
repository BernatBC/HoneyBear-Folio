use super::common::setup_db;
use httpmock::Method::GET;
use httpmock::MockServer;

#[tokio::test]
async fn test_get_stock_quotes_all_network_fail_and_no_db_fallback() {
    let (_dir, db_path) = setup_db();
    let server = MockServer::start();

    // Simulate network failure (500) for both tickers
    let _m_foo = server.mock(|when, then| {
        when.method(GET).path("/v8/finance/chart/FOO");
        then.status(500);
    });

    let _m_bar = server.mock(|when, then| {
        when.method(GET).path("/v8/finance/chart/BAR");
        then.status(500);
    });

    let client = reqwest::Client::builder().build().unwrap();
    let quotes = crate::get_stock_quotes_with_client_and_db(
        client,
        server.base_url(),
        &db_path,
        vec!["FOO".to_string(), "BAR".to_string()],
    )
    .await
    .unwrap();

    // No quotes should be returned and no DB fallback available
    assert!(quotes.is_empty());

    // Ensure no entries were written to DB for FOO/BAR
    let conn = rusqlite::Connection::open(&db_path).unwrap();
    let res_foo: Result<f64, _> = conn.query_row(
        "SELECT price FROM stock_prices WHERE ticker = ?1",
        rusqlite::params!["FOO"],
        |r| r.get(0),
    );
    let res_bar: Result<f64, _> = conn.query_row(
        "SELECT price FROM stock_prices WHERE ticker = ?1",
        rusqlite::params!["BAR"],
        |r| r.get(0),
    );
    assert!(res_foo.is_err());
    assert!(res_bar.is_err());
}
