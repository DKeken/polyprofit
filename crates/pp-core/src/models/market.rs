use chrono::{DateTime, Utc};
use rust_decimal::Decimal;
use serde::{Deserialize, Serialize};
use ts_rs::TS;

#[derive(Debug, Clone, Hash, Eq, PartialEq, Serialize, Deserialize)]
pub struct TokenId(pub String);

#[derive(Debug, Clone, Hash, Eq, PartialEq, Serialize, Deserialize)]
pub struct ConditionId(pub String);

#[derive(Debug, Clone, Copy, Serialize, Deserialize, TS)]
#[ts(export)]
pub struct Price(#[ts(as = "String")] pub Decimal);

impl Price {
    pub fn new(val: Decimal) -> Self {
        Self(val)
    }

    pub fn as_decimal(&self) -> Decimal {
        self.0
    }
}

/// A crypto asset identifier. Stored as uppercase string (e.g. "BTC", "ETH", "DOGE").
/// Not an enum — new assets are added via config, not code changes.
#[derive(Debug, Clone, PartialEq, Eq, Hash, Serialize, Deserialize)]
pub struct Asset(pub String);

impl Asset {
    pub fn new(symbol: &str) -> Self {
        Self(symbol.to_uppercase())
    }
}

impl std::fmt::Display for Asset {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        write!(f, "{}", self.0)
    }
}

impl std::str::FromStr for Asset {
    type Err = String;

    fn from_str(s: &str) -> Result<Self, Self::Err> {
        let upper = s.trim().to_uppercase();
        if upper.is_empty() {
            return Err("Asset name cannot be empty".to_string());
        }
        Ok(Asset(upper))
    }
}

#[derive(Debug, Clone, Serialize, Deserialize, TS)]
#[ts(export)]
pub struct AssetMeta {
    pub symbol: String,
    pub binance_symbol: String,
    pub keywords: Vec<String>,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, TS)]
#[ts(export)]
pub enum MarketKind {
    UpDown,
    FiveMin,
    Above,
    Below,
    Dip,
    Reach,
    Range,
    Unknown,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Market {
    pub condition_id: ConditionId,
    pub token_yes: TokenId,
    pub token_no: TokenId,
    pub asset: Asset,
    pub kind: MarketKind,
    pub question: String,
    pub strike: Option<Decimal>,
    pub end_time: DateTime<Utc>,
    pub active: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PriceState {
    pub binance: Decimal,
    pub chainlink: Decimal,
    pub binance_ts: i64,
    pub chainlink_ts: i64,
}

impl Default for PriceState {
    fn default() -> Self {
        Self {
            binance: Decimal::ZERO,
            chainlink: Decimal::ZERO,
            binance_ts: 0,
            chainlink_ts: 0,
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Orderbook {
    pub best_bid: Decimal,
    pub best_ask: Decimal,
    pub bid_depth: Decimal,
    pub ask_depth: Decimal,
    pub updated_at: DateTime<Utc>,
}

impl Default for Orderbook {
    fn default() -> Self {
        Self {
            best_bid: Decimal::ZERO,
            best_ask: Decimal::ONE,
            bid_depth: Decimal::ZERO,
            ask_depth: Decimal::ZERO,
            updated_at: Utc::now(),
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize, TS)]
#[ts(export)]
pub struct PlatformInfo {
    pub name: String,
    pub url: String,
    pub authenticated: bool,
}
