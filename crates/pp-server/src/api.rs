use std::collections::HashMap;
use std::sync::atomic::Ordering;
use std::sync::Arc;

use axum::extract::State;
use axum::http::{header, HeaderMap, HeaderValue, StatusCode};
use axum::response::IntoResponse;
use axum::routing::get;
use axum::{Json, Router};
use rust_decimal::Decimal;
use rust_decimal_macros::dec;
use serde::{Deserialize, Serialize};

use pp_core::{AppState, Asset, RuntimeConfig};

/// Standard API error response body.
#[derive(Serialize)]
struct ApiError {
    error: String,
}

/// Shorthand for returning a 400 Bad Request with a JSON error message.
fn bad_request(msg: impl Into<String>) -> (StatusCode, Json<ApiError>) {
    (
        StatusCode::BAD_REQUEST,
        Json(ApiError { error: msg.into() }),
    )
}

/// Shorthand for returning a 500 Internal Server Error with a JSON error message.
fn internal_error(msg: impl Into<String>) -> (StatusCode, Json<ApiError>) {
    (
        StatusCode::INTERNAL_SERVER_ERROR,
        Json(ApiError { error: msg.into() }),
    )
}

pub fn routes(_state: Arc<AppState>) -> Router<Arc<AppState>> {
    Router::new()
        .route("/status", get(status))
        .route("/positions", get(positions))
        .route("/trades", get(trades))
        .route("/markets", get(markets))
        .route("/markets/refresh", axum::routing::post(refresh_markets))
        .route("/db/stats", get(db_stats))
        .route("/pnl-history", get(pnl_history))
        .route("/analytics", get(analytics))
        .route("/trades/export", get(export_trades))
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

async fn markets(State(state): State<Arc<AppState>>) -> Json<serde_json::Value> {
    let markets: Vec<_> = state.markets.iter().map(|entry| {
        let m = entry.value();
        serde_json::json!({
            "condition_id": m.condition_id.0,
            "asset": m.asset,
            "kind": m.kind,
            "question": m.question,
            "strike": m.strike.map(|s| s.to_string()),
            "end_time": m.end_time.to_rfc3339(),
            "active": m.active,
        })
    }).collect();
    Json(serde_json::json!({ "markets": markets }))
}

async fn refresh_markets(State(state): State<Arc<AppState>>) -> (StatusCode, Json<serde_json::Value>) {
    let assets: Vec<Asset> = state
        .runtime_config
        .read()
        .asset_definitions
        .iter()
        .map(|a| Asset::new(&a.symbol))
        .collect();

    match pp_discovery::discover(&state, &assets).await {
        Ok(count) => {
            let now = chrono::Utc::now();
            state.markets.retain(|_, m| m.end_time > now && m.active);
            (StatusCode::OK, Json(serde_json::json!({ "count": count })))
        }
        Err(e) => (
            StatusCode::INTERNAL_SERVER_ERROR,
            Json(serde_json::json!({ "error": e.to_string() })),
        ),
    }
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

/// Return PnL history from persisted trades for the equity curve.
/// Returns [{time, pnl}] where pnl is cumulative realized PnL at each trade.
async fn pnl_history(State(state): State<Arc<AppState>>) -> Json<serde_json::Value> {
    let trades = state.trades.read();
    let mut cumulative = rust_decimal::Decimal::ZERO;
    let points: Vec<serde_json::Value> = trades
        .iter()
        .filter_map(|t| {
            let pnl = t.pnl?;
            cumulative += pnl;
            Some(serde_json::json!({
                "time": t.timestamp.format("%H:%M:%S").to_string(),
                "pnl": cumulative.to_string(),
            }))
        })
        .collect();

    Json(serde_json::json!({ "points": points }))
}

// ── Analytics ──

#[derive(Serialize)]
struct Analytics {
    total_trades: usize,
    winning_trades: usize,
    losing_trades: usize,
    pending_trades: usize,
    win_rate: f64,
    total_pnl: String,
    best_trade_pnl: Option<String>,
    worst_trade_pnl: Option<String>,
    avg_trade_pnl: Option<String>,
    avg_win: Option<String>,
    avg_loss: Option<String>,
    profit_factor: Option<f64>,
    by_asset: HashMap<String, AssetStats>,
}

#[derive(Serialize)]
struct AssetStats {
    trades: usize,
    wins: usize,
    losses: usize,
    total_pnl: String,
}

async fn analytics(State(state): State<Arc<AppState>>) -> Json<Analytics> {
    let trades = state.trades.read();

    let mut winning_trades: usize = 0;
    let mut losing_trades: usize = 0;
    let mut pending_trades: usize = 0;
    let mut total_pnl = Decimal::ZERO;
    let mut best_pnl: Option<Decimal> = None;
    let mut worst_pnl: Option<Decimal> = None;
    let mut sum_wins = Decimal::ZERO;
    let mut sum_losses = Decimal::ZERO;
    let mut by_asset: HashMap<String, (usize, usize, usize, Decimal)> = HashMap::new();

    for trade in trades.iter() {
        let asset = state
            .markets
            .get(&trade.condition_id)
            .map(|m| m.asset.to_string())
            .unwrap_or_else(|| "Unknown".to_string());

        let entry = by_asset.entry(asset).or_insert((0, 0, 0, Decimal::ZERO));
        entry.0 += 1; // trades

        match trade.pnl {
            Some(pnl) => {
                total_pnl += pnl;
                entry.3 += pnl;

                if pnl > Decimal::ZERO {
                    winning_trades += 1;
                    sum_wins += pnl;
                    entry.1 += 1;
                } else if pnl < Decimal::ZERO {
                    losing_trades += 1;
                    sum_losses += pnl; // negative
                    entry.2 += 1;
                }
                // pnl == 0 counts as neither win nor loss

                best_pnl = Some(best_pnl.map_or(pnl, |b: Decimal| b.max(pnl)));
                worst_pnl = Some(worst_pnl.map_or(pnl, |w: Decimal| w.min(pnl)));
            }
            None => {
                pending_trades += 1;
            }
        }
    }

    let total_trades = trades.len();
    let resolved = winning_trades + losing_trades;

    let win_rate = if resolved > 0 {
        winning_trades as f64 / resolved as f64
    } else {
        0.0
    };

    let avg_trade_pnl = if resolved > 0 {
        Some((total_pnl / Decimal::from(resolved as u64)).to_string())
    } else {
        None
    };

    let avg_win = if winning_trades > 0 {
        Some((sum_wins / Decimal::from(winning_trades as u64)).to_string())
    } else {
        None
    };

    let avg_loss = if losing_trades > 0 {
        Some((sum_losses / Decimal::from(losing_trades as u64)).to_string())
    } else {
        None
    };

    let profit_factor = if sum_losses < Decimal::ZERO {
        use rust_decimal::prelude::ToPrimitive;
        let wins_f = sum_wins.to_f64().unwrap_or(0.0);
        let losses_f = sum_losses.abs().to_f64().unwrap_or(0.0);
        if losses_f > 0.0 {
            Some(wins_f / losses_f)
        } else {
            None
        }
    } else {
        None
    };

    let by_asset_stats: HashMap<String, AssetStats> = by_asset
        .into_iter()
        .map(|(asset, (t, w, l, pnl))| {
            (
                asset,
                AssetStats {
                    trades: t,
                    wins: w,
                    losses: l,
                    total_pnl: pnl.to_string(),
                },
            )
        })
        .collect();

    Json(Analytics {
        total_trades,
        winning_trades,
        losing_trades,
        pending_trades,
        win_rate,
        total_pnl: total_pnl.to_string(),
        best_trade_pnl: best_pnl.map(|d| d.to_string()),
        worst_trade_pnl: worst_pnl.map(|d| d.to_string()),
        avg_trade_pnl,
        avg_win,
        avg_loss,
        profit_factor,
        by_asset: by_asset_stats,
    })
}

// ── CSV Export ──

async fn export_trades(State(state): State<Arc<AppState>>) -> (HeaderMap, String) {
    let mut headers = HeaderMap::new();
    headers.insert(header::CONTENT_TYPE, HeaderValue::from_static("text/csv"));
    headers.insert(
        header::CONTENT_DISPOSITION,
        HeaderValue::from_static("attachment; filename=\"polyprofit_trades.csv\""),
    );

    let trades = state.trades.read();
    let mut csv = String::from("timestamp,condition_id,asset,side,price,size,pnl,is_adverse\n");

    for trade in trades.iter() {
        let asset = state
            .markets
            .get(&trade.condition_id)
            .map(|m| m.asset.to_string())
            .unwrap_or_else(|| "Unknown".to_string());

        let pnl_str = trade
            .pnl
            .map(|p| p.to_string())
            .unwrap_or_default();

        csv.push_str(&format!(
            "{},{},{},{},{},{},{},{}\n",
            trade.timestamp.to_rfc3339(),
            trade.condition_id.0,
            asset,
            trade.side,
            trade.price,
            trade.size,
            pnl_str,
            trade.is_adverse,
        ));
    }

    (headers, csv)
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
struct AssetDefUpdate {
    symbol: String,
    binance_symbol: String,
    keywords: Vec<String>,
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
    #[serde(default)]
    assets: Option<Vec<String>>,
    /// Full asset definitions — add/edit/remove via frontend Settings UI.
    #[serde(default)]
    asset_definitions: Option<Vec<AssetDefUpdate>>,
}

async fn update_config(
    State(state): State<Arc<AppState>>,
    Json(update): Json<ConfigUpdate>,
) -> impl IntoResponse {
    use std::str::FromStr;

    let mut cfg = state.runtime_config.write();
    let mut changes: Vec<String> = Vec::new();

    // Helper macro: parse decimal field with optional range validation.
    // Returns HTTP 400 on parse failure or out-of-range.
    macro_rules! update_decimal {
        ($field:ident, $name:expr) => {
            if let Some(ref val) = update.$field {
                match rust_decimal::Decimal::from_str(val) {
                    Ok(d) => {
                        cfg.$field = d;
                        changes.push(format!("{}: {}", $name, d));
                    }
                    Err(_) => {
                        return bad_request(format!("Invalid value for {}: {}", $name, val)).into_response();
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
                            return bad_request(format!(
                                "{} must be between {} and {}, got {}", $name, min_d, max_d, d
                            )).into_response();
                        }
                        cfg.$field = d;
                        changes.push(format!("{}: {}", $name, d));
                    }
                    Err(_) => {
                        return bad_request(format!("Invalid value for {}: {}", $name, val)).into_response();
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
            "Passive" => { cfg.order_strategy = pp_core::OrderStrategy::Passive; changes.push("order_strategy: Passive".into()); }
            "Balanced" => { cfg.order_strategy = pp_core::OrderStrategy::Balanced; changes.push("order_strategy: Balanced".into()); }
            "Aggressive" => { cfg.order_strategy = pp_core::OrderStrategy::Aggressive; changes.push("order_strategy: Aggressive".into()); }
            _ => {
                return bad_request(format!(
                    "Invalid order_strategy: {}. Use: Passive, Balanced, Aggressive", strategy
                )).into_response();
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

    // Assets update — validate against asset registry
    if let Some(ref asset_list) = update.assets {
        if asset_list.is_empty() {
            return bad_request("assets list must not be empty").into_response();
        }
        let mut parsed = Vec::new();
        for name in asset_list {
            let asset = pp_core::Asset::new(name);
            // When asset_definitions is also being updated in the same request,
            // validate against the new definitions, not the current registry
            let is_valid = if let Some(ref new_defs) = update.asset_definitions {
                new_defs.iter().any(|d| d.symbol.to_uppercase() == name.to_uppercase())
            } else {
                state.asset_registry.contains_key(&asset)
            };
            if !is_valid {
                return bad_request(format!(
                    "Unknown asset: '{}'. Add it to Asset Definitions first.", name
                )).into_response();
            }
            parsed.push(asset);
        }
        cfg.assets = parsed;
        changes.push(format!("assets: {:?}", asset_list));
    }

    // Asset definitions update — full CRUD via frontend Settings UI
    if let Some(ref def_list) = update.asset_definitions {
        if def_list.is_empty() {
            return bad_request("asset_definitions must not be empty").into_response();
        }
        // Validate each definition
        for d in def_list {
            if d.symbol.trim().is_empty() {
                return bad_request("Asset symbol cannot be empty").into_response();
            }
            if d.binance_symbol.trim().is_empty() {
                return bad_request(format!(
                    "Binance symbol required for asset '{}'", d.symbol
                )).into_response();
            }
            if d.keywords.is_empty() {
                return bad_request(format!(
                    "At least one keyword required for asset '{}'", d.symbol
                )).into_response();
            }
        }
        // Check for duplicate symbols
        let mut seen = std::collections::HashSet::new();
        for d in def_list {
            let upper = d.symbol.to_uppercase();
            if !seen.insert(upper.clone()) {
                return bad_request(format!(
                    "Duplicate asset symbol: '{}'", d.symbol
                )).into_response();
            }
        }
        cfg.asset_definitions = def_list.iter().map(|d| pp_core::AssetMeta {
            symbol: d.symbol.trim().to_uppercase(),
            binance_symbol: d.binance_symbol.trim().to_uppercase(),
            keywords: d.keywords.iter().map(|k| k.trim().to_lowercase()).collect(),
        }).collect();
        changes.push(format!("asset_definitions: {} assets", def_list.len()));

        // Validate that all active assets still have a definition
        let defined_symbols: Vec<String> = cfg.asset_definitions.iter()
            .map(|d| d.symbol.clone())
            .collect();
        let invalid_active: Vec<String> = cfg.assets.iter()
            .filter(|a| !defined_symbols.contains(&a.0))
            .map(|a| a.0.clone())
            .collect();
        if !invalid_active.is_empty() {
            // Auto-remove active assets that no longer have definitions
            cfg.assets.retain(|a| defined_symbols.contains(&a.0));
            changes.push(format!("auto-removed orphaned active assets: {:?}", invalid_active));
        }
    }

    // Cross-field validation: min_prob must be < max_prob
    if cfg.min_prob >= cfg.max_prob {
        return bad_request(format!(
            "min_prob ({}) must be less than max_prob ({})", cfg.min_prob, cfg.max_prob
        )).into_response();
    }

    // market_refresh_secs minimum floor
    if cfg.market_refresh_secs < 10 {
        return bad_request("market_refresh_secs must be >= 10").into_response();
    }

    tracing::info!(changes = ?changes, "Config updated via API");

    // Persist config to DB so it survives restart
    if let Some(ref db) = state.db {
        if let Err(e) = db.save_config(&cfg) {
            tracing::error!(error = %e, "Failed to persist config to DB");
            return internal_error(format!("failed to persist config: {e}")).into_response();
        }
    }

    drop(cfg);

    // Rebuild asset registry from updated definitions so changes take effect immediately
    // (affects RTDS feed subscription, market discovery keyword matching, etc.)
    state.rebuild_asset_registry();

    let cfg = state.runtime_config.read();
    Json(serde_json::json!({
        "status": "updated",
        "changes": changes,
        "config": *cfg
    })).into_response()
}

#[cfg(test)]
mod tests {
    use super::*;
    use axum::Json;
    use axum::extract::State;
    use axum::response::IntoResponse;
    use pp_core::{AppState, Asset, BotDb};
    use serde_json::Value;
    use std::sync::Arc;

    fn temp_db() -> BotDb {
        use std::sync::atomic::{AtomicU64, Ordering};
        static COUNTER: AtomicU64 = AtomicU64::new(0);
        let id = COUNTER.fetch_add(1, Ordering::Relaxed);
        let dir = std::env::temp_dir().join(format!(
            "polyprofit_server_test_{}_{}_{}",
            std::process::id(),
            id,
            std::time::SystemTime::now()
                .duration_since(std::time::UNIX_EPOCH)
                .unwrap()
                .as_nanos()
        ));
        let path = dir.join("test.db");
        std::fs::create_dir_all(&dir).unwrap();
        BotDb::open(&path).unwrap()
    }

    fn state_with_db() -> Arc<AppState> {
        AppState::new_with_db(temp_db())
    }

    async fn response_json(response: axum::response::Response) -> Value {
        let status = response.status();
        let body = axum::body::to_bytes(response.into_body(), usize::MAX)
            .await
            .unwrap();
        let mut json: Value = serde_json::from_slice(&body).unwrap();
        if let Value::Object(ref mut map) = json {
            map.insert("_status".into(), Value::from(status.as_u16()));
        }
        json
    }

    #[tokio::test]
    async fn update_config_returns_validation_error_for_invalid_prob_range() {
        let state = state_with_db();

        let response = update_config(
            State(state),
            Json(ConfigUpdate {
                min_prob: Some("0.90".into()),
                max_prob: Some("0.10".into()),
                min_edge: None,
                max_spread: None,
                order_strategy: None,
                market_refresh_secs: None,
                daily_loss_limit: None,
                daily_profit_cap: None,
                max_position_pct: None,
                max_concurrent: None,
                drawdown_limit: None,
                adverse_fill_pause: None,
                assets: None,
                asset_definitions: None,
            }),
        )
        .await
        .into_response();

        let json = response_json(response).await;
        assert_eq!(json["_status"], 400);
        assert!(json["error"]
            .as_str()
            .unwrap()
            .contains("min_prob"));
    }

    #[tokio::test]
    async fn update_config_normalizes_definitions_and_removes_orphaned_assets() {
        let state = state_with_db();
        {
            let mut cfg = state.runtime_config.write();
            cfg.assets = vec![Asset::new("BTC"), Asset::new("ETH")];
            cfg.asset_definitions = vec![
                pp_core::AssetMeta {
                    symbol: "BTC".into(),
                    binance_symbol: "BTCUSDT".into(),
                    keywords: vec!["btc".into()],
                },
                pp_core::AssetMeta {
                    symbol: "ETH".into(),
                    binance_symbol: "ETHUSDT".into(),
                    keywords: vec!["eth".into()],
                },
            ];
        }
        state.rebuild_asset_registry();

        let response = update_config(
            State(state.clone()),
            Json(ConfigUpdate {
                min_edge: None,
                min_prob: None,
                max_prob: None,
                max_spread: None,
                order_strategy: None,
                market_refresh_secs: None,
                daily_loss_limit: None,
                daily_profit_cap: None,
                max_position_pct: None,
                max_concurrent: None,
                drawdown_limit: None,
                adverse_fill_pause: None,
                assets: None,
                asset_definitions: Some(vec![AssetDefUpdate {
                    symbol: " btc ".into(),
                    binance_symbol: "btcusdt".into(),
                    keywords: vec![" Bitcoin ".into(), "btc".into()],
                }]),
            }),
        )
        .await
        .into_response();

        let json = response_json(response).await;
        assert_eq!(json["_status"], 200);
        assert_eq!(json["config"]["asset_definitions"][0]["symbol"], "BTC");
        assert_eq!(json["config"]["assets"], serde_json::json!(["BTC"]));
        assert!(json["changes"]
            .as_array()
            .unwrap()
            .iter()
            .any(|item| item.as_str().unwrap().contains("auto-removed orphaned active assets")));
    }

    #[tokio::test]
    async fn update_config_persists_and_rebuilds_registry() {
        let state = state_with_db();

        let response = update_config(
            State(state.clone()),
            Json(ConfigUpdate {
                min_edge: Some("0.07".into()),
                min_prob: None,
                max_prob: None,
                max_spread: None,
                order_strategy: None,
                market_refresh_secs: None,
                daily_loss_limit: None,
                daily_profit_cap: None,
                max_position_pct: None,
                max_concurrent: None,
                drawdown_limit: None,
                adverse_fill_pause: None,
                assets: Some(vec!["BTC".into()]),
                asset_definitions: Some(vec![AssetDefUpdate {
                    symbol: "BTC".into(),
                    binance_symbol: "BTCUSDT".into(),
                    keywords: vec!["btc".into()],
                }]),
            }),
        )
        .await
        .into_response();

        let json = response_json(response).await;
        assert_eq!(json["_status"], 200);
        assert!(state.asset_registry.contains_key(&Asset::new("BTC")));

        let saved = state
            .db
            .as_ref()
            .unwrap()
            .load_config()
            .unwrap()
            .unwrap();
        assert_eq!(saved.min_edge.to_string(), "0.07");
        assert_eq!(saved.assets, vec![Asset::new("BTC")]);
        assert_eq!(saved.asset_definitions.len(), 1);
    }
}
