use super::*;
use rust_decimal_macros::dec;
use crate::models::trade::OrderStrategy;

/// Helper: build a valid Config for mutation-based testing.
fn valid_config() -> Config {
    Config {
        chain_id: 137,
        strategy: StrategyConfig {
            min_edge: dec!(0.05),
            min_prob: dec!(0.15),
            max_prob: dec!(0.85),
            max_spread: dec!(0.06),
            order_strategy: OrderStrategy::Passive,
            market_refresh_secs: 60,
            assets: vec!["BTC".to_string()],
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
        whales: WhalesConfig {
            min_trade_usd: dec!(200),
            min_win_rate: 0.55,
            min_roi: 0.15,
            min_profit_usd: dec!(500),
            poll_interval_secs: 300,
        },
        asset_definitions: vec![
            AssetDef {
                symbol: "BTC".to_string(),
                binance_symbol: "BTCUSDT".to_string(),
                keywords: vec!["btc".to_string(), "bitcoin".to_string()],
            },
        ],
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
    cfg.strategy.min_prob = dec!(0.005);
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
    assert_eq!(rc.assets, cfg.strategy.assets.iter().map(|s| Asset::new(s)).collect::<Vec<_>>());
    assert_eq!(rc.daily_loss_limit, cfg.risk.daily_loss_limit);
    assert_eq!(rc.daily_profit_cap, cfg.risk.daily_profit_cap);
    assert_eq!(rc.max_position_pct, cfg.risk.max_position_pct);
    assert_eq!(rc.max_concurrent, cfg.risk.max_concurrent);
    assert_eq!(rc.drawdown_limit, cfg.risk.drawdown_limit);
    assert_eq!(rc.adverse_fill_pause, cfg.risk.adverse_fill_pause);
    assert_eq!(rc.min_whale_trade_usd, cfg.whales.min_trade_usd);
    assert_eq!(rc.min_whale_win_rate, cfg.whales.min_win_rate);
    assert_eq!(rc.min_whale_roi, cfg.whales.min_roi);
    assert_eq!(rc.min_whale_profit_usd, cfg.whales.min_profit_usd);
    assert_eq!(rc.whale_poll_interval_secs, cfg.whales.poll_interval_secs);
}
