use super::common::setup_db;
use httpmock::Method::GET;
use httpmock::MockServer;
use rusqlite::Connection;

#[tokio::test]
async fn test_update_daily_stock_prices_inserts_prices() {
    let (_dir, db_path) = setup_db();
    // Ensure full DB schema (including daily_stock_prices) is present
    crate::init_db_at_path(&db_path).unwrap();

    let server = MockServer::start();

    let _m = server.mock(|when, then| {
        when.method(GET).path("/v8/finance/chart/FOO");
        then.status(200)
            .header("content-type", "application/json")
            .body(r#"{"chart":{"result":[{"meta":{"symbol":"FOO"},"timestamp":[1609459200,1609545600],"indicators":{"quote":[{"close":[100.0,110.0]}]}}]}}"#);
    });

    let client = reqwest::Client::builder().build().unwrap();
    crate::update_daily_stock_prices_with_client_and_base(&db_path, &client, &server.base_url(), vec!["FOO".to_string()]).await.unwrap();

    let conn = Connection::open(&db_path).unwrap();
    let price1: f64 = conn.query_row(
        "SELECT price FROM daily_stock_prices WHERE ticker = ?1 AND date = ?2",
        rusqlite::params!["FOO", "2021-01-01"],
        |r| r.get(0),
    ).unwrap();
    assert!((price1 - 100.0).abs() < 1e-6);

    let price2: f64 = conn.query_row(
        "SELECT price FROM daily_stock_prices WHERE ticker = ?1 AND date = ?2",
        rusqlite::params!["FOO", "2021-01-02"],
        |r| r.get(0),
    ).unwrap();
    assert!((price2 - 110.0).abs() < 1e-6);
}

#[tokio::test]
async fn test_update_replaces_existing() {
    let (_dir, db_path) = setup_db();
    crate::init_db_at_path(&db_path).unwrap();

    let conn = Connection::open(&db_path).unwrap();
    conn.execute(
        "INSERT INTO daily_stock_prices (ticker, date, price) VALUES (?1, ?2, ?3)",
        rusqlite::params!["FOO", "2021-01-01", 90.0],
    ).unwrap();

    let server = MockServer::start();
    let _m = server.mock(|when, then| {
        when.method(GET).path("/v8/finance/chart/FOO");
        then.status(200)
            .header("content-type", "application/json")
            .body(r#"{"chart":{"result":[{"meta":{"symbol":"FOO"},"timestamp":[1609459200],"indicators":{"quote":[{"close":[100.0]}]}}]}}"#);
    });

    let client = reqwest::Client::builder().build().unwrap();
    crate::update_daily_stock_prices_with_client_and_base(&db_path, &client, &server.base_url(), vec!["FOO".to_string()]).await.unwrap();

    let price: f64 = conn.query_row(
        "SELECT price FROM daily_stock_prices WHERE ticker = ?1 AND date = ?2",
        rusqlite::params!["FOO", "2021-01-01"],
        |r| r.get(0),
    ).unwrap();
    assert!((price - 100.0).abs() < 1e-6);
}

#[test]
fn test_get_daily_stock_prices_from_path_ordering() {
    let (_dir, db_path) = setup_db();
    crate::init_db_at_path(&db_path).unwrap();

    let conn = Connection::open(&db_path).unwrap();
    conn.execute(
        "INSERT INTO daily_stock_prices (ticker, date, price) VALUES (?1, ?2, ?3)",
        rusqlite::params!["FOO", "2021-01-03", 30.0],
    ).unwrap();
    conn.execute(
        "INSERT INTO daily_stock_prices (ticker, date, price) VALUES (?1, ?2, ?3)",
        rusqlite::params!["FOO", "2021-01-01", 10.0],
    ).unwrap();
    conn.execute(
        "INSERT INTO daily_stock_prices (ticker, date, price) VALUES (?1, ?2, ?3)",
        rusqlite::params!["FOO", "2021-01-02", 20.0],
    ).unwrap();

    let prices = crate::get_daily_stock_prices_from_path(&db_path, "FOO".to_string()).unwrap();
    assert_eq!(prices.len(), 3);
    assert_eq!(prices[0].date, "2021-01-01");
    assert!((prices[0].price - 10.0).abs() < 1e-6);
    assert_eq!(prices[1].date, "2021-01-02");
    assert_eq!(prices[2].date, "2021-01-03");
}
