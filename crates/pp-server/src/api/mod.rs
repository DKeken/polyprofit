pub mod admin;
pub mod auth;
pub mod config;
pub mod dto;
pub mod error;
pub mod jobs;
pub mod trading;
pub mod whales;

use std::sync::Arc;
use axum::routing::get;
use axum::Router;
use pp_core::AppState;

pub fn routes(_state: Arc<AppState>) -> Router<Arc<AppState>> {
    Router::new()
        .route("/status", get(admin::status))
        .route("/wallet", get(admin::wallet_info))
        .route("/positions", get(trading::positions))
        .route("/trades", get(trading::trades))
        .route("/markets", get(trading::markets))
        .route("/markets/refresh", axum::routing::post(trading::refresh_markets))
        .route("/db/stats", get(trading::db_stats))
        .route("/pnl-history", get(trading::pnl_history))
        .route("/analytics", get(trading::analytics))
        .route("/trades/export", get(trading::export_trades))
        .route("/pause", axum::routing::post(admin::pause))
        .route("/resume", axum::routing::post(admin::resume))
        .route("/kill", axum::routing::post(admin::kill))
        .route("/config", get(config::get_config).put(config::update_config))
        .route("/whales", get(whales::list_whales))
        .route("/whales/activity", get(whales::whale_activity))
        .route("/whales/poll", axum::routing::post(whales::trigger_whale_poll))
        .route("/whales/lookup", axum::routing::post(whales::lookup_whale))
        .route("/whales/track", axum::routing::post(whales::track_whale))
        .route("/whales/bulk", axum::routing::post(whales::bulk_action))
        .route("/whales/scan-status", get(whales::scan_status))
        .route("/whales/slug/{condition_id}", get(whales::market_slug))
        .route("/whales/{address}/follow", axum::routing::post(whales::toggle_follow))
        .route("/whales/{address}/history", get(whales::whale_history))
        .route("/whales/{address}", axum::routing::delete(whales::untrack_whale))
        .route("/auth", axum::routing::post(auth::set_credentials))
}
