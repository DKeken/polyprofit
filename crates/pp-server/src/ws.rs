use std::collections::HashMap;
use std::sync::atomic::Ordering;
use std::sync::Arc;

use axum::extract::ws::{Message, WebSocket};
use axum::extract::{State, WebSocketUpgrade};
use axum::response::IntoResponse;
use rust_decimal::Decimal;
use tracing::{debug, warn};

use pp_core::{AppState, Mode};

pub async fn ws_handler(
    ws: WebSocketUpgrade,
    State(state): State<Arc<AppState>>,
) -> impl IntoResponse {
    ws.on_upgrade(move |socket| handle_socket(socket, state))
}

async fn handle_socket(mut socket: WebSocket, state: Arc<AppState>) {
    debug!("WebSocket client connected");

    loop {
        tokio::time::sleep(std::time::Duration::from_secs(1)).await;

        let tick = build_tick(&state);
        let json = match serde_json::to_string(&tick) {
            Ok(j) => j,
            Err(e) => {
                warn!("WS serialize error: {e}");
                continue;
            }
        };

        if socket.send(Message::Text(json.into())).await.is_err() {
            debug!("WebSocket client disconnected");
            break;
        }
    }
}

#[derive(serde::Serialize)]
struct PriceInfo {
    binance: String,
    chainlink: String,
    lag_secs: i64,
}

#[derive(serde::Serialize)]
struct Tick {
    // Existing fields
    daily_pnl: String,
    paused: bool,
    heartbeat_alive: bool,
    positions: usize,
    orders: usize,
    markets: usize,
    signals: u64,
    fills: u64,
    adverse: u64,
    reconnects: u64,
    trades: Vec<serde_json::Value>,

    // New fields
    balance: String,
    win_rate: f64,
    total_trades: u64,
    orders_placed: u64,
    orders_cancelled: u64,
    mode: String,
    prices: HashMap<String, PriceInfo>,
}

fn build_tick(state: &Arc<AppState>) -> Tick {
    let trades = state.trades.read();

    // Compute win rate from realized trades (those with pnl set)
    let realized: Vec<_> = trades.iter().filter(|t| t.pnl.is_some()).collect();
    let total_realized = realized.len() as u64;
    let wins = realized
        .iter()
        .filter(|t| t.pnl.map(|p| p > Decimal::ZERO).unwrap_or(false))
        .count() as f64;
    let win_rate = if total_realized > 0 {
        wins / total_realized as f64
    } else {
        0.0
    };

    // Recent 10 trades for display
    let recent_trades: Vec<_> = trades
        .iter()
        .rev()
        .take(10)
        .map(|t| {
            let market_name = state
                .markets
                .get(&t.condition_id)
                .map(|m| {
                    let q = &m.question;
                    if q.len() > 40 {
                        format!("{}…", &q[..39])
                    } else {
                        q.clone()
                    }
                })
                .unwrap_or_default();

            serde_json::json!({
                "side": t.side,
                "price": t.price.to_string(),
                "size": t.size.to_string(),
                "pnl": t.pnl.map(|p| p.to_string()),
                "adverse": t.is_adverse,
                "ts": t.timestamp.to_rfc3339(),
                "market": market_name,
            })
        })
        .collect();

    drop(trades);

    // Balance formatted as dollars (cents → dollars)
    let balance_cents = state.current_balance_cents();
    let balance = format!("{:.2}", balance_cents as f64 / 100.0);

    // Per-asset prices with oracle lag calculation
    let now_ts = chrono::Utc::now().timestamp();
    let mut prices = HashMap::new();
    for entry in state.prices.iter() {
        let asset = entry.key();
        let ps = entry.value();
        let lag_secs = if ps.chainlink_ts > 0 {
            now_ts - ps.chainlink_ts
        } else {
            -1 // no data yet
        };
        prices.insert(
            asset.to_string(),
            PriceInfo {
                binance: ps.binance.to_string(),
                chainlink: ps.chainlink.to_string(),
                lag_secs,
            },
        );
    }

    let mode_str = match state.mode {
        Mode::Demo => "Demo",
        Mode::Live => "Live",
    };

    Tick {
        daily_pnl: state.daily_pnl_dec().to_string(),
        paused: state.is_paused(),
        heartbeat_alive: state.is_heartbeat_alive(),
        positions: state.positions.len(),
        orders: state.maker_orders.len(),
        markets: state.markets.len(),
        signals: state.metrics.signals_generated.load(Ordering::Relaxed),
        fills: state.metrics.orders_filled.load(Ordering::Relaxed),
        adverse: state.metrics.adverse_fills.load(Ordering::Relaxed),
        reconnects: state.metrics.ws_reconnects.load(Ordering::Relaxed),
        trades: recent_trades,
        balance,
        win_rate,
        total_trades: total_realized,
        orders_placed: state.metrics.orders_placed.load(Ordering::Relaxed),
        orders_cancelled: state.metrics.orders_cancelled.load(Ordering::Relaxed),
        mode: mode_str.to_string(),
        prices,
    }
}
