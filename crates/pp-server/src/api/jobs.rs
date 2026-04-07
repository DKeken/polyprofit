use std::sync::Arc;
use std::sync::atomic::Ordering;
use axum::extract::State;
use axum::http::StatusCode;
use axum::response::IntoResponse;
use axum::Json;
use pp_core::AppState;
use pp_whales::DataApiClient;
use crate::api::dto::BasicResponse;

/// Auto-scan interval: every 10 minutes (full scan of top-100 traders)
pub const WHALE_SCAN_INTERVAL_SECS: u64 = 10 * 60;

/// Fast watcher interval: every 30 seconds (only followed whales)
const WHALE_WATCH_INTERVAL_SECS: u64 = 30;

/// Minimum trade size (USDC) to generate an alert for a followed whale
const ALERT_THRESHOLD_USDC: f64 = 500.0;

fn now_unix() -> i64 {
    std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_secs() as i64)
        .unwrap_or(0)
}

/// Run one whale poll cycle and update last/next scan timestamps.
async fn run_scan(state: &Arc<AppState>) {
    let client = DataApiClient::new();
    let _ = pp_whales::run_poll_cycle(&client, state).await;
    let now = now_unix();
    state.whale_last_scan.store(now, Ordering::Relaxed);
    state
        .whale_next_scan
        .store(now + WHALE_SCAN_INTERVAL_SECS as i64, Ordering::Relaxed);
}

/// Fetch and record the latest trades for all **followed** whales.
/// Emits `whale_alert_count` increments for trades above ALERT_THRESHOLD_USDC.
/// Uses `whale_seen_activity` DashMap for deduplication.
///
/// NOTE: the dedup map is capped at 50 000 entries to prevent unbounded growth.
const DEDUP_MAP_CAP: usize = 50_000;

async fn run_followed_watch(state: &Arc<AppState>) {
    // Prevent unbounded memory growth in the dedup map
    if state.whale_seen_activity.len() > DEDUP_MAP_CAP {
        tracing::debug!(
            entries = state.whale_seen_activity.len(),
            "dedup map exceeded cap, clearing"
        );
        state.whale_seen_activity.clear();
    }

    let client = DataApiClient::new();

    // Collect followed whale addresses
    let followed: Vec<String> = state
        .whales
        .iter()
        .filter(|e| e.value().followed)
        .map(|e| e.key().clone())
        .collect();

    if followed.is_empty() {
        return;
    }

    tracing::debug!(count = followed.len(), "followed whale watch: checking wallets");

    for address in &followed {
        // Rate limit between fetches
        tokio::time::sleep(std::time::Duration::from_millis(200)).await;

        let trades = match client.fetch_user_trades(address, 10).await {
            Ok(t) => t,
            Err(e) => {
                tracing::debug!(address, error = %e, "followed watch: trade fetch failed");
                continue;
            }
        };

        for trade in trades {
            // Build dedup key
            let dedup_key = format!("{}:{}:{}", address, trade.condition_id, trade.timestamp);
            if state.whale_seen_activity.contains_key(&dedup_key) {
                continue;
            }
            state.whale_seen_activity.insert(dedup_key, ());

            // Parse amount and emit alert if significant
            let amount: f64 = trade.amount.parse().unwrap_or(0.0);
            if amount >= ALERT_THRESHOLD_USDC {
                state.metrics.whale_alert_count.fetch_add(1, Ordering::Relaxed);
                tracing::info!(
                    address = address.as_str(),
                    amount = amount,
                    side = trade.side.as_str(),
                    "🐋 ALERT: followed whale made a significant trade"
                );
            }

            // Record as whale activity so the activity feed updates
            let activity = pp_core::WhaleActivity {
                address: address.clone(),
                condition_id: trade.condition_id,
                side: trade.side,
                amount: rust_decimal::Decimal::try_from(amount).unwrap_or_default(),
                price: trade.price.parse().unwrap_or_default(),
                timestamp: chrono::DateTime::parse_from_rfc3339(&trade.timestamp)
                    .map(|dt| dt.with_timezone(&chrono::Utc))
                    .unwrap_or_else(|_| chrono::Utc::now()),
                question: trade.question,
                platform: "Polymarket".to_string(),
            };
            state.record_whale_activity(activity);
            state.metrics.whale_events.fetch_add(1, Ordering::Relaxed);
        }
    }
}

/// HTTP handler: trigger a manual whale scan immediately and return 202.
pub async fn start_whale_job(State(state): State<Arc<AppState>>) -> impl IntoResponse {
    let state_clone = state.clone();
    tokio::spawn(async move {
        run_scan(&state_clone).await;
    });

    (
        StatusCode::ACCEPTED,
        Json(BasicResponse { status: "job_queued".into() }),
    )
    .into_response()
}

/// Background loop: runs whale scan on a fixed interval automatically.
/// Should be spawned once at startup.
pub async fn whale_auto_scan_loop(state: Arc<AppState>) -> anyhow::Result<()> {
    use tokio::time::{interval, Duration};

    // Set next scan time immediately on startup
    let first_scan_in = Duration::from_secs(60); // first scan 1 minute after startup
    state
        .whale_next_scan
        .store(now_unix() + 60, Ordering::Relaxed);

    // Wait 1 minute before first auto-scan so startup is not overwhelmed
    tokio::select! {
        _ = tokio::time::sleep(first_scan_in) => {}
        _ = state.shutdown.cancelled() => return Ok(()),
    }

    let mut ticker = interval(Duration::from_secs(WHALE_SCAN_INTERVAL_SECS));
    ticker.set_missed_tick_behavior(tokio::time::MissedTickBehavior::Delay);

    loop {
        tokio::select! {
            _ = ticker.tick() => {}
            _ = state.shutdown.cancelled() => return Ok(()),
        }

        tracing::info!(
            interval_secs = WHALE_SCAN_INTERVAL_SECS,
            "auto whale scan starting"
        );

        run_scan(&state).await;

        tracing::info!(
            next_scan_in_secs = WHALE_SCAN_INTERVAL_SECS,
            "auto whale scan complete"
        );
    }
}

/// Background loop: polls followed whales every 30 seconds for new trades.
/// Much faster than the full scan — only checks wallets the user is tracking.
/// Fires `whale_alert_count` increments which trigger frontend toasts.
pub async fn whale_followed_watch_loop(state: Arc<AppState>) -> anyhow::Result<()> {
    use tokio::time::{interval, Duration};

    // Wait a bit after startup before polling
    tokio::select! {
        _ = tokio::time::sleep(Duration::from_secs(15)) => {}
        _ = state.shutdown.cancelled() => return Ok(()),
    }

    let mut ticker = interval(Duration::from_secs(WHALE_WATCH_INTERVAL_SECS));
    ticker.set_missed_tick_behavior(tokio::time::MissedTickBehavior::Delay);

    loop {
        tokio::select! {
            _ = ticker.tick() => {}
            _ = state.shutdown.cancelled() => return Ok(()),
        }

        run_followed_watch(&state).await;
    }
}
