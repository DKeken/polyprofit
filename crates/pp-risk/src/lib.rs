use std::sync::atomic::{AtomicU32, Ordering};
use std::sync::Arc;

use rust_decimal::Decimal;
use rust_decimal_macros::dec;
use tracing::{info, warn};

use pp_core::{AppState, Config};

pub struct RiskManager {
    daily_loss: Decimal,
    daily_cap: Decimal,
    max_pos_pct: Decimal,
    max_concurrent: usize,
    drawdown_limit: Decimal,
    adverse_pause: u32,
    consecutive_adverse: AtomicU32,
}

impl RiskManager {
    pub fn new(config: &Config) -> Self {
        Self {
            daily_loss: config.risk.daily_loss_limit,
            daily_cap: config.risk.daily_profit_cap,
            max_pos_pct: config.risk.max_position_pct,
            max_concurrent: config.risk.max_concurrent,
            drawdown_limit: config.risk.drawdown_limit,
            adverse_pause: config.risk.adverse_fill_pause,
            consecutive_adverse: AtomicU32::new(0),
        }
    }

    /// Check if trading is allowed. Returns Ok(()) or Err with reason.
    pub fn can_trade(&self, state: &Arc<AppState>) -> Result<(), String> {
        if state.is_paused() {
            return Err("Bot is paused".into());
        }

        if !state.is_heartbeat_alive() {
            return Err("Heartbeat not alive".into());
        }

        // Daily loss limit
        let pnl = state.daily_pnl_dec();
        if pnl < self.daily_loss {
            return Err(format!("Daily loss limit hit: {pnl}"));
        }

        // Daily profit cap
        if pnl > self.daily_cap {
            return Err(format!("Daily profit cap hit: {pnl}"));
        }

        // Max concurrent positions
        if state.positions.len() >= self.max_concurrent {
            return Err(format!("Max concurrent positions: {}", self.max_concurrent));
        }

        // Drawdown check: (peak_balance - current_balance) / peak_balance
        let peak = state.peak_balance.load(Ordering::Relaxed);
        if peak > 0 {
            let current_balance = state.current_balance_cents();
            if current_balance < peak {
                let drawdown = Decimal::new(peak - current_balance, 2) / Decimal::new(peak, 2);
                if drawdown > self.drawdown_limit {
                    return Err(format!("Drawdown limit hit: {drawdown}"));
                }
            }
        }

        // Adverse fill streak
        let streak = self.consecutive_adverse.load(Ordering::Relaxed);
        if streak >= self.adverse_pause {
            return Err(format!(
                "Adverse fill streak: {} >= {}",
                streak, self.adverse_pause
            ));
        }

        Ok(())
    }

    /// Kelly-inspired position sizing
    pub fn position_size(&self, edge: Decimal, balance: Decimal) -> Decimal {
        let base = balance * self.max_pos_pct;
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
