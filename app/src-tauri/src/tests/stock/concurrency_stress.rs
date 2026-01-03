use super::common::setup_db;
use httpmock::MockServer;
use httpmock::Method::GET;

#[tokio::test]
async fn test_get_stock_quotes_concurrency_stress() {
    let (_dir, db_path) = setup_db();
    let server = MockServer::start();

    // Create a moderate number of tickers for stress (50)
    let tickers: Vec<String> = (0..50).map(|i| format!("T{:03}", i)).collect();

    // Register mock responses for each ticker
    for t in &tickers {
        let path = format!("/v8/finance/chart/{}", t);
        let symbol = t.clone();
        server.mock(move |when, then| {
            when.method(GET).path(path.as_str());
            then.status(200)
                .header("content-type", "application/json")
                .body(format!(r#"{{"chart": {{"result": [{{"meta": {{"symbol": "{}", "regularMarketPrice": 10.0, "chartPreviousClose": 9.0}}}}]}}}}"#, symbol));
        });
    }

    let client = reqwest::Client::builder().build().unwrap();

    // Fire multiple concurrent calls to the fetcher to increase stress
    let mut handles = Vec::new();
    for _ in 0..5 {
        let c = client.clone();
        let base = server.base_url();
        let db = db_path.clone();
        let tks = tickers.clone();
        handles.push(tokio::spawn(async move {
            crate::get_stock_quotes_with_client_and_db(c, base, &db, tks).await.unwrap()
        }));
    }

    // Await all tasks sequentially (they run concurrently; awaiting here ensures completion and lets us inspect results)
    for h in handles {
        let quotes = h.await.unwrap();
        // Some duplicates may occur across concurrent calls; ensure at least all tickers are present
        assert!(quotes.len() >= tickers.len());
        for t in &tickers {
            assert!(quotes.iter().any(|q| q.symbol == *t));
        }
    }

    // Spot check DB contains some tickers
    let conn = rusqlite::Connection::open(&db_path).unwrap();
    let mut stmt = conn.prepare("SELECT COUNT(*) FROM stock_prices").unwrap();
    let count: i32 = stmt.query_row([], |r| r.get(0)).unwrap();

    assert!(count > 0);
}
