use std::sync::atomic::{AtomicBool, AtomicI64, AtomicU64};
use std::sync::Arc;

use chrono::{DateTime, Utc};
use dashmap::DashMap;
use rust_decimal::Decimal;
use rust_decimal::prelude::ToPrimitive;
use serde::{Deserialize, Serialize};
use tokio_util::sync::CancellationToken;
use ts_rs::TS;

// ── Newtypes for type safety ──

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

// ── Asset & AssetMeta — fully data-driven ──

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

/// Metadata for a configured asset — managed via frontend Settings UI.
/// Stored in RuntimeConfig → persisted in redb.
/// Config.toml [[asset_definitions]] serves as initial seed only.
#[derive(Debug, Clone, Serialize, Deserialize, TS)]
#[ts(export)]
pub struct AssetMeta {
    /// Display symbol (e.g. "BTC")
    pub symbol: String,
    /// Binance trading pair (e.g. "BTCUSDT") — used for RTDS subscription
    pub binance_symbol: String,
    /// Lowercase keywords for market question matching (e.g. ["btc", "bitcoin"])
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

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, TS)]
#[ts(export)]
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

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, TS)]
#[ts(export)]
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

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, TS)]
#[ts(export)]
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

// ── Runtime Config (hot-reloadable via API) ──

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
    /// Full asset definitions (symbol, binance pair, keywords).
    /// Managed via frontend Settings UI. Config.toml seeds initial values.
    /// Changes here rebuild the asset_registry and take effect immediately.
    pub asset_definitions: Vec<AssetMeta>,
}

impl Default for RuntimeConfig {
    fn default() -> Self {
        use rust_decimal_macros::dec;
        Self {
            min_edge: dec!(0.05),
            min_prob: dec!(0.15),
            max_prob: dec!(0.85),
            max_spread: dec!(0.06),
            order_strategy: OrderStrategy::Passive,
            market_refresh_secs: 60,
            assets: vec![],
            daily_loss_limit: dec!(-100),
            daily_profit_cap: dec!(100000),
            max_position_pct: dec!(0.05),
            max_concurrent: 50,
            drawdown_limit: dec!(0.20),
            adverse_fill_pause: 3,
            asset_definitions: vec![],
        }
    }
}

use crate::db::BotDb;

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
    pub runtime_config: parking_lot::RwLock<RuntimeConfig>,
    pub started_at: std::time::Instant,
    pub db: Option<BotDb>,
    /// Data-driven asset registry: maps Asset → AssetMeta (symbol, binance pair, keywords).
    /// Populated from config.toml [[asset_definitions]].
    pub asset_registry: DashMap<Asset, AssetMeta>,
    /// Cancellation token for graceful shutdown.
    /// All async loops check this token and exit cleanly when cancelled.
    pub shutdown: CancellationToken,
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
            runtime_config: parking_lot::RwLock::new(RuntimeConfig::default()),
            started_at: std::time::Instant::now(),
            db: None,
            asset_registry: DashMap::new(),
            shutdown: CancellationToken::new(),
        })
    }

    /// Create with an embedded database for persistence.
    pub fn new_with_db(mode: Mode, db: BotDb) -> Arc<Self> {
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
            runtime_config: parking_lot::RwLock::new(RuntimeConfig::default()),
            started_at: std::time::Instant::now(),
            db: Some(db),
            asset_registry: DashMap::new(),
            shutdown: CancellationToken::new(),
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

    /// Record a trade: appends to in-memory Vec and persists to DB.
    /// Centralizes the dual-write pattern previously duplicated across
    /// execute_demo, place_market_order, and redeem_loop.
    pub fn record_trade(&self, trade: &TradeLog) {
        self.trades.write().push(trade.clone());
        if let Some(ref db) = self.db {
            if let Err(e) = db.insert_trade(trade) {
                tracing::warn!(error = %e, "Failed to persist trade to DB");
            }
        }
    }

    /// Populate asset registry from config definitions.
    /// Called once at startup after AppState is created.
    pub fn load_asset_registry(&self, defs: &[crate::config::AssetDef]) {
        self.asset_registry.clear();
        for def in defs {
            let asset = Asset::new(&def.symbol);
            let meta = AssetMeta {
                symbol: def.symbol.to_uppercase(),
                binance_symbol: def.binance_symbol.clone(),
                keywords: def.keywords.iter().map(|k| k.to_lowercase()).collect(),
            };
            self.asset_registry.insert(asset, meta);
        }
    }

    /// Rebuild asset registry from RuntimeConfig's asset_definitions.
    /// Called after every config update via API so changes take effect immediately.
    pub fn rebuild_asset_registry(&self) {
        let defs = self.runtime_config.read().asset_definitions.clone();
        self.asset_registry.clear();
        for meta in &defs {
            let asset = Asset::new(&meta.symbol);
            let normalized = AssetMeta {
                symbol: meta.symbol.to_uppercase(),
                binance_symbol: meta.binance_symbol.clone(),
                keywords: meta.keywords.iter().map(|k| k.to_lowercase()).collect(),
            };
            self.asset_registry.insert(asset, normalized);
        }
    }

    /// Resolve a Binance symbol (e.g. "BTCUSDT") or short symbol (e.g. "BTC") to an Asset.
    /// Used by RTDS feed to decode inbound price messages.
    pub fn asset_from_binance_symbol(&self, symbol: &str) -> Option<Asset> {
        self.asset_registry.iter().find_map(|entry| {
            if entry.value().binance_symbol == symbol || entry.value().symbol == symbol {
                Some(entry.key().clone())
            } else {
                None
            }
        })
    }

    /// Match market question text against asset keywords.
    /// Returns the first matching Asset from `active_assets` whose keywords appear in `question`.
    pub fn match_asset_by_keywords(&self, question: &str, active_assets: &[Asset]) -> Option<Asset> {
        let q = question.to_lowercase();
        active_assets.iter().find_map(|asset| {
            self.asset_registry.get(asset).and_then(|meta| {
                if meta.keywords.iter().any(|kw| q.contains(kw.as_str())) {
                    Some(asset.clone())
                } else {
                    None
                }
            })
        })
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
            runtime_config: parking_lot::RwLock::new(RuntimeConfig::default()),
            started_at: std::time::Instant::now(),
            db: None,
            asset_registry: DashMap::new(),
            shutdown: CancellationToken::new(),
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use rust_decimal_macros::dec;
    use std::sync::atomic::Ordering;

    #[test]
    fn set_starting_balance_stores_cents() {
        let state = AppState::new(Mode::Demo);
        state.set_starting_balance(dec!(1000.00));
        assert_eq!(state.starting_balance.load(Ordering::Relaxed), 100_000);
    }

    #[test]
    fn set_starting_balance_sets_peak() {
        let state = AppState::new(Mode::Demo);
        state.set_starting_balance(dec!(500.00));
        assert_eq!(state.peak_balance.load(Ordering::Relaxed), 50_000);
    }

    #[test]
    fn current_balance_cents_combines_start_and_pnl() {
        let state = AppState::new(Mode::Demo);
        state.set_starting_balance(dec!(1000.00));
        state.daily_pnl.store(500, Ordering::Relaxed); // +$5.00
        assert_eq!(state.current_balance_cents(), 100_500);
    }

    #[test]
    fn current_balance_cents_with_negative_pnl() {
        let state = AppState::new(Mode::Demo);
        state.set_starting_balance(dec!(1000.00));
        state.daily_pnl.store(-2000, Ordering::Relaxed); // -$20.00
        assert_eq!(state.current_balance_cents(), 98_000);
    }

    #[test]
    fn record_pnl_positive_updates_daily_pnl() {
        let state = AppState::new(Mode::Demo);
        state.set_starting_balance(dec!(1000.00));
        state.record_pnl(dec!(10.00));
        assert_eq!(state.daily_pnl.load(Ordering::Relaxed), 1000); // $10 = 1000 cents
    }

    #[test]
    fn record_pnl_cumulative() {
        let state = AppState::new(Mode::Demo);
        state.set_starting_balance(dec!(1000.00));
        state.record_pnl(dec!(10.00));
        state.record_pnl(dec!(5.50));
        assert_eq!(state.daily_pnl.load(Ordering::Relaxed), 1550); // $15.50
    }

    #[test]
    fn record_pnl_updates_peak_balance() {
        let state = AppState::new(Mode::Demo);
        state.set_starting_balance(dec!(1000.00));
        // Starting peak is 100_000
        state.record_pnl(dec!(50.00));
        // New balance = 100_000 + 5_000 = 105_000 → new peak
        assert_eq!(state.peak_balance.load(Ordering::Relaxed), 105_000);
    }

    #[test]
    fn record_pnl_negative_does_not_lower_peak() {
        let state = AppState::new(Mode::Demo);
        state.set_starting_balance(dec!(1000.00));
        state.record_pnl(dec!(50.00));  // peak = 105_000
        state.record_pnl(dec!(-20.00)); // balance = 103_000, peak stays 105_000
        assert_eq!(state.peak_balance.load(Ordering::Relaxed), 105_000);
        assert_eq!(state.current_balance_cents(), 103_000);
    }

    #[test]
    fn daily_pnl_dec_conversion() {
        let state = AppState::new(Mode::Demo);
        state.daily_pnl.store(1234, Ordering::Relaxed);
        assert_eq!(state.daily_pnl_dec(), dec!(12.34));
    }

    #[test]
    fn daily_pnl_dec_negative() {
        let state = AppState::new(Mode::Demo);
        state.daily_pnl.store(-500, Ordering::Relaxed);
        assert_eq!(state.daily_pnl_dec(), dec!(-5.00));
    }

    #[test]
    fn is_paused_default_false() {
        let state = AppState::new(Mode::Demo);
        assert!(!state.is_paused());
    }

    #[test]
    fn is_heartbeat_alive_default_false() {
        let state = AppState::new(Mode::Demo);
        assert!(!state.is_heartbeat_alive());
    }
}
