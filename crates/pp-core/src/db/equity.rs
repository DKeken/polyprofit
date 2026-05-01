//! Equity-curve points (PnL over time) for the dashboard.

use anyhow::Result;
use redb::{ReadableTable, ReadableTableMetadata};
use rust_decimal::Decimal;
use rust_decimal::prelude::ToPrimitive;

use crate::types::TradeLog;

use super::{BotDb, EQUITY_CURVE_T};

impl BotDb {
    pub fn save_equity_point(&self, time: u64, pnl_cents: i64) -> Result<()> {
        let txn = self.raw().begin_write()?;
        {
            let mut table = txn.open_table(EQUITY_CURVE_T)?;
            table.insert(time, pnl_cents)?;
        }
        txn.commit()?;
        Ok(())
    }

    /// Load equity points since `since_ts`, downsampled to at most `max_points`.
    pub fn load_equity_history_since(
        &self,
        since_ts: u64,
        max_points: usize,
    ) -> Result<Vec<(u64, i64)>> {
        let txn = self.raw().begin_read()?;
        let table = txn.open_table(EQUITY_CURVE_T)?;
        let mut all_points = Vec::new();
        for entry in table.iter()?.rev() {
            let (k, v) = entry?;
            let ts = k.value();
            if ts < since_ts {
                break;
            }
            all_points.push((ts, v.value()));
        }
        all_points.reverse();

        if all_points.len() <= max_points {
            return Ok(all_points);
        }

        let step = all_points.len() as f64 / max_points as f64;
        let mut sampled = Vec::with_capacity(max_points);
        for i in 0..max_points {
            let idx = (i as f64 * step) as usize;
            if let Some(&p) = all_points.get(idx) {
                sampled.push(p);
            }
        }

        if let Some(&last) = all_points.last()
            && sampled.last().map(|(t, _)| *t) != Some(last.0) {
                sampled.push(last);
            }

        Ok(sampled)
    }

    /// Backfill equity curve from historical trades if it is empty.
    pub fn backfill_equity_if_empty(&self, trades: &[TradeLog]) -> Result<()> {
        let needs_backfill = {
            let txn = self.raw().begin_read()?;
            let table = txn.open_table(EQUITY_CURVE_T)?;
            table.is_empty()?
        };

        if !needs_backfill || trades.is_empty() {
            return Ok(());
        }

        let txn = self.raw().begin_write()?;
        {
            let mut table = txn.open_table(EQUITY_CURVE_T)?;
            let mut cumulative = Decimal::ZERO;
            for t in trades {
                if let Some(pnl) = t.pnl {
                    cumulative += pnl;
                    if let Some(cents) = (cumulative * Decimal::new(100, 0)).to_i64() {
                        table.insert(t.timestamp.timestamp() as u64, cents)?;
                    }
                }
            }
        }
        txn.commit()?;
        Ok(())
    }
}
