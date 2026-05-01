use std::sync::atomic::Ordering;
use std::sync::Arc;

use axum::extract::State;
use axum::response::IntoResponse;
use axum::Json;

use pp_core::AppState;
use pp_wallet::WalletBackend;
use crate::api::dto::{StatusResponse, BasicResponse, KillResponse, WalletInfoResponse};
use crate::api::error::internal_error;

pub async fn status(State(state): State<Arc<AppState>>) -> Json<StatusResponse> {
    let authenticated = std::env::var("POLYMARKET_PRIVATE_KEY")
        .map(|s| !s.trim().is_empty())
        .unwrap_or(false);

    // Derive wallet address from the private key if available
    let wallet_address = pp_wallet::WalletSigner::from_env()
        .ok()
        .flatten()
        .map(|w| format!("{:#x}", w.address()));

    Json(StatusResponse {
        authenticated,
        wallet_address,
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

/// GET /api/wallet — fetch on-chain balances via Polygon RPC
pub async fn wallet_info() -> impl IntoResponse {
    let wallet = match pp_wallet::WalletSigner::from_env() {
        Ok(Some(w)) => w,
        _ => {
            return internal_error("No wallet configured".to_string()).into_response();
        }
    };

    let address = format!("{:#x}", wallet.address());

    let matic_balance = match pp_wallet::polygon::fetch_matic_balance(&address).await {
        Ok(b) => format!("{:.4}", b),
        Err(e) => {
            tracing::warn!("Failed to fetch MATIC balance: {e}");
            "0".to_string()
        }
    };
    let usdc_balance = match pp_wallet::polygon::fetch_usdc_balance(&address).await {
        Ok(b) => format!("{:.2}", b),
        Err(e) => {
            tracing::warn!("Failed to fetch USDC balance: {e}");
            "0".to_string()
        }
    };

    Json(WalletInfoResponse {
        address,
        matic_balance,
        usdc_balance,
    })
    .into_response()
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
