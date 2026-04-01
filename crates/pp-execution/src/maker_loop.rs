use std::sync::atomic::Ordering;
use std::sync::Arc;
use std::time::Instant;

use anyhow::Result;
use chrono::Utc;
use rust_decimal_macros::dec;
use tracing::{debug, info, warn};

use pp_core::{AppState, Side};
use crate::AuthClient;

const CANCEL_REPLACE_INTERVAL_MS: u64 = 200;
const STALE_ORDER_SECS: i64 = 30;

/// Cancel/replace loop for active maker orders.
/// Runs every 200ms to keep orders fresh and avoid adverse selection.
/// `client` is Some in Live mode (real cancel calls), None in Demo mode (local tracking only).
pub async fn maker_loop(state: Arc<AppState>, client: Option<Arc<AuthClient>>) -> Result<()> {
    info!("Maker cancel/replace loop started (interval: {CANCEL_REPLACE_INTERVAL_MS}ms)");

    loop {
        tokio::select! {
            _ = state.shutdown.cancelled() => {
                info!("Maker loop shutting down — cancelling all open maker orders");
                // Cancel all remaining maker orders before exit
                let order_ids: Vec<String> = state.maker_orders.iter()
                    .map(|e| e.key().clone())
                    .collect();
                if !order_ids.is_empty() {
                    if let Some(ref clob) = client {
                        let ids: Vec<&str> = order_ids.iter().map(|s| s.as_str()).collect();
                        if let Err(e) = clob.cancel_orders(&ids).await {
                            warn!(error = %e, "Failed to cancel maker orders on shutdown");
                        }
                    }
                    for id in &order_ids {
                        state.maker_orders.remove(id);
                    }
                    info!(count = order_ids.len(), "Maker orders cancelled on shutdown");
                }
                return Ok(());
            }
            _ = tokio::time::sleep(std::time::Duration::from_millis(CANCEL_REPLACE_INTERVAL_MS)) => {}
        }

        if state.is_paused() || !state.is_heartbeat_alive() {
            continue;
        }

        let now = Utc::now();
        let mut to_cancel = Vec::new();
        let mut to_update = Vec::new();

        // Check all active maker orders
        for entry in state.maker_orders.iter() {
            let order = entry.value();

            // Stale order: older than 30s, cancel it
            let age_secs = (now - order.placed_at).num_seconds();
            if age_secs > STALE_ORDER_SECS {
                to_cancel.push(order.order_id.clone());
                continue;
            }

            // Check if price has moved — need to cancel/replace
            let ob = match state.orderbooks.get(&order.condition_id) {
                Some(ob) => ob.clone(),
                None => continue,
            };

            let needs_update = match order.side {
                Side::Yes => {
                    let ideal = ob.best_bid + dec!(0.01);
                    (order.price - ideal).abs() > dec!(0.005)
                }
                Side::No => {
                    let ideal = ob.best_ask - dec!(0.01);
                    (order.price - ideal).abs() > dec!(0.005)
                }
            };

            if needs_update {
                to_update.push(order.order_id.clone());
            }
        }

        // Cancel stale orders via SDK (Live) or just remove locally (Demo)
        if !to_cancel.is_empty() {
            if let Some(ref clob) = client {
                let ids: Vec<&str> = to_cancel.iter().map(|s| s.as_str()).collect();
                let start = Instant::now();
                if let Err(e) = clob.cancel_orders(&ids).await {
                    warn!(error = %e, "Failed to cancel stale orders via SDK");
                }
                let elapsed = start.elapsed();
                debug!(count = to_cancel.len(), elapsed_ms = elapsed.as_millis(), "Stale orders cancelled via SDK");
            }

            for order_id in &to_cancel {
                state.maker_orders.remove(order_id);
                state.metrics.orders_cancelled.fetch_add(1, Ordering::Relaxed);
                debug!(order_id = %order_id, "Stale maker order removed");
            }
        }

        // Cancel-replace updated orders via SDK
        for order_id in to_update {
            let start = Instant::now();

            if let Some(ref clob) = client {
                if let Err(e) = clob.cancel_order(&order_id).await {
                    warn!(order_id = %order_id, error = %e, "Cancel failed");
                    continue;
                }
            }

            // Remove stale tracking entry (re-placement happens on next signal)
            state.maker_orders.remove(&order_id);
            // Count update-cancels too — they're still cancelled orders
            state.metrics.orders_cancelled.fetch_add(1, Ordering::Relaxed);

            let elapsed = start.elapsed();
            if elapsed.as_millis() > 200 {
                warn!(
                    elapsed_ms = elapsed.as_millis(),
                    order_id = %order_id,
                    "Cancel/replace too slow (> 200ms)"
                );
                state.metrics.slow_cancel_replace.fetch_add(1, Ordering::Relaxed);
            }

            debug!(
                order_id = %order_id,
                elapsed_ms = elapsed.as_millis(),
                "Order cancelled for replacement"
            );
        }
    }
}
