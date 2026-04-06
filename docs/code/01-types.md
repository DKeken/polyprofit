# Types — pp-core/src/types.rs

> Все shared типы. Zero dependencies кроме serde/chrono/decimal.
> Newtype pattern для type safety.

```rust
use chrono::{DateTime, Utc};
use rust_decimal::Decimal;
use serde::{Deserialize, Serialize};
use std::collections::{HashMap, HashSet};
use std::time::Instant;

// ── Newtypes (type safety: нельзя перепутать token_id и condition_id) ──

#[derive(Debug, Clone, Hash, Eq, PartialEq, Serialize, Deserialize)]
pub struct TokenId(pub String);

#[derive(Debug, Clone, Hash, Eq, PartialEq, Serialize, Deserialize)]
pub struct ConditionId(pub String);

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Price(pub Decimal);

// ── Core State ──

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AppState {
    pub prices: PriceState,
    pub orderbooks: HashMap<TokenId, Orderbook>,
    pub positions: HashMap<ConditionId, Position>,
    pub maker_orders: HashMap<String, MakerOrder>,
    pub resolved: HashSet<ConditionId>,
    pub balance: Decimal,
    pub daily_pnl: Decimal,
    pub total_pnl: Decimal,
    pub wins: u32,
    pub trades: u32,
    pub cycle: u64,
    pub log: Vec<TradeLog>,
    pub started_at: DateTime<Utc>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PriceState {
    pub binance: HashMap<String, PricePoint>,
    pub chainlink: HashMap<String, PricePoint>,
}

#[derive(Debug, Clone, Copy, Serialize, Deserialize)]
pub struct PricePoint {
    pub value: f64,
    pub ts: i64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Orderbook {
    pub bid: f64,
    pub ask: f64,
    pub bid_depth: f64,
    pub ask_depth: f64,
    #[serde(skip)]
    pub updated: Instant,
}

// ── Market ──

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Market {
    pub condition_id: ConditionId,
    pub question: String,
    pub token_yes: TokenId,
    pub token_no: TokenId,
    pub asset: Asset,
    pub kind: MarketKind,
    pub strike: Option<f64>,
    pub end_date: Option<DateTime<Utc>>,
    pub tick_size: Decimal,
    pub neg_risk: bool,
}

#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq)]
pub enum Asset { Btc, Eth, Sol, Xrp }

#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq)]
pub enum MarketKind {
    UpDown,
    FiveMin,  // 5-мин BTC: tie = UP wins
    Above,
    Below,
    Dip,
    Reach,
    Range,
}

// ── Trading ──

#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq)]
pub enum Side { Yes, No }

#[derive(Debug, Clone, Copy, Serialize, Deserialize)]
pub enum OrderStrategy { Passive, Balanced, Aggressive }

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Signal {
    pub market: Market,
    pub side: Side,
    pub edge: f64,
    pub fair_prob: f64,
    pub entry_price: f64,
    pub binance: f64,
    pub chainlink: f64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Position {
    pub market: Market,
    pub side: Side,
    pub entry: f64,
    pub size: Decimal,
    pub edge: f64,
    pub opened: DateTime<Utc>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct MakerOrder {
    pub token_id: TokenId,
    pub asset: Asset,
    pub price: f64,
    pub size: Decimal,
    pub side: Side,
    pub placed: Instant,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TradeLog {
    pub ts: DateTime<Utc>,
    pub market: String,
    pub side: Side,
    pub price: f64,
    pub edge: f64,
    pub pnl: Option<f64>,
}
```

### pp-core/src/error.rs

```rust
use thiserror::Error;

#[derive(Error, Debug)]
pub enum AppError {
    #[error("SDK: {0}")]
    Sdk(#[from] polymarket_client_sdk::Error),

    #[error("HTTP: {0}")]
    Http(#[from] reqwest::Error),

    #[error("WS disconnected: {0}")]
    WebSocket(String),

    #[error("Heartbeat dead after {failures} attempts")]
    HeartbeatDead { failures: u32 },

    #[error("Order rejected: {reason}")]
    OrderRejected { reason: String },

    #[error("Config: {0}")]
    Config(String),
}
```

### pp-core/src/config.rs

```rust
use rust_decimal::Decimal;
use serde::Deserialize;

#[derive(Debug, Deserialize)]
pub struct Config {
    pub private_key: String,  // из env var, НЕ из файла
    pub chain_id: u64,        // 137 (Polygon)

    pub strategy: StrategyConfig,
    pub risk: RiskConfig,
    pub server: ServerConfig,
}

#[derive(Debug, Deserialize)]
pub struct StrategyConfig {
    pub min_edge: f64,           // 0.05 (5%)
    pub min_prob: f64,           // 0.15
    pub max_prob: f64,           // 0.85
    pub max_spread: f64,         // 0.06
    pub order_strategy: OrderStrategy,
    pub market_refresh_secs: u64, // 60
    pub assets: Vec<Asset>,       // [Btc, Eth, Sol, Xrp]
}

#[derive(Debug, Deserialize)]
pub struct RiskConfig {
    pub daily_loss_limit: Decimal,   // -100
    pub daily_profit_cap: Decimal,   // 100_000
    pub max_position_pct: f64,       // 0.05
    pub max_concurrent: usize,       // 50
    pub drawdown_limit: f64,         // 0.20
    pub adverse_fill_pause: u32,     // 3
}

#[derive(Debug, Deserialize)]
pub struct ServerConfig {
    pub port: u16,                   // 3000
    pub frontend_dist: String,       // "frontend/dist"
}
```
