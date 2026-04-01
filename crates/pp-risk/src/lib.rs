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
mod tests {
    use super::*;
    use pp_core::{AppState, ConditionId, Mode, Position, Side, TokenId};
    use rust_decimal_macros::dec;
    use std::sync::atomic::Ordering;

    /// Build a minimal Config for RiskManager::new.
    fn dummy_config() -> pp_core::Config {
        pp_core::Config {
            mode: Mode::Demo,
            chain_id: 137,
            strategy: pp_core::config::StrategyConfig {
                min_edge: dec!(0.05),
                min_prob: dec!(0.15),
                max_prob: dec!(0.85),
                max_spread: dec!(0.06),
                order_strategy: pp_core::OrderStrategy::Passive,
                market_refresh_secs: 60,
                assets: vec!["BTC".to_string()],
            },
            risk: pp_core::config::RiskConfig {
                daily_loss_limit: dec!(-100),
                daily_profit_cap: dec!(500),
                max_position_pct: dec!(0.05),
                max_concurrent: 3,
                drawdown_limit: dec!(0.20),
                adverse_fill_pause: 3,
                starting_balance: dec!(1000),
            },
            server: pp_core::config::ServerConfig {
                port: 3000,
                frontend_dist: "./dist".into(),
            },
            asset_definitions: vec![
                pp_core::config::AssetDef {
                    symbol: "BTC".to_string(),
                    binance_symbol: "BTCUSDT".to_string(),
                    keywords: vec!["btc".to_string(), "bitcoin".to_string()],
                },
            ],
        }
    }

    /// Helper: create a ready-to-trade AppState (heartbeat alive, not paused)
    fn trading_state() -> Arc<AppState> {
        let state = AppState::new(Mode::Demo);
        state.paused.store(false, Ordering::Relaxed);
        state.heartbeat_alive.store(true, Ordering::Relaxed);
        state.set_starting_balance(dec!(1000.00));
        state
    }

    // ── can_trade: paused ──

    #[test]
    fn can_trade_paused_returns_error() {
        let cfg = dummy_config();
        let rm = RiskManager::new(&cfg);
        let state = AppState::new(Mode::Demo);
        state.paused.store(true, Ordering::Relaxed);
        state.heartbeat_alive.store(true, Ordering::Relaxed);

        let err = rm.can_trade(&state).unwrap_err();
        assert!(err.contains("paused"));
    }

    // ── can_trade: heartbeat dead ──

    #[test]
    fn can_trade_heartbeat_dead_returns_error() {
        let cfg = dummy_config();
        let rm = RiskManager::new(&cfg);
        let state = AppState::new(Mode::Demo);
        state.paused.store(false, Ordering::Relaxed);
        state.heartbeat_alive.store(false, Ordering::Relaxed);

        let err = rm.can_trade(&state).unwrap_err();
        assert!(err.contains("Heartbeat"));
    }

    // ── can_trade: daily loss limit ──

    #[test]
    fn can_trade_daily_loss_limit_hit() {
        let cfg = dummy_config();
        let rm = RiskManager::new(&cfg);
        let state = trading_state();
        // Set daily_pnl to -$200.00 = -20000 cents, limit is -$100
        state.daily_pnl.store(-20000, Ordering::Relaxed);

        let err = rm.can_trade(&state).unwrap_err();
        assert!(err.contains("Daily loss limit"));
    }

    // ── can_trade: daily profit cap ──

    #[test]
    fn can_trade_daily_profit_cap_hit() {
        let cfg = dummy_config();
        let rm = RiskManager::new(&cfg);
        let state = trading_state();
        // Default profit cap in RuntimeConfig is 100_000. Set PnL above that.
        // RuntimeConfig default daily_profit_cap = 100000
        // daily_pnl is in cents, daily_pnl_dec() divides by 100
        // So to exceed 100_000 we need daily_pnl > 10_000_000_0 cents
        // Actually let's set a custom RuntimeConfig with lower cap
        {
            let mut rc = state.runtime_config.write();
            rc.daily_profit_cap = dec!(50);
        }
        state.daily_pnl.store(6000, Ordering::Relaxed); // $60 > $50 cap

        let err = rm.can_trade(&state).unwrap_err();
        assert!(err.contains("Daily profit cap"));
    }

    // ── can_trade: max concurrent positions ──

    #[test]
    fn can_trade_max_concurrent_positions() {
        let cfg = dummy_config();
        let rm = RiskManager::new(&cfg);
        let state = trading_state();
        {
            let mut rc = state.runtime_config.write();
            rc.max_concurrent = 2;
        }

        // Insert 2 positions
        for i in 0..2 {
            state.positions.insert(
                ConditionId(format!("cond_{i}")),
                Position {
                    condition_id: ConditionId(format!("cond_{i}")),
                    token_id: TokenId(format!("tok_{i}")),
                    side: Side::Yes,
                    size: dec!(10),
                    entry_price: dec!(0.50),
                    opened_at: chrono::Utc::now(),
                },
            );
        }

        let err = rm.can_trade(&state).unwrap_err();
        assert!(err.contains("Max concurrent"));
    }

    // ── can_trade: adverse fill streak ──

    #[test]
    fn can_trade_adverse_fill_streak() {
        let cfg = dummy_config();
        let rm = RiskManager::new(&cfg);
        let state = trading_state();
        {
            let mut rc = state.runtime_config.write();
            rc.adverse_fill_pause = 2;
        }

        rm.record_adverse_fill();
        rm.record_adverse_fill();

        let err = rm.can_trade(&state).unwrap_err();
        assert!(err.contains("Adverse fill streak"));
    }

    // ── can_trade: happy path ──

    #[test]
    fn can_trade_all_clear() {
        let cfg = dummy_config();
        let rm = RiskManager::new(&cfg);
        let state = trading_state();

        assert!(rm.can_trade(&state).is_ok());
    }

    // ── position_size ──

    #[test]
    fn position_size_minimum_edge() {
        let cfg = dummy_config();
        let rm = RiskManager::new(&cfg);
        let state = trading_state();
        // edge = 0.10 (min_edge), balance = 1000, max_position_pct = 0.05
        // base = 1000 * 0.05 = 50, multiplier = 0.10/0.10 = 1.0
        // size = 50 * 1.0 = 50, max_size = 1000 * 0.15 = 150
        // result = min(50, 150).max(5) = 50
        let size = rm.position_size(dec!(0.10), dec!(1000), &state);
        assert_eq!(size, dec!(50));
    }

    #[test]
    fn position_size_high_edge_capped() {
        let cfg = dummy_config();
        let rm = RiskManager::new(&cfg);
        let state = trading_state();
        // edge = 0.50, balance = 1000, max_position_pct = 0.05
        // base = 50, multiplier = min(0.50/0.10, 3.0) = min(5.0, 3.0) = 3.0
        // size = 50 * 3 = 150, max_size = 150
        // result = min(150, 150).max(5) = 150
        let size = rm.position_size(dec!(0.50), dec!(1000), &state);
        assert_eq!(size, dec!(150));
    }

    #[test]
    fn position_size_small_balance_uses_floor() {
        let cfg = dummy_config();
        let rm = RiskManager::new(&cfg);
        let state = trading_state();
        // balance = 10, max_position_pct = 0.05
        // base = 10 * 0.05 = 0.50, multiplier = 1.0
        // size = 0.50, max_size = 10 * 0.15 = 1.50
        // result = min(0.50, 1.50).max(5.0) = 5.0 (floor)
        let size = rm.position_size(dec!(0.10), dec!(10), &state);
        assert_eq!(size, dec!(5));
    }

    // ── adverse/good fill recording ──

    #[test]
    fn record_adverse_fill_increments() {
        let cfg = dummy_config();
        let rm = RiskManager::new(&cfg);
        assert_eq!(rm.adverse_streak(), 0);
        rm.record_adverse_fill();
        assert_eq!(rm.adverse_streak(), 1);
        rm.record_adverse_fill();
        assert_eq!(rm.adverse_streak(), 2);
    }

    #[test]
    fn record_good_fill_resets_streak() {
        let cfg = dummy_config();
        let rm = RiskManager::new(&cfg);
        rm.record_adverse_fill();
        rm.record_adverse_fill();
        assert_eq!(rm.adverse_streak(), 2);
        rm.record_good_fill();
        assert_eq!(rm.adverse_streak(), 0);
    }

    #[test]
    fn record_good_fill_noop_when_zero() {
        let cfg = dummy_config();
        let rm = RiskManager::new(&cfg);
        rm.record_good_fill();
        assert_eq!(rm.adverse_streak(), 0);
    }
}
