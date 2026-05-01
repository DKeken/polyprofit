use rust_decimal::Decimal;

use crate::models::market::{Asset, AssetMeta};
use crate::models::config::RuntimeConfig;

// Re-export config structs for backward compatibility (pp_core::config::StrategyConfig etc.)
pub use crate::models::config::{Config, StrategyConfig, RiskConfig, ServerConfig, WhalesConfig, AssetDef};

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

        // Validate active assets have matching definitions
        let defined_symbols: Vec<String> = self.asset_definitions.iter()
            .map(|d| d.symbol.to_uppercase())
            .collect();
        for active in &self.strategy.assets {
            let upper = active.to_uppercase();
            if !defined_symbols.contains(&upper) {
                bail!(
                    "Active asset '{}' has no matching [[asset_definitions]] entry. Defined: {:?}",
                    active, defined_symbols
                );
            }
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
            assets: self.strategy.assets.iter().map(|s| Asset::new(s)).collect(),
            daily_loss_limit: self.risk.daily_loss_limit,
            daily_profit_cap: self.risk.daily_profit_cap,
            max_position_pct: self.risk.max_position_pct,
            max_concurrent: self.risk.max_concurrent,
            drawdown_limit: self.risk.drawdown_limit,
            adverse_fill_pause: self.risk.adverse_fill_pause,
            min_whale_trade_usd: self.whales.min_trade_usd,
            min_whale_win_rate: self.whales.min_win_rate,
            min_whale_roi: self.whales.min_roi,
            min_whale_profit_usd: self.whales.min_profit_usd,
            whale_poll_interval_secs: self.whales.poll_interval_secs,
            asset_definitions: self.asset_definitions.iter().map(|d| AssetMeta {
                symbol: d.symbol.to_uppercase(),
                binance_symbol: d.binance_symbol.clone(),
                keywords: d.keywords.iter().map(|k| k.to_lowercase()).collect(),
            }).collect(),
        }
    }
}

#[cfg(test)]
#[path = "config_tests.rs"]
mod config_tests;
