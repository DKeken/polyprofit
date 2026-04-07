use std::sync::Arc;
use axum::extract::{Path, State};
use axum::http::StatusCode;
use axum::response::IntoResponse;
use axum::Json;
use pp_core::AppState;
use pp_whales::{profile_to_whale, DataApiClient};
use crate::api::dto::{
    WhalesResponse, WhaleRow, WhaleActivityResponse, WhaleEventRow,
    LookupRequest, TrackRequest,
};

pub async fn list_whales(State(state): State<Arc<AppState>>) -> Json<WhalesResponse> {
    let mut whales: Vec<WhaleRow> = state
        .whales
        .iter()
        .map(|e| {
            let w = e.value();
            WhaleRow {
                address: w.address.clone(),
                display_name: w.display_name.clone(),
                profit: w.profit.to_string(),
                roi: w.roi,
                win_rate: w.win_rate,
                volume: w.volume.to_string(),
                markets_traded: w.markets_traded,
                last_seen: w.last_seen.to_rfc3339(),
                followed: w.followed,
            }
        })
        .collect();
    whales.sort_by(|a, b| b.profit.partial_cmp(&a.profit).unwrap_or(std::cmp::Ordering::Equal));
    let total = whales.len();
    Json(WhalesResponse { whales, total })
}

pub async fn whale_activity(State(state): State<Arc<AppState>>) -> Json<WhaleActivityResponse> {
    let events = state
        .recent_whale_activity
        .read()
        .iter()
        .rev()
        .take(100)
        .map(|a| WhaleEventRow {
            address: a.address.clone(),
            condition_id: a.condition_id.clone(),
            side: a.side.clone(),
            amount: a.amount.to_string(),
            price: a.price.to_string(),
            timestamp: a.timestamp.to_rfc3339(),
            question: a.question.clone(),
            platform: a.platform.clone(),
        })
        .collect();
    Json(WhaleActivityResponse { events })
}

pub async fn trigger_whale_poll(State(state): State<Arc<AppState>>) -> impl IntoResponse {
    crate::api::jobs::start_whale_job(State(state)).await
}

pub async fn lookup_whale(
    State(_state): State<Arc<AppState>>,
    Json(body): Json<LookupRequest>,
) -> impl IntoResponse {
    let client = DataApiClient::new();
    match client.fetch_profile(&body.address).await {
        Ok(Some(profile)) => {
            let whale = profile_to_whale(body.address, &profile);
            (StatusCode::OK, Json(serde_json::json!({ "whale": whale }))).into_response()
        }
        Ok(None) => (
            StatusCode::NOT_FOUND,
            Json(serde_json::json!({ "error": "address not found on Polymarket" })),
        )
            .into_response(),
        Err(e) => {
            let msg = e.to_string();
            (StatusCode::BAD_GATEWAY, Json(serde_json::json!({ "error": msg }))).into_response()
        }
    }
}

pub async fn track_whale(
    State(state): State<Arc<AppState>>,
    Json(body): Json<TrackRequest>,
) -> impl IntoResponse {
    let client = DataApiClient::new();
    match client.fetch_profile(&body.address).await {
        Ok(Some(profile)) => {
            let mut whale = match profile_to_whale(body.address.clone(), &profile) {
                Some(w) => w,
                None => {
                    return (
                        StatusCode::UNPROCESSABLE_ENTITY,
                        Json(serde_json::json!({ "error": "could not parse profile" })),
                    )
                        .into_response()
                }
            };
            if let Some(name) = body.display_name {
                whale.display_name = Some(name);
            }
            state.whales.insert(body.address.clone(), whale.clone());
            (
                StatusCode::OK,
                Json(serde_json::json!({ "tracked": true, "address": body.address })),
            )
                .into_response()
        }
        Ok(None) => (
            StatusCode::NOT_FOUND,
            Json(serde_json::json!({ "error": "address not found on Polymarket" })),
        )
            .into_response(),
        Err(e) => {
            let msg = e.to_string();
            (StatusCode::BAD_GATEWAY, Json(serde_json::json!({ "error": msg }))).into_response()
        }
    }
}

pub async fn toggle_follow(
    State(state): State<Arc<AppState>>,
    Path(address): Path<String>,
) -> impl IntoResponse {
    if let Some(mut entry) = state.whales.get_mut(&address) {
        entry.followed = !entry.followed;
        let followed = entry.followed;
        drop(entry);
        (
            StatusCode::OK,
            Json(serde_json::json!({ "address": address, "followed": followed })),
        )
            .into_response()
    } else {
        (
            StatusCode::NOT_FOUND,
            Json(serde_json::json!({ "error": "whale not tracked" })),
        )
            .into_response()
    }
}

pub async fn untrack_whale(
    State(state): State<Arc<AppState>>,
    Path(address): Path<String>,
) -> impl IntoResponse {
    if state.whales.remove(&address).is_some() {
        (
            StatusCode::OK,
            Json(serde_json::json!({ "removed": true, "address": address })),
        )
            .into_response()
    } else {
        (
            StatusCode::NOT_FOUND,
            Json(serde_json::json!({ "error": "whale not tracked" })),
        )
            .into_response()
    }
}
