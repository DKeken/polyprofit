use std::sync::atomic::{AtomicBool, AtomicI64, AtomicU64};
use std::sync::Arc;

use dashmap::DashMap;
use rust_decimal::Decimal;
use rust_decimal::prelude::ToPrimitive;
use tokio_util::sync::CancellationToken;

// Re-export all domain model types so downstream code can use `pp_core::Asset` etc.
pub use crate::models::*;

use crate::db::BotDb;

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
    pub cancel_queue: DashMap<String, ()>,
    pub whales: DashMap<String, WhaleProfile>,
    pub recent_whale_activity: parking_lot::RwLock<Vec<WhaleActivity>>,
    pub whale_job_queue: tokio::sync::OnceCell<std::sync::Arc<crate::jobs::JobQueue<crate::jobs::DynJob>>>,
}

impl AppState {
    pub fn new() -> Arc<Self> {
        Arc::new(Self {
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
            cancel_queue: DashMap::new(),
            whales: DashMap::new(),
            recent_whale_activity: parking_lot::RwLock::new(Vec::new()),
            whale_job_queue: tokio::sync::OnceCell::new(),
        })
    }

    /// Create with an embedded database for persistence.
    pub fn new_with_db(db: BotDb) -> Arc<Self> {
        Arc::new(Self {
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
            cancel_queue: DashMap::new(),
            whales: DashMap::new(),
            recent_whale_activity: parking_lot::RwLock::new(Vec::new()),
            whale_job_queue: tokio::sync::OnceCell::new(),
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
    /// order execution and redeem handling.
    pub fn record_trade(&self, trade: &TradeLog) {
        self.trades.write().push(trade.clone());
        if let Some(ref db) = self.db {
            if let Err(e) = db.insert_trade(trade) {
                tracing::warn!(error = %e, "Failed to persist trade to DB");
            }
        }
    }

    /// Record a whale activity event. Keeps the most recent 500 entries.
    pub fn record_whale_activity(&self, activity: WhaleActivity) {
        const MAX_ENTRIES: usize = 500;
        let mut activities = self.recent_whale_activity.write();
        activities.push(activity);
        let len = activities.len();
        if len > MAX_ENTRIES {
            activities.drain(..len - MAX_ENTRIES);
        }
    }

    /// Populate asset registry from config definitions.
    /// Called once at startup after AppState is created.
    pub fn load_asset_registry(&self, defs: &[AssetDef]) {
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
            cancel_queue: DashMap::new(),
            whales: DashMap::new(),
            recent_whale_activity: parking_lot::RwLock::new(Vec::new()),
            whale_job_queue: tokio::sync::OnceCell::new(),
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
        let state = AppState::new();
        state.set_starting_balance(dec!(1000.00));
        assert_eq!(state.starting_balance.load(Ordering::Relaxed), 100_000);
    }

    #[test]
    fn set_starting_balance_sets_peak() {
        let state = AppState::new();
        state.set_starting_balance(dec!(500.00));
        assert_eq!(state.peak_balance.load(Ordering::Relaxed), 50_000);
    }

    #[test]
    fn current_balance_cents_combines_start_and_pnl() {
        let state = AppState::new();
        state.set_starting_balance(dec!(1000.00));
        state.daily_pnl.store(500, Ordering::Relaxed); // +$5.00
        assert_eq!(state.current_balance_cents(), 100_500);
    }

    #[test]
    fn current_balance_cents_with_negative_pnl() {
        let state = AppState::new();
        state.set_starting_balance(dec!(1000.00));
        state.daily_pnl.store(-2000, Ordering::Relaxed); // -$20.00
        assert_eq!(state.current_balance_cents(), 98_000);
    }

    #[test]
    fn record_pnl_positive_updates_daily_pnl() {
        let state = AppState::new();
        state.set_starting_balance(dec!(1000.00));
        state.record_pnl(dec!(10.00));
        assert_eq!(state.daily_pnl.load(Ordering::Relaxed), 1000); // $10 = 1000 cents
    }

    #[test]
    fn record_pnl_cumulative() {
        let state = AppState::new();
        state.set_starting_balance(dec!(1000.00));
        state.record_pnl(dec!(10.00));
        state.record_pnl(dec!(5.50));
        assert_eq!(state.daily_pnl.load(Ordering::Relaxed), 1550); // $15.50
    }

    #[test]
    fn record_pnl_updates_peak_balance() {
        let state = AppState::new();
        state.set_starting_balance(dec!(1000.00));
        // Starting peak is 100_000
        state.record_pnl(dec!(50.00));
        // New balance = 100_000 + 5_000 = 105_000 → new peak
        assert_eq!(state.peak_balance.load(Ordering::Relaxed), 105_000);
    }

    #[test]
    fn record_pnl_negative_does_not_lower_peak() {
        let state = AppState::new();
        state.set_starting_balance(dec!(1000.00));
        state.record_pnl(dec!(50.00));  // peak = 105_000
        state.record_pnl(dec!(-20.00)); // balance = 103_000, peak stays 105_000
        assert_eq!(state.peak_balance.load(Ordering::Relaxed), 105_000);
        assert_eq!(state.current_balance_cents(), 103_000);
    }

    #[test]
    fn daily_pnl_dec_conversion() {
        let state = AppState::new();
        state.daily_pnl.store(1234, Ordering::Relaxed);
        assert_eq!(state.daily_pnl_dec(), dec!(12.34));
    }

    #[test]
    fn daily_pnl_dec_negative() {
        let state = AppState::new();
        state.daily_pnl.store(-500, Ordering::Relaxed);
        assert_eq!(state.daily_pnl_dec(), dec!(-5.00));
    }

    #[test]
    fn is_paused_default_false() {
        let state = AppState::new();
        assert!(!state.is_paused());
    }

    #[test]
    fn is_heartbeat_alive_default_false() {
        let state = AppState::new();
        assert!(!state.is_heartbeat_alive());
    }
}
