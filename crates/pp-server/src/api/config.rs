use std::sync::Arc;
use axum::extract::State;
use axum::response::IntoResponse;
use axum::Json;
use pp_core::{AppState, Asset, RuntimeConfig, OrderStrategy, AssetMeta};


use crate::api::error::{bad_request, internal_error};
use crate::api::dto::ConfigUpdate;

pub async fn get_config(State(state): State<Arc<AppState>>) -> Json<RuntimeConfig> {
    let cfg = state.runtime_config.read().clone();
    Json(cfg)
}

pub async fn update_config(
    State(state): State<Arc<AppState>>,
    Json(update): Json<ConfigUpdate>,
) -> impl IntoResponse {
    use std::str::FromStr;

    let mut cfg = state.runtime_config.write();
    let mut changes: Vec<String> = Vec::new();

    macro_rules! update_decimal {
        ($field:ident, $name:expr) => {
            if let Some(ref val) = update.$field {
                match rust_decimal::Decimal::from_str(val) {
                    Ok(d) => {
                        cfg.$field = d;
                        changes.push(format!("{}: {}", $name, d));
                    }
                    Err(_) => {
                        return bad_request(format!("Invalid value for {}: {}", $name, val))
                            .into_response();
                    }
                }
            }
        };
        ($field:ident, $name:expr, $min:expr, $max:expr) => {
            if let Some(ref val) = update.$field {
                match rust_decimal::Decimal::from_str(val) {
                    Ok(d) => {
                        let min_d: rust_decimal::Decimal = rust_decimal_macros::dec!($min);
                        let max_d: rust_decimal::Decimal = rust_decimal_macros::dec!($max);
                        if d < min_d || d > max_d {
                            return bad_request(format!(
                                "{} must be between {} and {}, got {}",
                                $name, min_d, max_d, d
                            ))
                            .into_response();
                        }
                        cfg.$field = d;
                        changes.push(format!("{}: {}", $name, d));
                    }
                    Err(_) => {
                        return bad_request(format!("Invalid value for {}: {}", $name, val))
                            .into_response();
                    }
                }
            }
        };
    }

    update_decimal!(min_edge, "min_edge", 0.001, 0.50);
    update_decimal!(min_prob, "min_prob", 0.01, 0.99);
    update_decimal!(max_prob, "max_prob", 0.01, 0.99);
    update_decimal!(max_spread, "max_spread", 0.001, 0.50);
    update_decimal!(daily_loss_limit, "daily_loss_limit");
    update_decimal!(daily_profit_cap, "daily_profit_cap");
    update_decimal!(max_position_pct, "max_position_pct", 0.001, 1.0);
    update_decimal!(drawdown_limit, "drawdown_limit", 0.01, 1.0);

    if let Some(ref strategy) = update.order_strategy {
        match strategy.as_str() {
            "Passive" => {
                cfg.order_strategy = OrderStrategy::Passive;
                changes.push("order_strategy: Passive".into());
            }
            "Balanced" => {
                cfg.order_strategy = OrderStrategy::Balanced;
                changes.push("order_strategy: Balanced".into());
            }
            "Aggressive" => {
                cfg.order_strategy = OrderStrategy::Aggressive;
                changes.push("order_strategy: Aggressive".into());
            }
            _ => {
                return bad_request(format!(
                    "Invalid order_strategy: {}. Use: Passive, Balanced, Aggressive",
                    strategy
                ))
                .into_response();
            }
        }
    }

    if let Some(secs) = update.market_refresh_secs {
        if secs == 0 {
            return bad_request("market_refresh_secs must be > 0").into_response();
        }
        cfg.market_refresh_secs = secs;
        changes.push(format!("market_refresh_secs: {}", secs));
    }

    if let Some(mc) = update.max_concurrent {
        if mc == 0 {
            return bad_request("max_concurrent must be > 0").into_response();
        }
        cfg.max_concurrent = mc;
        changes.push(format!("max_concurrent: {}", mc));
    }

    if let Some(afp) = update.adverse_fill_pause {
        cfg.adverse_fill_pause = afp;
        changes.push(format!("adverse_fill_pause: {}", afp));
    }

    if let Some(ref asset_list) = update.assets {
        if asset_list.is_empty() {
            return bad_request("assets list must not be empty").into_response();
        }
        let mut parsed = Vec::new();
        for name in asset_list {
            let asset = Asset::new(name);
            let is_valid = if let Some(ref new_defs) = update.asset_definitions {
                new_defs
                    .iter()
                    .any(|d| d.symbol.to_uppercase() == name.to_uppercase())
            } else {
                state.asset_registry.contains_key(&asset)
            };
            if !is_valid {
                return bad_request(format!(
                    "Unknown asset: '{}'. Add it to Asset Definitions first.",
                    name
                ))
                .into_response();
            }
            parsed.push(asset);
        }
        cfg.assets = parsed;
        changes.push(format!("assets: {:?}", asset_list));
    }

    if let Some(ref def_list) = update.asset_definitions {
        if def_list.is_empty() {
            return bad_request("asset_definitions must not be empty").into_response();
        }
        for d in def_list {
            if d.symbol.trim().is_empty() {
                return bad_request("Asset symbol cannot be empty").into_response();
            }
            if d.binance_symbol.trim().is_empty() {
                return bad_request(format!("Binance symbol required for asset '{}'", d.symbol))
                    .into_response();
            }
            if d.keywords.is_empty() {
                return bad_request(format!("At least one keyword required for asset '{}'", d.symbol))
                    .into_response();
            }
        }
        let mut seen = std::collections::HashSet::new();
        for d in def_list {
            let upper = d.symbol.to_uppercase();
            if !seen.insert(upper.clone()) {
                return bad_request(format!("Duplicate asset symbol: '{}'", d.symbol))
                    .into_response();
            }
        }
        cfg.asset_definitions = def_list
            .iter()
            .map(|d| AssetMeta {
                symbol: d.symbol.trim().to_uppercase(),
                binance_symbol: d.binance_symbol.trim().to_uppercase(),
                keywords: d.keywords.iter().map(|k| k.trim().to_lowercase()).collect(),
            })
            .collect();
        changes.push(format!("asset_definitions: {} assets", def_list.len()));

        let defined_symbols: Vec<String> = cfg.asset_definitions.iter().map(|d| d.symbol.clone()).collect();
        let invalid_active: Vec<String> = cfg
            .assets
            .iter()
            .filter(|a| !defined_symbols.contains(&a.0))
            .map(|a| a.0.clone())
            .collect();
        if !invalid_active.is_empty() {
            cfg.assets.retain(|a| defined_symbols.contains(&a.0));
            changes.push(format!(
                "auto-removed orphaned active assets: {:?}",
                invalid_active
            ));
        }
    }

    if cfg.min_prob >= cfg.max_prob {
        return bad_request(format!(
            "min_prob ({}) must be less than max_prob ({})",
            cfg.min_prob, cfg.max_prob
        ))
        .into_response();
    }

    if cfg.market_refresh_secs < 10 {
        return bad_request("market_refresh_secs must be >= 10").into_response();
    }

    tracing::info!(changes = ?changes, "Config updated via API");

    if let Some(ref db) = state.db {
        if let Err(e) = db.save_config(&cfg) {
            tracing::error!(error = %e, "Failed to persist config to DB");
            return internal_error(format!("failed to persist config: {e}")).into_response();
        }
    }

    drop(cfg);
    state.rebuild_asset_registry();

    let cfg = state.runtime_config.read();
    Json(serde_json::json!({
        "status": "updated",
        "changes": changes,
        "config": *cfg
    }))
    .into_response()
}
