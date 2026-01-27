use serde::{Deserialize, Serialize};

#[derive(Serialize, Deserialize, Debug)]
pub struct YahooQuote {
    pub symbol: String,
    #[serde(rename = "regularMarketPrice")]
    pub price: f64,
    #[serde(rename = "regularMarketChangePercent")]
    pub change_percent: f64,
    pub currency: Option<String>,
    #[serde(rename = "quoteType")]
    pub quote_type: Option<String>,
}

#[derive(Serialize, Deserialize, Debug)]
pub struct YahooChartMeta {
    pub symbol: String,
    #[serde(rename = "regularMarketPrice")]
    pub regular_market_price: Option<f64>,
    #[serde(rename = "chartPreviousClose")]
    pub chart_previous_close: Option<f64>,
    #[serde(rename = "previousClose")]
    pub previous_close: Option<f64>,
    pub currency: Option<String>,
    #[serde(rename = "instrumentType")]
    pub instrument_type: Option<String>,
}

#[derive(Serialize, Deserialize, Debug)]
pub struct YahooChartQuote {
    pub close: Option<Vec<Option<f64>>>,
}

#[derive(Serialize, Deserialize, Debug)]
pub struct YahooChartIndicators {
    pub quote: Option<Vec<YahooChartQuote>>,
}

#[derive(Serialize, Deserialize, Debug)]
pub struct YahooChartResult {
    pub meta: YahooChartMeta,
    pub timestamp: Option<Vec<i64>>,
    pub indicators: Option<YahooChartIndicators>,
}

#[derive(Serialize, Deserialize, Debug)]
pub struct YahooChartBody {
    pub result: Option<Vec<YahooChartResult>>,
}

#[derive(Serialize, Deserialize, Debug)]
pub struct YahooChartResponse {
    pub chart: YahooChartBody,
}

#[derive(Serialize, Deserialize, Debug)]
pub struct YahooSearchQuote {
    pub symbol: String,
    pub shortname: Option<String>,
    pub longname: Option<String>,
    pub exchange: Option<String>,
    #[serde(rename = "typeDisp")]
    pub type_disp: Option<String>,
    pub currency: Option<String>,
}

#[derive(Serialize, Deserialize, Debug)]
pub struct YahooSearchResponse {
    pub quotes: Vec<YahooSearchQuote>,
}

#[derive(Serialize, Deserialize, Debug, Clone)]
pub struct Account {
    pub id: i32,
    pub name: String,
    pub balance: f64,
    pub currency: Option<String>,
    #[serde(default = "default_exchange_rate")]
    pub exchange_rate: f64,
}

pub fn default_exchange_rate() -> f64 {
    1.0
}

#[derive(Clone, Serialize, Deserialize, Debug)]
pub struct Transaction {
    pub id: i32,
    pub account_id: i32,
    pub date: String,
    pub payee: String,
    pub notes: Option<String>,
    pub category: Option<String>,
    pub amount: f64,
    pub ticker: Option<String>,
    pub shares: Option<f64>,
    pub price_per_share: Option<f64>,
    pub fee: Option<f64>,
    pub currency: Option<String>,
}

/// A single condition within a rule
#[derive(Clone, Serialize, Deserialize, Debug)]
pub struct RuleCondition {
    pub field: String,
    pub operator: String, // equals, contains, starts_with, ends_with, greater_than, less_than
    pub value: String,
    #[serde(default)]
    pub negated: bool, // NOT operator
}

/// A single action within a rule
#[derive(Clone, Serialize, Deserialize, Debug)]
pub struct RuleAction {
    pub field: String,
    pub value: String,
}

#[derive(Clone, Serialize, Deserialize, Debug)]
pub struct Rule {
    pub id: i32,
    pub priority: i32,
    // Legacy fields (kept for backward compatibility during migration)
    pub match_field: String,
    pub match_pattern: String,
    pub action_field: String,
    pub action_value: String,
    // New fields for compound conditions and multiple actions
    #[serde(default)]
    pub logic: String, // "and" or "or" - how conditions are combined
    #[serde(default)]
    pub conditions: Vec<RuleCondition>,
    #[serde(default)]
    pub actions: Vec<RuleAction>,
}

#[derive(Debug)]
pub struct AccountsSummary {
    pub accounts: Vec<Account>,
    pub raw_data: Vec<(i32, String, f64)>,
}

#[derive(Serialize, Deserialize, Debug, Default)]
pub struct AppSettings {
    pub db_path: Option<String>,
}

#[derive(Serialize, Deserialize, Debug)]
pub struct DailyPrice {
    pub date: String,
    pub price: f64,
}
