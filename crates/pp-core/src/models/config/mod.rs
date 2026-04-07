pub mod structures;

pub use structures::*;

use rust_decimal::Decimal;
use serde::{Deserialize, Serialize};
use ts_rs::TS;
use rust_decimal_macros::dec;

use crate::models::market::{Asset, AssetMeta};
use crate::models::trade::OrderStrategy;

#[derive(Debug, Clone, Serialize, Deserialize, TS)]
#[ts(export)]
pub struct RuntimeConfig {
    // Strategy
    #[ts(as = "String")]
    pub min_edge: Decimal,
    #[ts(as = "String")]
    pub min_prob: Decimal,
    #[ts(as = "String")]
    pub max_prob: Decimal,
    #[ts(as = "String")]
    pub max_spread: Decimal,
    pub order_strategy: OrderStrategy,
    #[ts(type = "number")]
    pub market_refresh_secs: u64,
    #[ts(type = "string[]")]
    pub assets: Vec<Asset>,
    // Risk
    #[ts(as = "String")]
    pub daily_loss_limit: Decimal,
    #[ts(as = "String")]
    pub daily_profit_cap: Decimal,
    #[ts(as = "String")]
    pub max_position_pct: Decimal,
    pub max_concurrent: usize,
    #[ts(as = "String")]
    pub drawdown_limit: Decimal,
    pub adverse_fill_pause: u32,
    // Whales
    #[ts(as = "String")]
    pub min_whale_trade_usd: Decimal,
    pub min_whale_win_rate: f64,
    pub min_whale_roi: f64,
    #[ts(as = "String")]
    pub min_whale_profit_usd: Decimal,
    pub whale_poll_interval_secs: u64,
    /// Full asset definitions (symbol, binance pair, keywords).
    /// Managed via frontend Settings UI. Config.toml seeds initial values.
    /// Changes here rebuild the asset_registry and take effect immediately.
    pub asset_definitions: Vec<AssetMeta>,
}

impl Default for RuntimeConfig {
    fn default() -> Self {
        Self {
            min_edge: dec!(0.02),
            min_prob: dec!(0.10),
            max_prob: dec!(0.90),
            max_spread: dec!(0.05),
            order_strategy: OrderStrategy::Balanced,
            market_refresh_secs: 60,
            assets: vec![Asset("BTC".to_string())],
            daily_loss_limit: dec!(20.0),
            daily_profit_cap: dec!(50.0),
            max_position_pct: dec!(0.05),
            max_concurrent: 5,
            drawdown_limit: dec!(0.10),
            adverse_fill_pause: 300,
            min_whale_trade_usd: dec!(200),
            min_whale_win_rate: 0.55,
            min_whale_roi: 0.15,
            min_whale_profit_usd: dec!(500),
            whale_poll_interval_secs: 300,
            asset_definitions: Vec::new(),
        }
    }
}
