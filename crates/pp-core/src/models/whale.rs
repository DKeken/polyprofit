use chrono::{DateTime, Utc};
use rust_decimal::Decimal;
use serde::{Deserialize, Serialize};
use ts_rs::TS;

/// Profile of a tracked whale wallet on any supported platform.
#[derive(Debug, Clone, Serialize, Deserialize, TS)]
#[ts(export)]
pub struct WhaleProfile {
    pub address: String,
    pub display_name: Option<String>,
    /// Cumulative realized profit in USD
    #[ts(as = "String")]
    pub profit: Decimal,
    /// Return on investment, e.g. 0.85 = 85%
    pub roi: f64,
    /// Win rate, e.g. 0.72 = 72%
    pub win_rate: f64,
    /// Total USDC volume traded
    #[ts(as = "String")]
    pub volume: Decimal,
    pub markets_traded: u64,
    pub last_seen: DateTime<Utc>,
    /// Whether we mirror this whale's signals in our strategy
    pub followed: bool,
    /// Soft-delete: archived whales are hidden from active list but retained in DB
    #[serde(default)]
    pub archived: bool,
}

/// A single large trade observed from a whale wallet.
#[derive(Debug, Clone, Serialize, Deserialize, TS)]
#[ts(export)]
pub struct WhaleActivity {
    pub address: String,
    pub condition_id: String,
    pub side: String,
    #[ts(as = "String")]
    pub amount: Decimal,
    #[ts(as = "String")]
    pub price: Decimal,
    pub timestamp: DateTime<Utc>,
    pub question: Option<String>,
    pub platform: String,
}
