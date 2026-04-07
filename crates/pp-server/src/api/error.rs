use axum::http::StatusCode;
use axum::Json;
use serde::Serialize;

#[derive(Serialize)]
pub struct ApiError {
    pub error: String,
}

pub fn bad_request(msg: impl Into<String>) -> (StatusCode, Json<ApiError>) {
    (
        StatusCode::BAD_REQUEST,
        Json(ApiError { error: msg.into() }),
    )
}

pub fn internal_error(msg: impl Into<String>) -> (StatusCode, Json<ApiError>) {
    (
        StatusCode::INTERNAL_SERVER_ERROR,
        Json(ApiError { error: msg.into() }),
    )
}
