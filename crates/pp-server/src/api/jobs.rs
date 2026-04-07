use std::sync::Arc;
use axum::extract::State;
use axum::http::StatusCode;
use axum::response::IntoResponse;
use axum::Json;
use pp_core::AppState;
use pp_whales::DataApiClient;
use crate::api::dto::BasicResponse;

pub async fn start_whale_job(State(state): State<Arc<AppState>>) -> impl IntoResponse {
    let state_clone = state.clone();
    tokio::spawn(async move {
        let client = DataApiClient::new();
        let _ = pp_whales::run_poll_cycle(&client, &state_clone).await;
    });

    (
        StatusCode::ACCEPTED,
        Json(BasicResponse { status: "job_queued".into() }),
    ).into_response()
}
