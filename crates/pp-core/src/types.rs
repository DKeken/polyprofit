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
    pub whale_events: AtomicU64,
    /// Incremented only for high-value trades by **followed** whales — drives toast alerts
    pub whale_alert_count: AtomicU64,
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
    /// Unix epoch seconds of the last whale scan completion (0 = never)
    pub whale_last_scan: AtomicI64,
    /// Unix epoch seconds when the next whale auto-scan is scheduled
    pub whale_next_scan: AtomicI64,
    /// Dedup set: key = "address:condition_id:timestamp_unix" — prevents duplicate alerts
    pub whale_seen_activity: DashMap<String, ()>,
}

impl AppState {
    fn build(db: Option<BotDb>) -> Self {
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
            db,
            asset_registry: DashMap::new(),
            shutdown: CancellationToken::new(),
            cancel_queue: DashMap::new(),
            whales: DashMap::new(),
            recent_whale_activity: parking_lot::RwLock::new(Vec::new()),
            whale_job_queue: tokio::sync::OnceCell::new(),
            whale_last_scan: AtomicI64::new(0),
            whale_next_scan: AtomicI64::new(0),
            whale_seen_activity: DashMap::new(),
        }
    }

    /// In-memory state without persistence — used by tests and pre-DB bootstrap.
    pub fn new() -> Arc<Self> {
        Arc::new(Self::build(None))
    }

    /// State backed by an embedded database for crash-safe persistence.
    pub fn new_with_db(db: BotDb) -> Arc<Self> {
        Arc::new(Self::build(Some(db)))
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
        if let Some(ref db) = self.db
            && let Err(e) = db.insert_trade(trade) {
                tracing::warn!(error = %e, "Failed to persist trade to DB");
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
        Self::build(None)
    }
}

#[cfg(test)]
#[path = "types_tests.rs"]
mod types_tests;
