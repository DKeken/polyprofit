use std::collections::HashMap;
use std::sync::Arc;

use axum::extract::State;
use axum::http::{header, HeaderMap, HeaderValue, StatusCode};
use axum::Json;
use rust_decimal::Decimal;

use pp_core::{AppState, Asset};

use crate::api::dto::{
    PositionsResponse, PositionDto, TradesResponse, TradeDto,
    MarketsResponse, MarketDto, DbStatsResponse,
    PnlHistoryResponse, PnlPointDto, Analytics, AssetStats,
};

pub async fn positions(State(state): State<Arc<AppState>>) -> Json<PositionsResponse> {
    let positions: Vec<PositionDto> = state
        .positions
        .iter()
        .map(|entry| {
            let p = entry.value();
            PositionDto {
                condition_id: p.condition_id.0.clone(),
                side: p.side.to_string(),
                size: p.size.to_string(),
                entry_price: p.entry_price.to_string(),
                opened_at: p.opened_at.to_rfc3339(),
            }
        })
        .collect();

    Json(PositionsResponse { positions })
}

pub async fn trades(State(state): State<Arc<AppState>>) -> Json<TradesResponse> {
    let trades = state.trades.read();
    let recent: Vec<TradeDto> = trades
        .iter()
        .rev()
        .take(50)
        .map(|t| {
            TradeDto {
                condition_id: t.condition_id.0.clone(),
                side: t.side.to_string(),
                price: t.price.to_string(),
                size: t.size.to_string(),
                pnl: t.pnl.map(|p| p.to_string()),
                is_adverse: t.is_adverse,
                timestamp: t.timestamp.to_rfc3339(),
            }
        })
        .collect();

    Json(TradesResponse { trades: recent })
}

pub async fn markets(State(state): State<Arc<AppState>>) -> Json<MarketsResponse> {
    let markets: Vec<MarketDto> = state.markets.iter().map(|entry| {
        let m = entry.value();
        MarketDto {
            condition_id: m.condition_id.0.clone(),
            asset: m.asset.to_string(),
            kind: format!("{:?}", m.kind),
            question: m.question.clone(),
            strike: m.strike.map(|s| s.to_string()),
            end_time: m.end_time.to_rfc3339(),
            active: m.active,
        }
    }).collect();
    Json(MarketsResponse { markets })
}

pub async fn refresh_markets(State(state): State<Arc<AppState>>) -> (StatusCode, Json<serde_json::Value>) {
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

pub async fn db_stats(State(state): State<Arc<AppState>>) -> Json<DbStatsResponse> {
    match state.db.as_ref() {
        Some(db) => {
            let trade_count = db.trade_count().unwrap_or(0);
            let has_config = db.load_config().ok().flatten().is_some();
            let has_checkpoint = db.load_balance_checkpoint().ok().flatten().is_some();
            Json(DbStatsResponse {
                enabled: true,
                trade_count: Some(trade_count as usize),
                has_saved_config: Some(has_config),
                has_balance_checkpoint: Some(has_checkpoint),
            })
        }
        None => Json(DbStatsResponse {
            enabled: false,
            trade_count: None,
            has_saved_config: None,
            has_balance_checkpoint: None,
        }),
    }
}

pub async fn pnl_history(State(state): State<Arc<AppState>>) -> Json<PnlHistoryResponse> {
    let trades = state.trades.read();
    let mut cumulative = rust_decimal::Decimal::ZERO;
    let points: Vec<PnlPointDto> = trades
        .iter()
        .filter_map(|t| {
            let pnl = t.pnl?;
            cumulative += pnl;
            Some(PnlPointDto {
                time: t.timestamp.format("%H:%M:%S").to_string(),
                pnl: cumulative.to_string(),
            })
        })
        .collect();

    Json(PnlHistoryResponse { points })
}

pub async fn analytics(State(state): State<Arc<AppState>>) -> Json<Analytics> {
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
        entry.0 += 1;

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
                    sum_losses += pnl;
                    entry.2 += 1;
                }

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

pub async fn export_trades(State(state): State<Arc<AppState>>) -> (HeaderMap, String) {
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
