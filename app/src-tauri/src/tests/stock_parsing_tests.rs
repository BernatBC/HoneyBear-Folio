use serde_json;

use crate::{YahooSearchResponse, YahooChartResponse};

#[test]
fn test_search_response_deserialize() {
    let json = r#"{
        "quotes": [
            {"symbol": "AAPL", "shortname": "Apple Inc.", "longname": "Apple Inc.", "exchange": "NMS", "typeDisp": "Equity"}
        ]
    }"#;

    let resp: YahooSearchResponse = serde_json::from_str(json).unwrap();
    assert_eq!(resp.quotes.len(), 1);
    assert_eq!(resp.quotes[0].symbol, "AAPL");
    assert_eq!(resp.quotes[0].shortname.as_deref(), Some("Apple Inc."));
}

#[test]
fn test_chart_response_parsing_change_percent() {
    let json = r#"{
        "chart": {
            "result": [
                { "meta": { "symbol": "FOO", "regularMarketPrice": 110.0, "chartPreviousClose": 100.0 } }
            ]
        }
    }"#;

    let resp: YahooChartResponse = serde_json::from_str(json).unwrap();
    let item = resp.chart.result.unwrap().into_iter().next().unwrap();
    let price = item.meta.regular_market_price.unwrap_or(0.0);
    let prev = item.meta.chart_previous_close.or(item.meta.previous_close).unwrap_or(price);
    let change_percent = if prev != 0.0 { ((price - prev) / prev) * 100.0 } else { 0.0 };

    assert!((change_percent - 10.0).abs() < 1e-6);
}
