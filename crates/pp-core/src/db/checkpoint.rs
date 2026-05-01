//! Background checkpoint loop: persists balance, equity, and resets daily PnL at UTC midnight.

use std::sync::Arc;
use std::sync::atomic::Ordering;

use anyhow::Result;
use rust_decimal::Decimal;
use rust_decimal::prelude::ToPrimitive;
use tracing::{info, warn};

use crate::AppState;

/// Periodic checkpoint task — saves state every `interval_secs` seconds.
/// Also handles daily PnL reset at midnight UTC.
/// Exits cleanly when the shutdown token is cancelled.
pub async fn checkpoint_loop(state: Arc<AppState>, interval_secs: u64) -> Result<()> {
    let mut interval = tokio::time::interval(std::time::Duration::from_secs(interval_secs));

    loop {
        tokio::select! {
            _ = state.shutdown.cancelled() => {
                if let Some(ref db) = state.db {
                    let pnl = state.daily_pnl.load(Ordering::Relaxed);
                    let peak = state.peak_balance.load(Ordering::Relaxed);
                    let _ = db.checkpoint_balance(pnl, peak);
                    info!("Final DB checkpoint on shutdown");
                }
                return Ok(());
            }
            _ = interval.tick() => {
                let Some(ref db) = state.db else { continue };

                // ── Daily PnL reset check ──
                let today = chrono::Utc::now().format("%Y-%m-%d").to_string();
                let saved_date = db.load_trading_date().unwrap_or(None);

                if saved_date.as_deref() != Some(&today) {
                    let old_pnl = state.daily_pnl.swap(0, Ordering::Relaxed);
                    let current = state.current_balance_cents();
                    state.peak_balance.store(current, Ordering::Relaxed);
                    state.starting_balance.store(current, Ordering::Relaxed);

                    if let Err(e) = db.save_trading_date(&today) {
                        warn!("Failed to save trading date: {e}");
                    }

                    if old_pnl != 0 {
                        info!(
                            old_pnl_cents = old_pnl,
                            new_starting_balance_cents = current,
                            "Daily PnL reset (new trading day)"
                        );
                    }
                }

                // ── Regular balance checkpoint ──
                let pnl = state.daily_pnl.load(Ordering::Relaxed);
                let peak = state.peak_balance.load(Ordering::Relaxed);
                if let Err(e) = db.checkpoint_balance(pnl, peak) {
                    warn!("Balance checkpoint failed: {e}");
                }

                // ── Equity point ──
                let total_pnl = state.trades.read()
                    .iter()
                    .filter_map(|t| t.pnl)
                    .fold(Decimal::ZERO, |acc, p| acc + p);

                if let Some(cents) = (total_pnl * Decimal::new(100, 0)).to_i64() {
                    let now_ts = chrono::Utc::now().timestamp() as u64;
                    if let Err(e) = db.save_equity_point(now_ts, cents) {
                        warn!("Failed to save equity point: {e}");
                    }
                }
            }
        }
    }
}
