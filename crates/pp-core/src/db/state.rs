//! State checkpoints: balance, peak, daily-PnL reset date.

use anyhow::Result;

use super::{BotDb, STATE_T};

impl BotDb {
    pub fn save_state(&self, key: &str, value: &str) -> Result<()> {
        let txn = self.raw().begin_write()?;
        {
            let mut table = txn.open_table(STATE_T)?;
            table.insert(key, value)?;
        }
        txn.commit()?;
        Ok(())
    }

    pub fn load_state(&self, key: &str) -> Result<Option<String>> {
        let txn = self.raw().begin_read()?;
        let table = txn.open_table(STATE_T)?;
        Ok(table.get(key)?.map(|v| v.value().to_string()))
    }

    /// Save daily PnL and peak balance atomically (cents).
    pub fn checkpoint_balance(&self, daily_pnl_cents: i64, peak_balance_cents: i64) -> Result<()> {
        let txn = self.raw().begin_write()?;
        {
            let mut table = txn.open_table(STATE_T)?;
            table.insert("daily_pnl", daily_pnl_cents.to_string().as_str())?;
            table.insert("peak_balance", peak_balance_cents.to_string().as_str())?;
        }
        txn.commit()?;
        Ok(())
    }

    /// Returns `(daily_pnl_cents, peak_balance_cents)` or `None` if absent.
    pub fn load_balance_checkpoint(&self) -> Result<Option<(i64, i64)>> {
        let txn = self.raw().begin_read()?;
        let table = txn.open_table(STATE_T)?;
        let pnl = table.get("daily_pnl")?.and_then(|v| v.value().parse::<i64>().ok());
        let peak = table.get("peak_balance")?.and_then(|v| v.value().parse::<i64>().ok());
        match (pnl, peak) {
            (Some(p), Some(pk)) => Ok(Some((p, pk))),
            _ => Ok(None),
        }
    }

    pub fn save_trading_date(&self, date: &str) -> Result<()> {
        self.save_state("trading_date", date)
    }

    pub fn load_trading_date(&self) -> Result<Option<String>> {
        self.load_state("trading_date")
    }
}

#[cfg(test)]
#[path = "state_tests.rs"]
mod state_tests;
