use std::sync::atomic::Ordering;
use std::sync::Arc;
use std::time::Instant;

use anyhow::Result;
use rust_decimal::Decimal;
use serde::Deserialize;
use tracing::{debug, error, info, warn};

use pp_core::{AppState, Asset};

const RTDS_URL: &str = "wss://ws-live-data.polymarket.com";
const ZOMBIE_TIMEOUT_SECS: u64 = 30;

#[derive(Debug, Deserialize)]
struct RtdsMessage {
    #[serde(default)]
    #[allow(dead_code)]
    r#type: String,
    #[serde(default)]
    data: Option<RtdsPriceData>,
}

#[derive(Debug, Deserialize)]
struct RtdsPriceData {
    #[serde(default)]
    symbol: String,
    #[serde(default)]
    price: Option<String>,
    #[serde(default)]
    source: String,
    #[serde(default)]
    timestamp: Option<i64>,
}

/// Subscribe to RTDS for Binance + Chainlink price feeds.
/// Reconnects automatically on failure.
pub async fn run_rtds_feed(state: Arc<AppState>, assets: Vec<Asset>) -> Result<()> {
    loop {
        if state.shutdown.is_cancelled() {
            info!("RTDS feed shutting down");
            return Ok(());
        }
        match connect_and_stream(&state, &assets).await {
            Ok(()) => {
                info!("RTDS stream ended cleanly, reconnecting...");
            }
            Err(e) => {
                error!("RTDS stream error: {e:#}, reconnecting in 3s...");
                state
                    .metrics
                    .ws_reconnects
                    .fetch_add(1, Ordering::Relaxed);
            }
        }
        tokio::select! {
            _ = state.shutdown.cancelled() => {
                info!("RTDS feed shutting down");
                return Ok(());
            }
            _ = tokio::time::sleep(std::time::Duration::from_secs(3)) => {}
        }
    }
}

async fn connect_and_stream(state: &Arc<AppState>, assets: &[Asset]) -> Result<()> {
    use futures::stream::StreamExt;
    use tokio_tungstenite::connect_async;
    use tokio_tungstenite::tungstenite::Message;

    let (ws, _resp) = connect_async(RTDS_URL).await?;
    info!("RTDS connected to {RTDS_URL}");

    let (mut _write, mut read) = ws.split();

    // Build subscription message for all assets using registry
    let symbols: Vec<String> = assets.iter().filter_map(|a| {
        state.asset_registry.get(a).map(|meta| meta.binance_symbol.clone())
    }).collect();
    let sub_msg = serde_json::json!({
        "type": "subscribe",
        "channels": ["crypto_prices"],
        "symbols": symbols,
    });

    use futures::SinkExt;
    _write
        .send(Message::Text(sub_msg.to_string().into()))
        .await?;
    info!(symbols = ?symbols, "RTDS subscribed");

    let mut last_real_data = Instant::now();

    while let Some(msg) = read.next().await {
        let msg = msg?;

        match msg {
            Message::Text(text) => {
                last_real_data = Instant::now();

                if let Err(e) = handle_rtds_message(state, &text) {
                    debug!("RTDS parse: {e}");
                }
            }
            Message::Ping(data) => {
                _write.send(Message::Pong(data)).await?;

                // Zombie detection
                if last_real_data.elapsed().as_secs() > ZOMBIE_TIMEOUT_SECS {
                    warn!("RTDS zombie connection detected, disconnecting");
                    break;
                }
            }
            Message::Close(_) => {
                info!("RTDS received close frame");
                break;
            }
            _ => {}
        }
    }

    Ok(())
}

fn handle_rtds_message(state: &Arc<AppState>, text: &str) -> Result<()> {
    let msg: RtdsMessage = serde_json::from_str(text)?;

    if let Some(data) = msg.data {
        let price_str = data.price.unwrap_or_default();
        let price: Decimal = price_str.parse()?;
        let ts = data.timestamp.unwrap_or(0);

        // Match symbol to asset using data-driven registry lookup
        let asset = state.asset_from_binance_symbol(&data.symbol);

        if let Some(asset) = asset {
            let asset_display = asset.to_string();
            let mut entry = state.prices.entry(asset).or_default();
            let ps = entry.value_mut();

            match data.source.as_str() {
                "binance" | "Binance" => {
                    ps.binance = price;
                    ps.binance_ts = ts;
                }
                "chainlink" | "Chainlink" => {
                    ps.chainlink = price;
                    ps.chainlink_ts = ts;
                }
                _ => {}
            }

            debug!(
                asset = %asset_display,
                source = %data.source,
                price = %price,
                "Price updated"
            );
        }
    }

    Ok(())
}
