use std::sync::Arc;
use axum::extract::State;
use axum::response::IntoResponse;
use axum::Json;
use pp_core::AppState;
use crate::api::dto::{AuthRequest, AuthResponse};
use crate::api::error::internal_error;

pub async fn set_credentials(
    State(state): State<Arc<AppState>>,
    Json(payload): Json<AuthRequest>,
) -> impl IntoResponse {
    // ─────────────────────────────────────────────────────────────────
    // Secrets are written to `.env` next to the binary with mode 0600.
    // This is acceptable for single-user dev / single-tenant boxes only.
    // For shared environments wire a KMS / OS keychain instead.
    // ─────────────────────────────────────────────────────────────────
    let env_content = format!(
        "POLYMARKET_PRIVATE_KEY=\"{}\"\nPOLYMARKET_API_KEY=\"{}\"\nPOLYMARKET_SECRET=\"{}\"\nPOLYMARKET_PASSPHRASE=\"{}\"\n",
        payload.private_key.trim(),
        payload.api_key.trim(),
        payload.api_secret.trim(),
        payload.api_passphrase.trim()
    );

    let path = std::path::Path::new(".env");
    if let Err(e) = std::fs::write(path, env_content) {
        tracing::error!("Failed to write .env file: {}", e);
        return internal_error(format!("Failed to save credentials: {}", e)).into_response();
    }

    #[cfg(unix)]
    {
        use std::os::unix::fs::PermissionsExt as _;
        let perms = std::fs::Permissions::from_mode(0o600);
        if let Err(e) = std::fs::set_permissions(path, perms) {
            tracing::warn!("Failed to chmod 600 .env: {}", e);
        }
    }

    tracing::info!("Credentials saved. Gracefully shutting down to apply changes via auto-restart...");

    tokio::spawn(async move {
        tokio::time::sleep(std::time::Duration::from_millis(500)).await;
        state.shutdown.cancel();
    });

    Json(AuthResponse {
        success: true,
        message: "Credentials saved. The bot is restarting to authenticate...".into(),
    })
    .into_response()
}
