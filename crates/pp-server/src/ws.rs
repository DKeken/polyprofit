use std::collections::HashMap;
use std::sync::atomic::Ordering;
use std::sync::Arc;

use axum::extract::ws::{Message, WebSocket};
use axum::extract::{State, WebSocketUpgrade};
use axum::response::IntoResponse;
use futures::{SinkExt, StreamExt};
use rust_decimal::Decimal;
use tracing::{debug, warn};
use ts_rs::TS;

use pp_core::{AppState, ConditionId};

/// Maximum display length for market question text (chars).
const QUESTION_DISPLAY_LEN: usize = 40;

/// Number of recent trades to include in each WS tick.
const RECENT_TRADES_LIMIT: usize = 10;

pub async fn ws_handler(
    ws: WebSocketUpgrade,
    State(state): State<Arc<AppState>>,
) -> impl IntoResponse {
    ws.on_upgrade(move |socket| handle_socket(socket, state))
}

async fn handle_socket(socket: WebSocket, state: Arc<AppState>) {
    debug!("WebSocket client connected");

    let (mut sender, mut receiver) = socket.split();
    let mut interval = tokio::time::interval(std::time::Duration::from_secs(1));
    let mut ping_counter: u64 = 0;

    loop {
        tokio::select! {
            msg = receiver.next() => {
                match msg {
                    Some(Ok(Message::Ping(data))) => {
                        if sender.send(Message::Pong(data)).await.is_err() {
                            debug!("WebSocket client disconnected (pong failed)");
                            break;
                        }
                    }
                    Some(Ok(Message::Pong(_))) => {}
                    Some(Ok(Message::Close(_))) => {
                        debug!("WebSocket client disconnected (close frame)");
                        break;
                    }
                    Some(Ok(Message::Text(_))) | Some(Ok(Message::Binary(_))) => {}
                    Some(Err(e)) => {
                        debug!("WebSocket client disconnected (receive error): {e}");
                        break;
                    }
                    None => {
                        debug!("WebSocket client disconnected (stream ended)");
                        break;
                    }
                }
            }
            _ = interval.tick() => {
                ping_counter += 1;

                // Send a ping every 30s to detect dead connections
                if ping_counter % 30 == 0 {
                    if sender.send(Message::Ping(vec![].into())).await.is_err() {
                        debug!("WebSocket client disconnected (ping failed)");
                        break;
                    }
                }

                let tick = build_tick(&state);
                let json = match serde_json::to_string(&tick) {
                    Ok(j) => j,
                    Err(e) => {
                        warn!("WS serialize error: {e}");
                        continue;
                    }
                };

                if sender.send(Message::Text(json.into())).await.is_err() {
                    debug!("WebSocket client disconnected");
                    break;
                }
            }
        }
    }
}

// ── DTO Structs ──────────────────────────────────────────────────────────────

#[derive(serde::Serialize, TS)]
#[ts(export)]
struct PriceInfo {
    binance: String,
    chainlink: String,
    #[ts(type = "number")]
    lag_secs: i64,
}

#[derive(serde::Serialize, TS)]
#[ts(export)]
struct AssetDefInfo {
    symbol: String,
    binance_symbol: String,
    keywords: Vec<String>,
}

#[derive(serde::Serialize, TS)]
#[ts(export)]
struct ConfigSnapshot {
    min_edge: String,
    min_prob: String,
    max_prob: String,
    max_spread: String,
    order_strategy: String,
    #[ts(type = "number")]
    market_refresh_secs: u64,
    daily_loss_limit: String,
    daily_profit_cap: String,
    max_position_pct: String,
    max_concurrent: usize,
    drawdown_limit: String,
    adverse_fill_pause: u32,
    assets: Vec<String>,
    /// All defined assets from registry (superset of active assets).
    known_assets: Vec<String>,
    /// Full asset definitions — frontend Settings UI uses this for CRUD.
    asset_definitions: Vec<AssetDefInfo>,
}

#[derive(serde::Serialize, TS)]
#[ts(export)]
struct TradeInfo {
    side: String,
    price: String,
    size: String,
    pnl: Option<String>,
    adverse: bool,
    ts: String,
    market: String,
}

#[derive(serde::Serialize, TS)]
#[ts(export)]
struct PositionInfo {
    condition_id: String,
    side: String,
    size: String,
    entry_price: String,
    market: String,
    #[ts(type = "number")]
    age_secs: i64,
}

#[derive(serde::Serialize, TS)]
#[ts(export)]
struct Tick {
    daily_pnl: String,
    total_pnl: String,
    paused: bool,
    heartbeat_alive: bool,
    positions: usize,
    orders: usize,
    markets: usize,
    #[ts(type = "number")]
    signals: u64,
    #[ts(type = "number")]
    fills: u64,
    #[ts(type = "number")]
    adverse: u64,
    #[ts(type = "number")]
    reconnects: u64,
    trades: Vec<TradeInfo>,
    balance: String,
    win_rate: f64,
    #[ts(type = "number")]
    total_trades: u64,
    #[ts(type = "number")]
    orders_placed: u64,
    #[ts(type = "number")]
    orders_cancelled: u64,
    prices: HashMap<String, PriceInfo>,
    config: ConfigSnapshot,
    drawdown_pct: f64,
    #[ts(type = "number")]
    uptime_secs: u64,
    open_positions: Vec<PositionInfo>,
}

// ── Helpers ──────────────────────────────────────────────────────────────────

/// Truncate a market question for display. Adds "…" if the question exceeds
/// QUESTION_DISPLAY_LEN characters.
fn truncate_question(question: &str) -> String {
    if question.chars().count() > QUESTION_DISPLAY_LEN {
        let truncated: String = question.chars().take(QUESTION_DISPLAY_LEN - 1).collect();
        format!("{truncated}…")
    } else {
        question.to_string()
    }
}

/// Look up a market question by condition_id and return a truncated display name.
fn market_display_name(state: &AppState, condition_id: &ConditionId) -> String {
    state
        .markets
        .get(condition_id)
        .map(|m| truncate_question(&m.question))
        .unwrap_or_default()
}

/// Calculate drawdown percentage: (peak - current) / peak.
fn drawdown_pct(state: &AppState) -> f64 {
    let peak = state.peak_balance.load(Ordering::Relaxed);
    if peak > 0 {
        let cur = state.current_balance_cents();
        if cur < peak {
            (peak - cur) as f64 / peak as f64
        } else {
            0.0
        }
    } else {
        0.0
    }
}

/// Build per-asset price snapshot with oracle lag calculation.
fn build_prices(state: &AppState) -> HashMap<String, PriceInfo> {
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
    prices
}

/// Snapshot current RuntimeConfig for WS tick.
fn build_config_snapshot(state: &AppState) -> ConfigSnapshot {
    let rc = state.runtime_config.read();
    ConfigSnapshot {
        min_edge: rc.min_edge.to_string(),
        min_prob: rc.min_prob.to_string(),
        max_prob: rc.max_prob.to_string(),
        max_spread: rc.max_spread.to_string(),
        order_strategy: format!("{:?}", rc.order_strategy),
        market_refresh_secs: rc.market_refresh_secs,
        daily_loss_limit: rc.daily_loss_limit.to_string(),
        daily_profit_cap: rc.daily_profit_cap.to_string(),
        max_position_pct: rc.max_position_pct.to_string(),
        max_concurrent: rc.max_concurrent,
        drawdown_limit: rc.drawdown_limit.to_string(),
        adverse_fill_pause: rc.adverse_fill_pause,
        assets: rc.assets.iter().map(|a| a.to_string()).collect(),
        known_assets: state.asset_registry.iter().map(|e| e.key().to_string()).collect(),
        asset_definitions: rc.asset_definitions.iter().map(|d| AssetDefInfo {
            symbol: d.symbol.clone(),
            binance_symbol: d.binance_symbol.clone(),
            keywords: d.keywords.clone(),
        }).collect(),
    }
}

/// Build open positions list for WS tick.
fn build_open_positions(state: &AppState) -> Vec<PositionInfo> {
    let now = chrono::Utc::now();
    state
        .positions
        .iter()
        .map(|entry| {
            let p = entry.value();
            PositionInfo {
                condition_id: p.condition_id.0.clone(),
                side: p.side.to_string(),
                size: p.size.to_string(),
                entry_price: p.entry_price.to_string(),
                market: market_display_name(state, &p.condition_id),
                age_secs: (now - p.opened_at).num_seconds(),
            }
        })
        .collect()
}

// ── Tick Builder ─────────────────────────────────────────────────────────────

fn build_tick(state: &Arc<AppState>) -> Tick {
    let trades = state.trades.read();

    // Compute win rate from realized trades (those with pnl set)
    let total_realized = trades.iter().filter(|t| t.pnl.is_some()).count() as u64;
    let wins = trades
        .iter()
        .filter(|t| t.pnl.map(|p| p > Decimal::ZERO).unwrap_or(false))
        .count() as f64;
    let win_rate = if total_realized > 0 {
        wins / total_realized as f64
    } else {
        0.0
    };

    let total_pnl = trades
        .iter()
        .filter_map(|t| t.pnl)
        .fold(Decimal::ZERO, |acc, pnl| acc + pnl)
        .to_string();

    // Recent trades for display
    let recent_trades: Vec<TradeInfo> = trades
        .iter()
        .rev()
        .take(RECENT_TRADES_LIMIT)
        .map(|t| TradeInfo {
            side: t.side.to_string(),
            price: t.price.to_string(),
            size: t.size.to_string(),
            pnl: t.pnl.map(|p| p.to_string()),
            adverse: t.is_adverse,
            ts: t.timestamp.to_rfc3339(),
            market: market_display_name(state, &t.condition_id),
        })
        .collect();

    drop(trades);

    // Balance formatted as dollars (cents → dollars)
    let balance_cents = state.current_balance_cents();
    let balance = format!("{:.2}", balance_cents as f64 / 100.0);

    Tick {
        daily_pnl: state.daily_pnl_dec().to_string(),
        total_pnl,
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
        prices: build_prices(state),
        config: build_config_snapshot(state),
        drawdown_pct: drawdown_pct(state),
        uptime_secs: state.started_at.elapsed().as_secs(),
        open_positions: build_open_positions(state),
    }
}
