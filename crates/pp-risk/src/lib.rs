use std::sync::atomic::{AtomicU32, Ordering};
use std::sync::Arc;

use rust_decimal::Decimal;
use rust_decimal_macros::dec;
use tracing::{info, warn};

use pp_core::{AppState, Config};

/// Risk manager that reads live parameters from AppState.runtime_config.
///
/// Only `consecutive_adverse` is local state (needs atomic counter).
/// All other risk limits are read from runtime_config each call, so
/// changes via the Settings UI take effect immediately.
pub struct RiskManager {
    consecutive_adverse: AtomicU32,
}

impl RiskManager {
    pub fn new(_config: &Config) -> Self {
        Self {
            consecutive_adverse: AtomicU32::new(0),
        }
    }

    /// Check if trading is allowed. Returns Ok(()) or Err with reason.
    /// Reads risk parameters from runtime_config each call.
    pub fn can_trade(&self, state: &Arc<AppState>) -> Result<(), String> {
        if state.is_paused() {
            return Err("Bot is paused".into());
        }

        if !state.is_heartbeat_alive() {
            return Err("Heartbeat not alive".into());
        }

        // Read live risk limits
        let (daily_loss, daily_cap, max_concurrent, drawdown_limit, adverse_pause) = {
            let rc = state.runtime_config.read();
            (
                rc.daily_loss_limit,
                rc.daily_profit_cap,
                rc.max_concurrent,
                rc.drawdown_limit,
                rc.adverse_fill_pause,
            )
        };

        // Daily loss limit
        let pnl = state.daily_pnl_dec();
        if pnl < daily_loss {
            return Err(format!("Daily loss limit hit: {pnl}"));
        }

        // Daily profit cap
        if pnl > daily_cap {
            return Err(format!("Daily profit cap hit: {pnl}"));
        }

        // Max concurrent positions
        if state.positions.len() >= max_concurrent {
            return Err(format!("Max concurrent positions: {}", max_concurrent));
        }

        // Drawdown check: (peak_balance - current_balance) / peak_balance
        let peak = state.peak_balance.load(Ordering::Relaxed);
        if peak > 0 {
            let current_balance = state.current_balance_cents();
            if current_balance < peak {
                let drawdown = Decimal::new(peak - current_balance, 2) / Decimal::new(peak, 2);
                if drawdown > drawdown_limit {
                    return Err(format!("Drawdown limit hit: {drawdown}"));
                }
            }
        }

        // Adverse fill streak
        let streak = self.consecutive_adverse.load(Ordering::Relaxed);
        if streak >= adverse_pause {
            return Err(format!(
                "Adverse fill streak: {} >= {}",
                streak, adverse_pause
            ));
        }

        Ok(())
    }

    /// Kelly-inspired position sizing. Reads max_position_pct from runtime_config.
    pub fn position_size(&self, edge: Decimal, balance: Decimal, state: &Arc<AppState>) -> Decimal {
        let max_pos_pct = state.runtime_config.read().max_position_pct;
        let base = balance * max_pos_pct;
        let min_edge = dec!(0.10);
        let multiplier = (edge / min_edge).min(dec!(3.0)).max(dec!(1.0));
        let size = base * multiplier;
        let max_size = balance * dec!(0.15);
        size.min(max_size).max(dec!(5.0))
    }

    pub fn record_adverse_fill(&self) {
        let prev = self.consecutive_adverse.fetch_add(1, Ordering::Relaxed);
        warn!(streak = prev + 1, "Adverse fill recorded");
    }

    pub fn record_good_fill(&self) {
        let prev = self.consecutive_adverse.swap(0, Ordering::Relaxed);
        if prev > 0 {
            info!(prev_streak = prev, "Adverse streak reset");
        }
    }

    pub fn adverse_streak(&self) -> u32 {
        self.consecutive_adverse.load(Ordering::Relaxed)
    }
}

#[cfg(test)]
mod lib_tests;

