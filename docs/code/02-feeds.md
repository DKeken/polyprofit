# Feeds — pp-feeds/

> RTDS WebSocket для цен (Binance + Chainlink) и CLOB WS для ордербуков.
> Оба стрима пишут в `SharedState` через `Arc<RwLock<AppState>>`.

---

## rtds.rs — Binance + Chainlink цены

```rust
use pp_core::types::*;
use tokio::sync::RwLock;
use std::sync::Arc;

const RTDS_URL: &str = "wss://ws-live-data.polymarket.com";

// RTDS даёт два типа цен:
//   binance_price  — реальная цена (опережает на 15-55с)
//   chainlink_price — oracle цена (то что видит Polymarket)
// Разница = наш edge.

pub async fn run(state: Arc<RwLock<AppState>>) -> anyhow::Result<()> {
    let assets = ["btc", "eth", "sol", "xrp"];

    loop {
        let mut ws = rtds::connect(RTDS_URL).await?;

        // Подписка на все активы
        ws.subscribe_prices(&assets).await?;

        // RTDS требует PING каждые 5 секунд
        let ping_task = tokio::spawn({
            let ws = ws.clone();
            async move {
                let mut interval = tokio::time::interval(Duration::from_secs(5));
                loop {
                    interval.tick().await;
                    let _ = ws.ping().await;
                }
            }
        });

        let mut last_data = Instant::now();

        while let Some(msg) = ws.next().await {
            last_data = Instant::now();

            match msg {
                RtdsMessage::BinancePrice { asset, price, ts } => {
                    let mut s = state.write().await;
                    s.prices.binance.insert(
                        asset.clone(),
                        PricePoint { value: price, ts },
                    );
                }
                RtdsMessage::ChainlinkPrice { asset, price, ts } => {
                    let mut s = state.write().await;
                    s.prices.chainlink.insert(
                        asset.clone(),
                        PricePoint { value: price, ts },
                    );
                }
                _ => {}
            }

            // Zombie detection: нет данных 30с → reconnect
            if last_data.elapsed() > Duration::from_secs(30) {
                tracing::warn!("RTDS zombie detected, reconnecting...");
                break;
            }
        }

        ping_task.abort();
        tracing::warn!("RTDS disconnected, reconnecting in 2s...");
        tokio::time::sleep(Duration::from_secs(2)).await;
    }
}
```

---

## orderbook.rs — CLOB WebSocket

```rust
pub async fn run(
    state: Arc<RwLock<AppState>>,
    markets: Arc<RwLock<Vec<Market>>>,
) -> anyhow::Result<()> {
    loop {
        let ws = clob_ws::connect("wss://ws-subscriptions-clob.polymarket.com/ws/market").await?;

        // Подписка на все активные рынки
        let m = markets.read().await;
        let ids: Vec<&str> = m.iter()
            .flat_map(|m| [m.token_yes.0.as_str(), m.token_no.0.as_str()])
            .collect();
        ws.subscribe_book(&ids).await?;
        drop(m);

        while let Some(msg) = ws.next().await {
            if let BookUpdate { token_id, bids, asks } = msg {
                let best_bid = bids.first().map(|b| b.price).unwrap_or(0.0);
                let best_ask = asks.first().map(|a| a.price).unwrap_or(1.0);
                let bid_depth: f64 = bids.iter().take(5).map(|b| b.size).sum();
                let ask_depth: f64 = asks.iter().take(5).map(|a| a.size).sum();

                let mut s = state.write().await;
                s.orderbooks.insert(
                    TokenId(token_id),
                    Orderbook {
                        bid: best_bid,
                        ask: best_ask,
                        bid_depth,
                        ask_depth,
                        updated: Instant::now(),
                    },
                );
            }
        }

        tracing::warn!("CLOB WS disconnected, reconnecting in 2s...");
        tokio::time::sleep(Duration::from_secs(2)).await;
    }
}
```

### Ключевые решения

- **RTDS вместо прямого Binance WS** — RTDS уже агрегирует Binance + Chainlink
- **Zombie detection** — WS может быть "жив" по ping/pong, но не слать данных
- **Reconnect loop** — бесконечный цикл с 2с паузой при disconnect
- **PING каждые 5с** — требование RTDS протокола
- **Top-5 depth** — не нужен полный orderbook, достаточно 5 уровней
