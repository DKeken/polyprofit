pub mod api;
pub mod ws;

use std::sync::Arc;

use anyhow::Result;
use axum::Router;
use tower_http::cors::CorsLayer;
use tower_http::services::ServeDir;
use tracing::info;

use pp_core::{AppState, Config};

pub async fn run_server(state: Arc<AppState>, config: &Config) -> Result<()> {
    let app = Router::new()
        .nest("/api", api::routes(state.clone()))
        .route("/ws", axum::routing::get(ws::ws_handler))
        .fallback_service(ServeDir::new(&config.server.frontend_dist))
        .layer(CorsLayer::permissive())
        .with_state(state);

    let addr = format!("0.0.0.0:{}", config.server.port);
    let listener = tokio::net::TcpListener::bind(&addr).await?;
    info!(addr = %addr, "Server listening");

    axum::serve(listener, app).await?;
    Ok(())
}
