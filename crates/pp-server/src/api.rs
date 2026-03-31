use std::sync::atomic::Ordering;
use std::sync::Arc;

use axum::extract::State;
use axum::routing::get;
use axum::{Json, Router};
use serde::Serialize;

use pp_core::AppState;

pub fn routes(_state: Arc<AppState>) -> Router<Arc<AppState>> {
    Router::new()
        .route("/status", get(status))
        .route("/positions", get(positions))
        .route("/trades", get(trades))
        .route("/pause", axum::routing::post(pause))
        .route("/resume", axum::routing::post(resume))
        .route("/kill", axum::routing::post(kill))
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
