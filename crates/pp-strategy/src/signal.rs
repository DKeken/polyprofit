use std::sync::atomic::Ordering;
use std::sync::Arc;

use anyhow::Result;
use chrono::Utc;
use rust_decimal::Decimal;
use rust_decimal_macros::dec;
use tracing::{debug, info, warn};

use pp_core::{AppState, Config, Signal, Side};
use pp_risk::RiskManager;

use crate::fair_price;

const SIGNAL_INTERVAL_MS: u64 = 500;

/// Main signal generation loop. Scans all markets every 500ms.
/// Reads strategy params from runtime_config each iteration so
/// UI config changes take effect immediately.
pub async fn signal_loop(
    state: Arc<AppState>,
    _config: &Config,
    risk: &RiskManager,
    signal_tx: tokio::sync::mpsc::Sender<Signal>,
) -> Result<()> {
    loop {
        tokio::time::sleep(std::time::Duration::from_millis(SIGNAL_INTERVAL_MS)).await;

        // Read live params from runtime_config (hot-reloadable via API)
        let (min_edge, min_prob, max_prob, max_spread) = {
            let rc = state.runtime_config.read();
            (rc.min_edge, rc.min_prob, rc.max_prob, rc.max_spread)
        };

        // Pre-checks
        if let Err(reason) = risk.can_trade(&state) {
            debug!(reason, "Risk check blocked trading");
            continue;
        }

        let now = Utc::now();

        for entry in state.markets.iter() {
            let market = entry.value();

            if !market.active {
                continue;
            }

            // Skip markets ending in < 5 min (too risky)
            let time_left = (market.end_time - now).num_seconds();
            if time_left < 300 {
                continue;
            }

            // Get price data for this asset
            let prices = match state.prices.get(&market.asset) {
                Some(p) => p.clone(),
                None => continue,
            };

            // Stale data check: Binance price > 10s old
            let now_ms = Utc::now().timestamp_millis();
            if prices.binance_ts > 0 && (now_ms - prices.binance_ts) > 10_000 {
                continue;
            }

            // Stale data check: orderbook > 30s old
            let ob = match state.orderbooks.get(&market.condition_id) {
                Some(ob) => ob.clone(),
                None => continue,
            };
            if (Utc::now() - ob.updated_at).num_seconds() > 30 {
                continue;
            }

            // Spread filter
            let spread = ob.best_ask - ob.best_bid;
            if spread > max_spread {
                continue;
            }

            // Calculate delta
            if prices.chainlink == Decimal::ZERO {
                continue;
            }
            let delta_pct = (prices.binance - prices.chainlink) / prices.chainlink;

            // Calculate strike distance if applicable
            let strike_dist = market.strike.map(|strike| {
                if prices.binance == Decimal::ZERO {
                    dec!(0)
                } else {
                    (prices.binance - strike) / prices.binance
                }
            });

            // Fair probability
            let fair = fair_price::fair_probability(market.kind, delta_pct, strike_dist);

            // Determine side and edge
            let mid_price = (ob.best_bid + ob.best_ask) / dec!(2);
            let (side, edge) = if fair > mid_price {
                // Market underprices YES → buy YES
                (Side::Yes, fair - mid_price)
            } else {
                // Market underprices NO → buy NO
                (Side::No, mid_price - fair)
            };

            // Edge filter
            if edge < min_edge {
                continue;
            }

            // Probability bounds filter
            let market_price = match side {
                Side::Yes => ob.best_ask,
                Side::No => dec!(1) - ob.best_bid,
            };
            if market_price < min_prob || market_price > max_prob {
                continue;
            }

            // Position sizing — use current balance, not peak
            let balance = Decimal::new(
                state.current_balance_cents().max(10000),
                2,
            );
            let size_usdc = risk.position_size(edge, balance, &state);

            // Already have a position in this market?
            if state.positions.contains_key(&market.condition_id) {
                continue;
            }

            let signal = Signal {
                condition_id: market.condition_id.clone(),
                side,
                fair,
                market_price,
                edge,
                size_usdc,
                timestamp: Utc::now(),
            };

            state
                .metrics
                .signals_generated
                .fetch_add(1, Ordering::Relaxed);

            info!(
                asset = %market.asset,
                kind = ?market.kind,
                side = %signal.side,
                edge = %signal.edge,
                fair = %signal.fair,
                market_price = %signal.market_price,
                size = %signal.size_usdc,
                "Signal generated"
            );

            if signal_tx.send(signal).await.is_err() {
                warn!("Signal channel closed");
                return Ok(());
            }
        }
    }
}
