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

    // Fetch MATIC balance via eth_getBalance
    let matic_balance = match fetch_matic_balance(&address).await {
        Ok(b) => b,
        Err(e) => {
            tracing::warn!("Failed to fetch MATIC balance: {e}");
            "0".to_string()
        }
    };

    // Fetch USDC balance via ERC-20 balanceOf
    let usdc_balance = match fetch_usdc_balance(&address).await {
        Ok(b) => b,
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

// ── On-chain balance helpers ──

const POLYGON_RPC: &str = "https://polygon.drpc.org";
/// USDC.e on Polygon (bridged) — used by Polymarket as collateral — 6 decimals
const USDC_E_ADDRESS: &str = "0x2791Bca1f2de4661ED88A30C99A7a9449Aa84174";
/// Native USDC on Polygon — 6 decimals
const USDC_NATIVE_ADDRESS: &str = "0x3c499c542cEF5E3811e1192ce70d8cC03d5c3359";

/// Fetch native MATIC (POL) balance via eth_getBalance
async fn fetch_matic_balance(address: &str) -> anyhow::Result<String> {
    let client = reqwest::Client::new();
    let body = serde_json::json!({
        "jsonrpc": "2.0",
        "method": "eth_getBalance",
        "params": [address, "latest"],
        "id": 1
    });

    let resp: serde_json::Value = client
        .post(POLYGON_RPC)
        .json(&body)
        .send()
        .await?
        .json()
        .await?;

    let hex = resp["result"]
        .as_str()
        .ok_or_else(|| anyhow::anyhow!("no result in eth_getBalance response"))?;

    let wei = u128::from_str_radix(hex.trim_start_matches("0x"), 16)?;
    let matic = wei as f64 / 1e18;
    Ok(format!("{:.4}", matic))
}

/// Fetch ERC-20 balance via balanceOf call
async fn fetch_erc20_balance(token_address: &str, wallet: &str, decimals: u32) -> anyhow::Result<f64> {
    let client = reqwest::Client::new();
    let addr_clean = wallet.trim_start_matches("0x");
    let data = format!("0x70a08231{:0>64}", addr_clean);

    let body = serde_json::json!({
        "jsonrpc": "2.0",
        "method": "eth_call",
        "params": [{
            "to": token_address,
            "data": data
        }, "latest"],
        "id": 1
    });

    let resp: serde_json::Value = client
        .post(POLYGON_RPC)
        .json(&body)
        .send()
        .await?
        .json()
        .await?;

    let hex = resp["result"]
        .as_str()
        .ok_or_else(|| anyhow::anyhow!("no result in eth_call response"))?;

    let raw = u128::from_str_radix(hex.trim_start_matches("0x"), 16).unwrap_or(0);
    Ok(raw as f64 / 10f64.powi(decimals as i32))
}

/// Fetch combined USDC balance (USDC.e + native USDC)
async fn fetch_usdc_balance(address: &str) -> anyhow::Result<String> {
    let (bridged, native) = tokio::join!(
        fetch_erc20_balance(USDC_E_ADDRESS, address, 6),
        fetch_erc20_balance(USDC_NATIVE_ADDRESS, address, 6),
    );
    let total = bridged.unwrap_or(0.0) + native.unwrap_or(0.0);
    Ok(format!("{:.2}", total))
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
