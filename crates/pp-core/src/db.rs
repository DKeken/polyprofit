//! Embedded persistence via **redb** — a zero-config, single-file, ACID B+-tree DB.
//!
//! We store:
//!   - `trades`  — full trade log, keyed by auto-increment u64
//!   - `state`   — daily_pnl, peak_balance as recovery checkpoints
//!   - `config`  — last runtime config snapshot (survives restart)
//!
//! The DB file lives next to config.toml: `polyprofit.db`.
//! All writes are transactional (crash-safe).

use std::path::Path;
use std::sync::Arc;

use anyhow::{Context, Result};
use redb::{Database, ReadableTable, ReadableTableMetadata, TableDefinition};
use tracing::{debug, info, warn};

use crate::types::{RuntimeConfig, TradeLog};

// ── Table definitions ──

/// Trades: u64 auto-increment key → JSON-encoded TradeLog
const TRADES: TableDefinition<u64, &str> = TableDefinition::new("trades");

/// State: string key → string value
///   Keys: "daily_pnl", "peak_balance", "starting_balance"
const STATE: TableDefinition<&str, &str> = TableDefinition::new("state");

/// Config: single key "runtime" → JSON-encoded RuntimeConfig
const CONFIG: TableDefinition<&str, &str> = TableDefinition::new("config");

/// Wrapper around redb::Database for bot persistence.
pub struct BotDb {
    db: Database,
}

impl std::fmt::Debug for BotDb {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        f.debug_struct("BotDb").field("open", &true).finish()
    }
}

impl BotDb {
    /// Open (or create) the database file.
    pub fn open(path: impl AsRef<Path>) -> Result<Self> {
        let db = Database::create(path.as_ref())
            .with_context(|| format!("Failed to open DB at {:?}", path.as_ref()))?;

        // Ensure tables exist (no-op if already created)
        let txn = db.begin_write()?;
        {
            let _ = txn.open_table(TRADES)?;
            let _ = txn.open_table(STATE)?;
            let _ = txn.open_table(CONFIG)?;
        }
        txn.commit()?;

        info!(path = %path.as_ref().display(), "Database opened");
        Ok(Self { db })
    }

    // ── Trades ──

    /// Append a trade to the log. Returns the assigned trade ID.
    pub fn insert_trade(&self, trade: &TradeLog) -> Result<u64> {
        let json = serde_json::to_string(trade)?;
        let txn = self.db.begin_write()?;
        let id = {
            let mut table = txn.open_table(TRADES)?;
            // Next ID = current max key + 1
            let next_id = table
                .last()?
                .map(|(k, _)| k.value() + 1)
                .unwrap_or(0);
            table.insert(next_id, json.as_str())?;
            next_id
        };
        txn.commit()?;
        debug!(id, "Trade persisted");
        Ok(id)
    }

    /// Load all trades from DB (for recovery).
    pub fn load_trades(&self) -> Result<Vec<TradeLog>> {
        let txn = self.db.begin_read()?;
        let table = txn.open_table(TRADES)?;
        let mut trades = Vec::new();
        for entry in table.iter()? {
            let (_, val) = entry?;
            match serde_json::from_str::<TradeLog>(val.value()) {
                Ok(t) => trades.push(t),
                Err(e) => warn!("Skipping corrupt trade record: {e}"),
            }
        }
        debug!(count = trades.len(), "Trades loaded from DB");
        Ok(trades)
    }

    /// Count of trades in DB.
    pub fn trade_count(&self) -> Result<u64> {
        let txn = self.db.begin_read()?;
        let table = txn.open_table(TRADES)?;
        Ok(table.len()?)
    }

    // ── State ──

    /// Save a state key-value pair.
    pub fn save_state(&self, key: &str, value: &str) -> Result<()> {
        let txn = self.db.begin_write()?;
        {
            let mut table = txn.open_table(STATE)?;
            table.insert(key, value)?;
        }
        txn.commit()?;
        Ok(())
    }

    /// Load a state value by key.
    pub fn load_state(&self, key: &str) -> Result<Option<String>> {
        let txn = self.db.begin_read()?;
        let table = txn.open_table(STATE)?;
        Ok(table.get(key)?.map(|v| v.value().to_string()))
    }

    /// Save daily PnL and peak balance atomically.
    pub fn checkpoint_balance(&self, daily_pnl_cents: i64, peak_balance_cents: i64) -> Result<()> {
        let txn = self.db.begin_write()?;
        {
            let mut table = txn.open_table(STATE)?;
            table.insert("daily_pnl", daily_pnl_cents.to_string().as_str())?;
            table.insert("peak_balance", peak_balance_cents.to_string().as_str())?;
        }
        txn.commit()?;
        Ok(())
    }

    /// Load balance checkpoint. Returns (daily_pnl_cents, peak_balance_cents) or None.
    pub fn load_balance_checkpoint(&self) -> Result<Option<(i64, i64)>> {
        let txn = self.db.begin_read()?;
        let table = txn.open_table(STATE)?;

        let pnl = table.get("daily_pnl")?.and_then(|v| v.value().parse::<i64>().ok());
        let peak = table.get("peak_balance")?.and_then(|v| v.value().parse::<i64>().ok());

        match (pnl, peak) {
            (Some(p), Some(pk)) => Ok(Some((p, pk))),
            _ => Ok(None),
        }
    }

    // ── Config ──

    /// Save runtime config snapshot.
    pub fn save_config(&self, config: &RuntimeConfig) -> Result<()> {
        let json = serde_json::to_string(config)?;
        let txn = self.db.begin_write()?;
        {
            let mut table = txn.open_table(CONFIG)?;
            table.insert("runtime", json.as_str())?;
        }
        txn.commit()?;
        debug!("Runtime config persisted");
        Ok(())
    }

    /// Load saved runtime config (if any).
    pub fn load_config(&self) -> Result<Option<RuntimeConfig>> {
        let txn = self.db.begin_read()?;
        let table = txn.open_table(CONFIG)?;
        match table.get("runtime")? {
            Some(val) => {
                let cfg: RuntimeConfig = serde_json::from_str(val.value())
                    .context("Failed to deserialize saved RuntimeConfig")?;
                Ok(Some(cfg))
            }
            None => Ok(None),
        }
    }
}

/// Periodic checkpoint task — saves state every N seconds.
pub async fn checkpoint_loop(state: Arc<crate::AppState>, interval_secs: u64) -> Result<()> {
    use std::sync::atomic::Ordering;

    loop {
        tokio::time::sleep(std::time::Duration::from_secs(interval_secs)).await;

        if let Some(ref db) = state.db {
            let pnl = state.daily_pnl.load(Ordering::Relaxed);
            let peak = state.peak_balance.load(Ordering::Relaxed);

            if let Err(e) = db.checkpoint_balance(pnl, peak) {
                warn!("Balance checkpoint failed: {e}");
            }
        }
    }
}
