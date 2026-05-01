//! Trade-log persistence.

use anyhow::Result;
use redb::{ReadableTable, ReadableTableMetadata};
use tracing::{debug, warn};

use crate::types::TradeLog;

use super::{BotDb, TRADES_T};

impl BotDb {
    /// Append a trade. Returns the assigned auto-increment id.
    pub fn insert_trade(&self, trade: &TradeLog) -> Result<u64> {
        let json = serde_json::to_string(trade)?;
        let txn = self.raw().begin_write()?;
        let id = {
            let mut table = txn.open_table(TRADES_T)?;
            let next_id = table.last()?.map(|(k, _)| k.value() + 1).unwrap_or(0);
            table.insert(next_id, json.as_str())?;
            next_id
        };
        txn.commit()?;
        debug!(id, "Trade persisted");
        Ok(id)
    }

    /// Load all trades (for recovery).
    pub fn load_trades(&self) -> Result<Vec<TradeLog>> {
        let txn = self.raw().begin_read()?;
        let table = txn.open_table(TRADES_T)?;
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

    /// Most-recent N trades (ordered oldest → newest, like in-memory Vec).
    pub fn load_recent_trades(&self, limit: usize) -> Result<Vec<TradeLog>> {
        let txn = self.raw().begin_read()?;
        let table = txn.open_table(TRADES_T)?;
        let mut trades = Vec::new();
        for entry in table.iter()?.rev() {
            if trades.len() >= limit {
                break;
            }
            let (_, val) = entry?;
            match serde_json::from_str::<TradeLog>(val.value()) {
                Ok(t) => trades.push(t),
                Err(e) => warn!("Skipping corrupt trade record: {e}"),
            }
        }
        trades.reverse();
        Ok(trades)
    }

    /// Total trade count.
    pub fn trade_count(&self) -> Result<u64> {
        let txn = self.raw().begin_read()?;
        let table = txn.open_table(TRADES_T)?;
        Ok(table.len()?)
    }
}

#[cfg(test)]
#[path = "trades_tests.rs"]
mod trades_tests;
