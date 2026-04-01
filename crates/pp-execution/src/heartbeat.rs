use std::sync::atomic::Ordering;
use std::sync::Arc;

use anyhow::Result;
use tracing::{error, info};

use pp_core::AppState;
use crate::AuthClient;

const MONITOR_INTERVAL_SECS: u64 = 5;

/// Heartbeat monitor for Live mode.
/// SDK's `start_heartbeats()` handles actual posting; this loop monitors health
/// and updates `AppState.heartbeat_alive`.
pub async fn heartbeat_monitor(client: Arc<AuthClient>, state: Arc<AppState>) -> Result<()> {
    info!("Heartbeat monitor started (checking every {MONITOR_INTERVAL_SECS}s)");

    loop {
        tokio::select! {
            _ = state.shutdown.cancelled() => {
                info!("Heartbeat monitor shutting down");
                return Ok(());
            }
            _ = tokio::time::sleep(std::time::Duration::from_secs(MONITOR_INTERVAL_SECS)) => {}
        }

        let active = client.heartbeats_active();
        let was_alive = state.heartbeat_alive.swap(active, Ordering::Relaxed);

        if !active && was_alive {
            error!("Heartbeat task STOPPED — orders may be cancelled!");
            state.metrics.heartbeat_failures.fetch_add(1, Ordering::Relaxed);
        } else if active && !was_alive {
            info!("Heartbeat task resumed");
        }
    }
}

/// Heartbeat placeholder for Demo mode. Always marks heartbeat as alive.
pub async fn heartbeat_demo(state: Arc<AppState>) -> Result<()> {
    info!("Heartbeat demo mode — always alive");
    state.heartbeat_alive.store(true, Ordering::Relaxed);

    loop {
        tokio::select! {
            _ = state.shutdown.cancelled() => {
                info!("Heartbeat demo shutting down");
                return Ok(());
            }
            _ = tokio::time::sleep(std::time::Duration::from_secs(60)) => {}
        }
    }
}
