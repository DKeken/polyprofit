use std::sync::atomic::{AtomicBool, AtomicI64, AtomicU64};
use std::sync::Arc;

use chrono::{DateTime, Utc};
use dashmap::DashMap;
use rust_decimal::Decimal;
use rust_decimal::prelude::ToPrimitive;
use serde::{Deserialize, Serialize};

// ── Newtypes for type safety ──

#[derive(Debug, Clone, Hash, Eq, PartialEq, Serialize, Deserialize)]
pub struct TokenId(pub String);

#[derive(Debug, Clone, Hash, Eq, PartialEq, Serialize, Deserialize)]
pub struct ConditionId(pub String);

#[derive(Debug, Clone, Copy, Serialize, Deserialize)]
pub struct Price(pub Decimal);

impl Price {
    pub fn new(val: Decimal) -> Self {
        Self(val)
    }

    pub fn as_decimal(&self) -> Decimal {
        self.0
    }
}

// ── Asset & Market types ──

#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, Serialize, Deserialize)]
pub enum Asset {
    Btc,
    Eth,
    Sol,
    Xrp,
}

impl Asset {
    pub fn binance_symbol(&self) -> &'static str {
        match self {
            Asset::Btc => "BTCUSDT",
            Asset::Eth => "ETHUSDT",
            Asset::Sol => "SOLUSDT",
            Asset::Xrp => "XRPUSDT",
        }
    }
}

impl std::fmt::Display for Asset {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            Asset::Btc => write!(f, "BTC"),
            Asset::Eth => write!(f, "ETH"),
            Asset::Sol => write!(f, "SOL"),
            Asset::Xrp => write!(f, "XRP"),
        }
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
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

// ── Price state ──

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

// ── Orderbook ──

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

// ── Signal ──

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
pub enum Side {
    Yes,
    No,
}

impl std::fmt::Display for Side {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            Side::Yes => write!(f, "YES"),
            Side::No => write!(f, "NO"),
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

// ── Order strategy ──

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
pub enum OrderStrategy {
    Passive,
    Balanced,
    Aggressive,
}

// ── Position ──

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Position {
    pub condition_id: ConditionId,
    pub token_id: TokenId,
    pub side: Side,
    pub size: Decimal,
    pub entry_price: Decimal,
    pub opened_at: DateTime<Utc>,
}

// ── Maker order tracking ──

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

// ── Trade log ──

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

// ── Bot mode ──

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
pub enum Mode {
    Demo,
    Live,
}

// ── Metrics ──

#[derive(Debug, Default)]
pub struct Metrics {
    pub signals_generated: AtomicU64,
    pub orders_placed: AtomicU64,
    pub orders_filled: AtomicU64,
    pub orders_cancelled: AtomicU64,
    pub adverse_fills: AtomicU64,
    pub ws_reconnects: AtomicU64,
    pub slow_cancel_replace: AtomicU64,
    pub heartbeat_failures: AtomicU64,
}

// ── Shared App State ──

#[derive(Debug)]
pub struct AppState {
    pub mode: Mode,
    pub prices: DashMap<Asset, PriceState>,
    pub orderbooks: DashMap<ConditionId, Orderbook>,
    pub markets: DashMap<ConditionId, Market>,
    pub positions: DashMap<ConditionId, Position>,
    pub maker_orders: DashMap<String, MakerOrder>,
    pub trades: parking_lot::RwLock<Vec<TradeLog>>,
    pub daily_pnl: AtomicI64,
    pub peak_balance: AtomicI64,
    pub starting_balance: AtomicI64,
    pub paused: AtomicBool,
    pub heartbeat_alive: AtomicBool,
    pub metrics: Metrics,
}

impl AppState {
    pub fn new(mode: Mode) -> Arc<Self> {
        Arc::new(Self {
            mode,
            prices: DashMap::new(),
            orderbooks: DashMap::new(),
            markets: DashMap::new(),
            positions: DashMap::new(),
            maker_orders: DashMap::new(),
            trades: parking_lot::RwLock::new(Vec::new()),
            daily_pnl: AtomicI64::new(0),
            peak_balance: AtomicI64::new(0),
            starting_balance: AtomicI64::new(0),
            paused: AtomicBool::new(false),
            heartbeat_alive: AtomicBool::new(false),
            metrics: Metrics::default(),
        })
    }

    /// Initialize starting balance from config. Must be called after config load.
    pub fn set_starting_balance(&self, balance: Decimal) {
        // Store as cents (2 decimal places) to match daily_pnl scale
        let cents = (balance * Decimal::new(100, 0)).to_i64().unwrap_or(0);
        self.starting_balance.store(cents, std::sync::atomic::Ordering::Relaxed);
        self.peak_balance.store(cents, std::sync::atomic::Ordering::Relaxed);
    }

    /// Current balance = starting_balance + daily_pnl (both in cents)
    pub fn current_balance_cents(&self) -> i64 {
        let start = self.starting_balance.load(std::sync::atomic::Ordering::Relaxed);
        let pnl = self.daily_pnl.load(std::sync::atomic::Ordering::Relaxed);
        start + pnl
    }

    /// Record a PnL change. Updates daily_pnl and peak_balance atomically.
    pub fn record_pnl(&self, pnl_decimal: Decimal) {
        let pnl_cents = (pnl_decimal * Decimal::new(100, 0)).to_i64().unwrap_or(0);
        let new_pnl = self.daily_pnl.fetch_add(pnl_cents, std::sync::atomic::Ordering::Relaxed) + pnl_cents;
        let current_balance = self.starting_balance.load(std::sync::atomic::Ordering::Relaxed) + new_pnl;

        // Update peak if new high
        self.peak_balance.fetch_max(current_balance, std::sync::atomic::Ordering::Relaxed);
    }

    pub fn daily_pnl_dec(&self) -> Decimal {
        let raw = self.daily_pnl.load(std::sync::atomic::Ordering::Relaxed);
        Decimal::new(raw, 2)
    }

    pub fn is_paused(&self) -> bool {
        self.paused.load(std::sync::atomic::Ordering::Relaxed)
    }

    pub fn is_heartbeat_alive(&self) -> bool {
        self.heartbeat_alive.load(std::sync::atomic::Ordering::Relaxed)
    }
}

impl Default for AppState {
    fn default() -> Self {
        Self {
            mode: Mode::Demo,
            prices: DashMap::new(),
            orderbooks: DashMap::new(),
            markets: DashMap::new(),
            positions: DashMap::new(),
            maker_orders: DashMap::new(),
            trades: parking_lot::RwLock::new(Vec::new()),
            daily_pnl: AtomicI64::new(0),
            peak_balance: AtomicI64::new(0),
            starting_balance: AtomicI64::new(0),
            paused: AtomicBool::new(false),
            heartbeat_alive: AtomicBool::new(false),
            metrics: Metrics::default(),
        }
    }
}
