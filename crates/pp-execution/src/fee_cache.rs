use std::str::FromStr;
use std::sync::Arc;

use anyhow::Result;
use dashmap::DashMap;
use rust_decimal::Decimal;
use tracing::{debug, info, warn};

use polymarket_client_sdk::types::U256;

use pp_core::{AppState, TokenId};
use crate::AuthClient;

const REFRESH_INTERVAL_SECS: u64 = 300; // 5 min

/// Shared fee cache: token_id string → fee_rate_bps
pub type FeeCache = Arc<DashMap<String, u32>>;

pub fn new_fee_cache() -> FeeCache {
    Arc::new(DashMap::new())
}

/// Look up cached fee rate for a token. Returns 0 bps (maker) if not found.
pub fn get_fee_bps(cache: &FeeCache, token_id: &TokenId) -> u32 {
    cache
        .get(&token_id.0)
        .map(|v| *v.value())
        .unwrap_or(0)
}

/// Convert fee bps to a decimal multiplier (e.g. 200 bps → 0.02).
pub fn fee_bps_to_decimal(bps: u32) -> Decimal {
    Decimal::new(bps as i64, 4)
}

/// Background loop: refresh fee rates for active tokens via SDK.
/// The SDK's `fee_rate_bps()` has internal caching, but we store results
/// in our own DashMap for fast lookup from other modules.
pub async fn fee_refresh_loop(
    cache: FeeCache,
    state: Arc<AppState>,
    client: Arc<AuthClient>,
) -> Result<()> {
    loop {
        tokio::select! {
            _ = state.shutdown.cancelled() => {
                info!("Fee refresh loop shutting down");
                return Ok(());
            }
            _ = tokio::time::sleep(std::time::Duration::from_secs(REFRESH_INTERVAL_SECS)) => {}
        }

        // Collect unique token IDs from active positions and maker orders
        let mut token_ids: Vec<String> = Vec::new();
        for entry in state.positions.iter() {
            token_ids.push(entry.value().token_id.0.clone());
        }
        for entry in state.maker_orders.iter() {
            token_ids.push(entry.value().token_id.0.clone());
        }
        token_ids.sort();
        token_ids.dedup();

        for tid in &token_ids {
            let token_u256 = match U256::from_str(tid) {
                Ok(v) => v,
                Err(_) => continue,
            };

            match client.fee_rate_bps(token_u256).await {
                Ok(resp) => {
                    cache.insert(tid.clone(), resp.base_fee);
                    debug!(token_id = %tid, fee_bps = resp.base_fee, "Fee rate cached via SDK");
                }
                Err(e) => {
                    warn!(token_id = %tid, error = %e, "Fee rate fetch failed");
                }
            }

            // Rate-limit: 100ms between requests — also check shutdown
            tokio::select! {
                _ = state.shutdown.cancelled() => {
                    info!("Fee refresh loop shutting down (mid-refresh)");
                    return Ok(());
                }
                _ = tokio::time::sleep(std::time::Duration::from_millis(100)) => {}
            }
        }
    }
}
