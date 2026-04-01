use std::sync::atomic::Ordering;
use std::sync::Arc;
use std::time::Instant;

use anyhow::Result;
use chrono::Utc;
use rust_decimal::Decimal;
use serde::Deserialize;
use tracing::{debug, error, info, warn};

use pp_core::{AppState, ConditionId, Orderbook};

const CLOB_WS_URL: &str = "wss://ws-subscriptions-clob.polymarket.com/ws/market";
const ZOMBIE_TIMEOUT_SECS: u64 = 30;

#[derive(Debug, Deserialize)]
struct BookMessage {
    #[serde(default)]
    market: String,
    #[serde(default)]
    asset_id: String,
    #[serde(default)]
    bids: Vec<PriceLevel>,
    #[serde(default)]
    asks: Vec<PriceLevel>,
    #[serde(default)]
    #[allow(dead_code)]
    event_type: String,
}

#[derive(Debug, Deserialize)]
struct PriceLevel {
    pub price: String,
    pub size: String,
}

/// Subscribe to CLOB WebSocket for orderbook snapshots/deltas.
/// Reconnects automatically on failure.
/// On each reconnect, re-reads state.markets so newly discovered markets get subscribed.
pub async fn run_orderbook_feed(state: Arc<AppState>) -> Result<()> {
    loop {
        if state.shutdown.is_cancelled() {
            info!("Orderbook feed shutting down");
            return Ok(());
        }
        match connect_and_stream(&state).await {
            Ok(()) => {
                info!("Orderbook WS ended cleanly, reconnecting...");
            }
            Err(e) => {
                error!("Orderbook WS error: {e:#}, reconnecting in 3s...");
                state
                    .metrics
                    .ws_reconnects
                    .fetch_add(1, Ordering::Relaxed);
            }
        }
        tokio::select! {
            _ = state.shutdown.cancelled() => {
                info!("Orderbook feed shutting down");
                return Ok(());
            }
            _ = tokio::time::sleep(std::time::Duration::from_secs(3)) => {}
        }
    }
}

async fn connect_and_stream(state: &Arc<AppState>) -> Result<()> {
    use futures::stream::StreamExt;
    use futures::SinkExt;
    use tokio_tungstenite::connect_async;
    use tokio_tungstenite::tungstenite::Message;

    let (ws, _resp) = connect_async(CLOB_WS_URL).await?;
    info!("Orderbook WS connected to {CLOB_WS_URL}");

    let (mut write, mut read) = ws.split();

    // Subscribe to all active markets (reads current snapshot on each reconnect)
    let market_ids: Vec<String> = state
        .markets
        .iter()
        .filter(|m| m.active)
        .map(|m| m.condition_id.0.clone())
        .collect();

    if market_ids.is_empty() {
        warn!("No active markets to subscribe orderbooks for, waiting 10s...");
        tokio::time::sleep(std::time::Duration::from_secs(10)).await;
        return Ok(());
    }

    // Subscribe in batches (CLOB WS supports multiple assets per sub)
    for chunk in market_ids.chunks(20) {
        let sub = serde_json::json!({
            "type": "subscribe",
            "channel": "book",
            "assets_ids": chunk,
        });
        write.send(Message::Text(sub.to_string().into())).await?;
    }
    info!(count = market_ids.len(), "Subscribed to orderbooks");

    let mut last_real_data = Instant::now();
    let mut known_market_count = market_ids.len();

    // Periodic check: if market count increased, force reconnect to re-subscribe
    let mut resub_check = tokio::time::interval(std::time::Duration::from_secs(30));

    loop {
        tokio::select! {
            msg = read.next() => {
                let msg = match msg {
                    Some(Ok(m)) => m,
                    Some(Err(e)) => return Err(e.into()),
                    None => break,
                };

                match msg {
                    Message::Text(text) => {
                        last_real_data = Instant::now();
                        if let Err(e) = handle_book_message(state, &text) {
                            debug!("Orderbook parse: {e}");
                        }
                    }
                    Message::Ping(data) => {
                        write.send(Message::Pong(data)).await?;
                        if last_real_data.elapsed().as_secs() > ZOMBIE_TIMEOUT_SECS {
                            warn!("Orderbook zombie detected, disconnecting");
                            break;
                        }
                    }
                    Message::Close(_) => {
                        info!("Orderbook WS close frame");
                        break;
                    }
                    _ => {}
                }
            }
            _ = resub_check.tick() => {
                let current_count = state.markets.iter().filter(|m| m.active).count();
                if current_count > known_market_count {
                    info!(
                        old = known_market_count,
                        new = current_count,
                        "New markets discovered, reconnecting WS to subscribe"
                    );
                    break; // Will reconnect in outer loop, re-reading full market list
                }
                known_market_count = current_count;
            }
        }
    }

    Ok(())
}

fn handle_book_message(state: &Arc<AppState>, text: &str) -> Result<()> {
    let msg: BookMessage = serde_json::from_str(text)?;

    if msg.asset_id.is_empty() && msg.market.is_empty() {
        return Ok(());
    }

    let id = if !msg.market.is_empty() {
        msg.market
    } else {
        msg.asset_id
    };

    let best_bid = msg
        .bids
        .first()
        .and_then(|l| l.price.parse::<Decimal>().ok())
        .unwrap_or(Decimal::ZERO);

    let best_ask = msg
        .asks
        .first()
        .and_then(|l| l.price.parse::<Decimal>().ok())
        .unwrap_or(Decimal::ONE);

    let bid_depth: Decimal = msg
        .bids
        .iter()
        .filter_map(|l| l.size.parse::<Decimal>().ok())
        .sum();

    let ask_depth: Decimal = msg
        .asks
        .iter()
        .filter_map(|l| l.size.parse::<Decimal>().ok())
        .sum();

    let ob = Orderbook {
        best_bid,
        best_ask,
        bid_depth,
        ask_depth,
        updated_at: Utc::now(),
    };

    state.orderbooks.insert(ConditionId(id), ob);

    Ok(())
}
