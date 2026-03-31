use std::sync::atomic::Ordering;
use std::sync::Arc;

use axum::extract::State;
use axum::routing::get;
use axum::{Json, Router};
use rust_decimal_macros::dec;
use serde::{Deserialize, Serialize};

use pp_core::{AppState, RuntimeConfig};

pub fn routes(_state: Arc<AppState>) -> Router<Arc<AppState>> {
    Router::new()
        .route("/status", get(status))
        .route("/positions", get(positions))
        .route("/trades", get(trades))
        .route("/db/stats", get(db_stats))
        .route("/pause", axum::routing::post(pause))
        .route("/resume", axum::routing::post(resume))
        .route("/kill", axum::routing::post(kill))
        .route("/config", get(get_config).put(update_config))
}

#[derive(Serialize)]
struct StatusResponse {
    paused: bool,
    heartbeat_alive: bool,
    daily_pnl: String,
    active_positions: usize,
    active_orders: usize,
    active_markets: usize,
    signals_generated: u64,
    orders_placed: u64,
    orders_filled: u64,
    adverse_fills: u64,
    ws_reconnects: u64,
}

async fn status(State(state): State<Arc<AppState>>) -> Json<StatusResponse> {
    Json(StatusResponse {
        paused: state.is_paused(),
        heartbeat_alive: state.is_heartbeat_alive(),
        daily_pnl: state.daily_pnl_dec().to_string(),
        active_positions: state.positions.len(),
        active_orders: state.maker_orders.len(),
        active_markets: state.markets.len(),
        signals_generated: state.metrics.signals_generated.load(Ordering::Relaxed),
        orders_placed: state.metrics.orders_placed.load(Ordering::Relaxed),
        orders_filled: state.metrics.orders_filled.load(Ordering::Relaxed),
        adverse_fills: state.metrics.adverse_fills.load(Ordering::Relaxed),
        ws_reconnects: state.metrics.ws_reconnects.load(Ordering::Relaxed),
    })
}

async fn positions(State(state): State<Arc<AppState>>) -> Json<serde_json::Value> {
    let positions: Vec<_> = state
        .positions
        .iter()
        .map(|entry| {
            let p = entry.value();
            serde_json::json!({
                "condition_id": p.condition_id.0,
                "side": p.side,
                "size": p.size.to_string(),
                "entry_price": p.entry_price.to_string(),
                "opened_at": p.opened_at.to_rfc3339(),
            })
        })
        .collect();

    Json(serde_json::json!({ "positions": positions }))
}

async fn trades(State(state): State<Arc<AppState>>) -> Json<serde_json::Value> {
    let trades = state.trades.read();
    let recent: Vec<_> = trades
        .iter()
        .rev()
        .take(50)
        .map(|t| {
            serde_json::json!({
                "condition_id": t.condition_id.0,
                "side": t.side,
                "price": t.price.to_string(),
                "size": t.size.to_string(),
                "pnl": t.pnl.map(|p| p.to_string()),
                "is_adverse": t.is_adverse,
                "timestamp": t.timestamp.to_rfc3339(),
            })
        })
        .collect();

    Json(serde_json::json!({ "trades": recent }))
}

async fn db_stats(State(state): State<Arc<AppState>>) -> Json<serde_json::Value> {
    match state.db.as_ref() {
        Some(db) => {
            let trade_count = db.trade_count().unwrap_or(0);
            let has_config = db.load_config().ok().flatten().is_some();
            let has_checkpoint = db.load_balance_checkpoint().ok().flatten().is_some();
            Json(serde_json::json!({
                "enabled": true,
                "trade_count": trade_count,
                "has_saved_config": has_config,
                "has_balance_checkpoint": has_checkpoint,
            }))
        }
        None => Json(serde_json::json!({
            "enabled": false,
        })),
    }
}
async fn pause(State(state): State<Arc<AppState>>) -> Json<serde_json::Value> {
    state.paused.store(true, Ordering::Relaxed);
    tracing::info!("Bot PAUSED via API");
    Json(serde_json::json!({ "status": "paused" }))
}

async fn resume(State(state): State<Arc<AppState>>) -> Json<serde_json::Value> {
    state.paused.store(false, Ordering::Relaxed);
    tracing::info!("Bot RESUMED via API");
    Json(serde_json::json!({ "status": "resumed" }))
}

async fn kill(State(state): State<Arc<AppState>>) -> Json<serde_json::Value> {
    // 1. Pause the bot immediately
    state.paused.store(true, Ordering::Relaxed);

    // 2. Cancel all tracked maker orders
    let order_ids: Vec<String> = state
        .maker_orders
        .iter()
        .map(|entry| entry.key().clone())
        .collect();
    let cancelled = order_ids.len();
    for id in &order_ids {
        state.maker_orders.remove(id);
        state
            .metrics
            .orders_cancelled
            .fetch_add(1, Ordering::Relaxed);
    }

    tracing::warn!(cancelled, "KILL SWITCH activated via API");
    Json(serde_json::json!({
        "status": "killed",
        "orders_cancelled": cancelled
    }))
}

// ── Config GET / PUT ──

async fn get_config(State(state): State<Arc<AppState>>) -> Json<RuntimeConfig> {
    let cfg = state.runtime_config.read().clone();
    Json(cfg)
}

#[derive(Deserialize)]
struct ConfigUpdate {
    #[serde(default)]
    min_edge: Option<String>,
    #[serde(default)]
    min_prob: Option<String>,
    #[serde(default)]
    max_prob: Option<String>,
    #[serde(default)]
    max_spread: Option<String>,
    #[serde(default)]
    order_strategy: Option<String>,
    #[serde(default)]
    market_refresh_secs: Option<u64>,
    #[serde(default)]
    daily_loss_limit: Option<String>,
    #[serde(default)]
    daily_profit_cap: Option<String>,
    #[serde(default)]
    max_position_pct: Option<String>,
    #[serde(default)]
    max_concurrent: Option<usize>,
    #[serde(default)]
    drawdown_limit: Option<String>,
    #[serde(default)]
    adverse_fill_pause: Option<u32>,
}

async fn update_config(
    State(state): State<Arc<AppState>>,
    Json(update): Json<ConfigUpdate>,
) -> Json<serde_json::Value> {
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
                        return Json(serde_json::json!({
                            "error": format!("Invalid value for {}: {}", $name, val)
                        }));
                    }
                }
            }
        };
        ($field:ident, $name:expr, $min:expr, $max:expr) => {
            if let Some(ref val) = update.$field {
                match rust_decimal::Decimal::from_str(val) {
                    Ok(d) => {
                        let min_d: rust_decimal::Decimal = $min;
                        let max_d: rust_decimal::Decimal = $max;
                        if d < min_d || d > max_d {
                            return Json(serde_json::json!({
                                "error": format!("{} must be between {} and {}, got {}", $name, min_d, max_d, d)
                            }));
                        }
                        cfg.$field = d;
                        changes.push(format!("{}: {}", $name, d));
                    }
                    Err(_) => {
                        return Json(serde_json::json!({
                            "error": format!("Invalid value for {}: {}", $name, val)
                        }));
                    }
                }
            }
        };
    }

    update_decimal!(min_edge, "min_edge", dec!(0.001), dec!(0.50));
    update_decimal!(min_prob, "min_prob", dec!(0.01), dec!(0.99));
    update_decimal!(max_prob, "max_prob", dec!(0.01), dec!(0.99));
    update_decimal!(max_spread, "max_spread", dec!(0.001), dec!(0.50));
    update_decimal!(daily_loss_limit, "daily_loss_limit");
    update_decimal!(daily_profit_cap, "daily_profit_cap");
    update_decimal!(max_position_pct, "max_position_pct", dec!(0.001), dec!(1.0));
    update_decimal!(drawdown_limit, "drawdown_limit", dec!(0.01), dec!(1.0));

    if let Some(ref strategy) = update.order_strategy {
        match strategy.as_str() {
            "Passive" => { cfg.order_strategy = pp_core::OrderStrategy::Passive; changes.push(format!("order_strategy: Passive")); }
            "Balanced" => { cfg.order_strategy = pp_core::OrderStrategy::Balanced; changes.push(format!("order_strategy: Balanced")); }
            "Aggressive" => { cfg.order_strategy = pp_core::OrderStrategy::Aggressive; changes.push(format!("order_strategy: Aggressive")); }
            _ => {
                return Json(serde_json::json!({
                    "error": format!("Invalid order_strategy: {}. Use: Passive, Balanced, Aggressive", strategy)
                }));
            }
        }
    }

    if let Some(secs) = update.market_refresh_secs {
        if secs == 0 {
            return Json(serde_json::json!({ "error": "market_refresh_secs must be > 0" }));
        }
        cfg.market_refresh_secs = secs;
        changes.push(format!("market_refresh_secs: {}", secs));
    }

    if let Some(mc) = update.max_concurrent {
        if mc == 0 {
            return Json(serde_json::json!({ "error": "max_concurrent must be > 0" }));
        }
        cfg.max_concurrent = mc;
        changes.push(format!("max_concurrent: {}", mc));
    }

    if let Some(afp) = update.adverse_fill_pause {
        cfg.adverse_fill_pause = afp;
        changes.push(format!("adverse_fill_pause: {}", afp));
    }

    // Cross-field validation: min_prob must be < max_prob
    if cfg.min_prob >= cfg.max_prob {
        return Json(serde_json::json!({
            "error": format!("min_prob ({}) must be less than max_prob ({})", cfg.min_prob, cfg.max_prob)
        }));
    }

    // market_refresh_secs minimum floor
    if cfg.market_refresh_secs < 10 {
        return Json(serde_json::json!({
            "error": "market_refresh_secs must be >= 10"
        }));
    }

    tracing::info!(changes = ?changes, "Config updated via API");

    // Persist config to DB so it survives restart
    if let Some(ref db) = state.db {
        if let Err(e) = db.save_config(&cfg) {
            tracing::warn!(error = %e, "Failed to persist config to DB");
        }
    }

    Json(serde_json::json!({
        "status": "updated",
        "changes": changes,
        "config": *cfg
    }))
}
