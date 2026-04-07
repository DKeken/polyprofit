use rust_decimal::Decimal;
use serde::Deserialize;

use crate::models::trade::OrderStrategy;

#[derive(Debug, Clone, Deserialize)]
pub struct AssetDef {
    pub symbol: String,
    pub binance_symbol: String,
    pub keywords: Vec<String>,
}

#[derive(Debug, Deserialize)]
pub struct StrategyConfig {
    pub min_edge: Decimal,
    pub min_prob: Decimal,
    pub max_prob: Decimal,
    pub max_spread: Decimal,
    pub order_strategy: OrderStrategy,
    pub market_refresh_secs: u64,
    pub assets: Vec<String>,
}

#[derive(Debug, Deserialize)]
pub struct RiskConfig {
    pub daily_loss_limit: Decimal,
    pub daily_profit_cap: Decimal,
    pub max_position_pct: Decimal,
    pub max_concurrent: usize,
    pub drawdown_limit: Decimal,
    pub adverse_fill_pause: u32,
    pub starting_balance: Decimal,
}

#[derive(Debug, Deserialize)]
pub struct WhalesConfig {
    pub min_trade_usd: Decimal,
    pub min_win_rate: f64,
    pub min_roi: f64,
    pub min_profit_usd: Decimal,
    pub poll_interval_secs: u64,
}

#[derive(Debug, Deserialize)]
pub struct ServerConfig {
    pub port: u16,
    pub frontend_dist: String,
}


#[derive(Debug, Deserialize)]
pub struct Config {
    pub chain_id: u64,
    pub strategy: StrategyConfig,
    pub risk: RiskConfig,
    pub server: ServerConfig,
    pub whales: WhalesConfig,
    #[serde(default)]
    pub asset_definitions: Vec<AssetDef>,
}
