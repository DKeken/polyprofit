use chrono::{DateTime, Utc};
use rust_decimal::Decimal;
use serde::{Deserialize, Serialize};

use crate::models::market::{Asset, ConditionId, Price, TokenId};

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
pub enum Side {
    Yes,
    No,
}

impl std::fmt::Display for Side {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            Side::Yes => write!(f, "Yes"),
            Side::No => write!(f, "No"),
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Signal {
    pub condition_id: ConditionId,
    pub side: Side,
    pub fair: Decimal,
    pub market_price: Decimal,
    pub edge: Decimal,
    pub size_usdc: Decimal,
    pub timestamp: DateTime<Utc>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Position {
    pub condition_id: ConditionId,
    pub token_id: TokenId,
    pub side: Side,
    pub size: Decimal,
    pub entry_price: Decimal,
    pub opened_at: DateTime<Utc>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct MakerOrder {
    pub order_id: String,
    pub condition_id: ConditionId,
    pub token_id: TokenId,
    pub side: Side,
    pub price: Decimal,
    pub size: Decimal,
    pub placed_at: DateTime<Utc>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TradeLog {
    pub condition_id: ConditionId,
    pub side: Side,
    pub price: Decimal,
    pub size: Decimal,
    pub pnl: Option<Decimal>,
    pub is_adverse: bool,
    pub timestamp: DateTime<Utc>,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, Default, ts_rs::TS)]
#[ts_rs::export]
pub enum OrderStrategy {
    Passive,
    #[default]
    Balanced,
    Aggressive,
}
