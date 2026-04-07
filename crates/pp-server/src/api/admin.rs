use std::sync::atomic::Ordering;
use std::sync::Arc;

use axum::extract::State;
use axum::Json;

use pp_core::AppState;
use crate::api::dto::{StatusResponse, BasicResponse, KillResponse};

pub async fn status(State(state): State<Arc<AppState>>) -> Json<StatusResponse> {
    let authenticated = std::env::var("POLYMARKET_PRIVATE_KEY")
        .map(|s| !s.trim().is_empty())
        .unwrap_or(false);

    Json(StatusResponse {
        authenticated,
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

pub async fn pause(State(state): State<Arc<AppState>>) -> Json<BasicResponse> {
    state.paused.store(true, Ordering::Relaxed);
    tracing::info!("Bot PAUSED via API");
    Json(BasicResponse { status: "paused".into() })
}

pub async fn resume(State(state): State<Arc<AppState>>) -> Json<BasicResponse> {
    state.paused.store(false, Ordering::Relaxed);
    tracing::info!("Bot RESUMED via API");
    Json(BasicResponse { status: "resumed".into() })
}

pub async fn kill(State(state): State<Arc<AppState>>) -> Json<KillResponse> {
    state.paused.store(true, Ordering::Relaxed);

    let order_ids: Vec<String> = state
        .maker_orders
        .iter()
        .map(|entry| entry.key().clone())
        .collect();
    let queued = order_ids.len();
    for id in &order_ids {
        state.cancel_queue.insert(id.clone(), ());
        state.maker_orders.remove(id);
    }

    tracing::warn!(queued, "KILL SWITCH activated — orders queued for CLOB cancellation");
    Json(KillResponse {
        status: "killed".into(),
        orders_queued_for_cancel: queued
    })
}
