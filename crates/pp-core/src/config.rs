use rust_decimal::Decimal;
use serde::Deserialize;

use crate::types::{Asset, Mode, OrderStrategy, RuntimeConfig};

#[derive(Debug, Deserialize)]
pub struct Config {
    pub mode: Mode,
    pub chain_id: u64,
    pub strategy: StrategyConfig,
    pub risk: RiskConfig,
    pub server: ServerConfig,
}

#[derive(Debug, Deserialize)]
pub struct StrategyConfig {
    pub min_edge: Decimal,
    pub min_prob: Decimal,
    pub max_prob: Decimal,
    pub max_spread: Decimal,
    pub order_strategy: OrderStrategy,
    pub market_refresh_secs: u64,
    pub assets: Vec<Asset>,
}

#[derive(Debug, Deserialize)]
pub struct RiskConfig {
    pub daily_loss_limit: Decimal,
    pub daily_profit_cap: Decimal,
    pub max_position_pct: Decimal,
    pub max_concurrent: usize,
    pub drawdown_limit: Decimal,
    pub adverse_fill_pause: u32,
    pub starting_balance: Decimal,
}

#[derive(Debug, Deserialize)]
pub struct ServerConfig {
    pub port: u16,
    pub frontend_dist: String,
}

impl Config {
    pub fn load(path: &str) -> anyhow::Result<Self> {
        let content = std::fs::read_to_string(path)?;
        let config: Config = toml::from_str(&content)?;
        config.validate()?;
        Ok(config)
    }

    fn validate(&self) -> anyhow::Result<()> {
        use anyhow::bail;
        use rust_decimal_macros::dec;

        // Strategy validation
        if self.strategy.min_edge <= Decimal::ZERO {
            bail!("min_edge must be positive, got {}", self.strategy.min_edge);
        }
        if self.strategy.min_prob >= self.strategy.max_prob {
            bail!(
                "min_prob ({}) must be less than max_prob ({})",
                self.strategy.min_prob,
                self.strategy.max_prob
            );
        }
        if self.strategy.min_prob < dec!(0.01) || self.strategy.max_prob > dec!(0.99) {
            bail!("prob bounds must be in [0.01, 0.99]");
        }
        if self.strategy.max_spread <= Decimal::ZERO {
            bail!("max_spread must be positive");
        }
        if self.strategy.market_refresh_secs == 0 {
            bail!("market_refresh_secs must be > 0");
        }
        if self.strategy.assets.is_empty() {
            bail!("assets list must not be empty");
        }

        // Risk validation
        if self.risk.daily_loss_limit >= Decimal::ZERO {
            bail!(
                "daily_loss_limit must be negative, got {}",
                self.risk.daily_loss_limit
            );
        }
        if self.risk.daily_profit_cap <= Decimal::ZERO {
            bail!("daily_profit_cap must be positive");
        }
        if self.risk.max_position_pct <= Decimal::ZERO || self.risk.max_position_pct > dec!(1.0) {
            bail!(
                "max_position_pct must be in (0, 1], got {}",
                self.risk.max_position_pct
            );
        }
        if self.risk.drawdown_limit <= Decimal::ZERO || self.risk.drawdown_limit > dec!(1.0) {
            bail!(
                "drawdown_limit must be in (0, 1], got {}",
                self.risk.drawdown_limit
            );
        }
        if self.risk.max_concurrent == 0 {
            bail!("max_concurrent must be > 0");
        }

        // Starting balance
        if self.risk.starting_balance <= Decimal::ZERO {
            bail!(
                "starting_balance must be positive, got {}",
                self.risk.starting_balance
            );
        }

        Ok(())
    }

    /// Create a RuntimeConfig snapshot from the initial static config
    pub fn to_runtime_config(&self) -> RuntimeConfig {
        RuntimeConfig {
            min_edge: self.strategy.min_edge,
            min_prob: self.strategy.min_prob,
            max_prob: self.strategy.max_prob,
            max_spread: self.strategy.max_spread,
            order_strategy: self.strategy.order_strategy,
            market_refresh_secs: self.strategy.market_refresh_secs,
            assets: self.strategy.assets.clone(),
            daily_loss_limit: self.risk.daily_loss_limit,
            daily_profit_cap: self.risk.daily_profit_cap,
            max_position_pct: self.risk.max_position_pct,
            max_concurrent: self.risk.max_concurrent,
            drawdown_limit: self.risk.drawdown_limit,
            adverse_fill_pause: self.risk.adverse_fill_pause,
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use rust_decimal_macros::dec;

    /// Helper: build a valid Config for mutation-based testing.
    fn valid_config() -> Config {
        Config {
            mode: Mode::Demo,
            chain_id: 137,
            strategy: StrategyConfig {
                min_edge: dec!(0.05),
                min_prob: dec!(0.15),
                max_prob: dec!(0.85),
                max_spread: dec!(0.06),
                order_strategy: OrderStrategy::Passive,
                market_refresh_secs: 60,
                assets: vec![Asset::Btc],
            },
            risk: RiskConfig {
                daily_loss_limit: dec!(-100),
                daily_profit_cap: dec!(500),
                max_position_pct: dec!(0.05),
                max_concurrent: 5,
                drawdown_limit: dec!(0.20),
                adverse_fill_pause: 3,
                starting_balance: dec!(1000),
            },
            server: ServerConfig {
                port: 3000,
                frontend_dist: "./dist".into(),
            },
        }
    }

    #[test]
    fn valid_config_passes_validation() {
        assert!(valid_config().validate().is_ok());
    }

    #[test]
    fn min_edge_zero_fails() {
        let mut cfg = valid_config();
        cfg.strategy.min_edge = dec!(0);
        let err = cfg.validate().unwrap_err();
        assert!(err.to_string().contains("min_edge must be positive"));
    }

    #[test]
    fn min_edge_negative_fails() {
        let mut cfg = valid_config();
        cfg.strategy.min_edge = dec!(-0.01);
        let err = cfg.validate().unwrap_err();
        assert!(err.to_string().contains("min_edge must be positive"));
    }

    #[test]
    fn min_prob_gte_max_prob_fails() {
        let mut cfg = valid_config();
        cfg.strategy.min_prob = dec!(0.85);
        cfg.strategy.max_prob = dec!(0.85);
        let err = cfg.validate().unwrap_err();
        assert!(err.to_string().contains("min_prob"));
    }

    #[test]
    fn min_prob_greater_than_max_prob_fails() {
        let mut cfg = valid_config();
        cfg.strategy.min_prob = dec!(0.90);
        cfg.strategy.max_prob = dec!(0.85);
        let err = cfg.validate().unwrap_err();
        assert!(err.to_string().contains("min_prob"));
    }

    #[test]
    fn prob_out_of_bounds_fails() {
        let mut cfg = valid_config();
        cfg.strategy.min_prob = dec!(0.005); // below 0.01
        let err = cfg.validate().unwrap_err();
        assert!(err.to_string().contains("prob bounds"));
    }

    #[test]
    fn max_prob_above_099_fails() {
        let mut cfg = valid_config();
        cfg.strategy.max_prob = dec!(0.995);
        let err = cfg.validate().unwrap_err();
        assert!(err.to_string().contains("prob bounds"));
    }

    #[test]
    fn max_spread_zero_fails() {
        let mut cfg = valid_config();
        cfg.strategy.max_spread = dec!(0);
        let err = cfg.validate().unwrap_err();
        assert!(err.to_string().contains("max_spread must be positive"));
    }

    #[test]
    fn market_refresh_secs_zero_fails() {
        let mut cfg = valid_config();
        cfg.strategy.market_refresh_secs = 0;
        let err = cfg.validate().unwrap_err();
        assert!(err.to_string().contains("market_refresh_secs"));
    }

    #[test]
    fn empty_assets_fails() {
        let mut cfg = valid_config();
        cfg.strategy.assets = vec![];
        let err = cfg.validate().unwrap_err();
        assert!(err.to_string().contains("assets list must not be empty"));
    }

    #[test]
    fn daily_loss_limit_positive_fails() {
        let mut cfg = valid_config();
        cfg.risk.daily_loss_limit = dec!(10);
        let err = cfg.validate().unwrap_err();
        assert!(err.to_string().contains("daily_loss_limit must be negative"));
    }

    #[test]
    fn daily_loss_limit_zero_fails() {
        let mut cfg = valid_config();
        cfg.risk.daily_loss_limit = dec!(0);
        let err = cfg.validate().unwrap_err();
        assert!(err.to_string().contains("daily_loss_limit must be negative"));
    }

    #[test]
    fn daily_profit_cap_zero_fails() {
        let mut cfg = valid_config();
        cfg.risk.daily_profit_cap = dec!(0);
        let err = cfg.validate().unwrap_err();
        assert!(err.to_string().contains("daily_profit_cap must be positive"));
    }

    #[test]
    fn max_position_pct_zero_fails() {
        let mut cfg = valid_config();
        cfg.risk.max_position_pct = dec!(0);
        let err = cfg.validate().unwrap_err();
        assert!(err.to_string().contains("max_position_pct"));
    }

    #[test]
    fn max_position_pct_above_one_fails() {
        let mut cfg = valid_config();
        cfg.risk.max_position_pct = dec!(1.01);
        let err = cfg.validate().unwrap_err();
        assert!(err.to_string().contains("max_position_pct"));
    }

    #[test]
    fn max_position_pct_one_passes() {
        let mut cfg = valid_config();
        cfg.risk.max_position_pct = dec!(1.0);
        assert!(cfg.validate().is_ok());
    }

    #[test]
    fn drawdown_limit_zero_fails() {
        let mut cfg = valid_config();
        cfg.risk.drawdown_limit = dec!(0);
        let err = cfg.validate().unwrap_err();
        assert!(err.to_string().contains("drawdown_limit"));
    }

    #[test]
    fn drawdown_limit_above_one_fails() {
        let mut cfg = valid_config();
        cfg.risk.drawdown_limit = dec!(1.5);
        let err = cfg.validate().unwrap_err();
        assert!(err.to_string().contains("drawdown_limit"));
    }

    #[test]
    fn max_concurrent_zero_fails() {
        let mut cfg = valid_config();
        cfg.risk.max_concurrent = 0;
        let err = cfg.validate().unwrap_err();
        assert!(err.to_string().contains("max_concurrent"));
    }

    #[test]
    fn starting_balance_zero_fails() {
        let mut cfg = valid_config();
        cfg.risk.starting_balance = dec!(0);
        let err = cfg.validate().unwrap_err();
        assert!(err.to_string().contains("starting_balance must be positive"));
    }

    #[test]
    fn starting_balance_negative_fails() {
        let mut cfg = valid_config();
        cfg.risk.starting_balance = dec!(-50);
        let err = cfg.validate().unwrap_err();
        assert!(err.to_string().contains("starting_balance must be positive"));
    }

    #[test]
    fn to_runtime_config_maps_all_fields() {
        let cfg = valid_config();
        let rc = cfg.to_runtime_config();

        assert_eq!(rc.min_edge, cfg.strategy.min_edge);
        assert_eq!(rc.min_prob, cfg.strategy.min_prob);
        assert_eq!(rc.max_prob, cfg.strategy.max_prob);
        assert_eq!(rc.max_spread, cfg.strategy.max_spread);
        assert_eq!(rc.order_strategy, cfg.strategy.order_strategy);
        assert_eq!(rc.market_refresh_secs, cfg.strategy.market_refresh_secs);
        assert_eq!(rc.assets, cfg.strategy.assets);
        assert_eq!(rc.daily_loss_limit, cfg.risk.daily_loss_limit);
        assert_eq!(rc.daily_profit_cap, cfg.risk.daily_profit_cap);
        assert_eq!(rc.max_position_pct, cfg.risk.max_position_pct);
        assert_eq!(rc.max_concurrent, cfg.risk.max_concurrent);
        assert_eq!(rc.drawdown_limit, cfg.risk.drawdown_limit);
        assert_eq!(rc.adverse_fill_pause, cfg.risk.adverse_fill_pause);
    }
}
