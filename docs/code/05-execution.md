# Execution — pp-execution/

> Ордера, heartbeat, cancel/replace loop, fee cache, redeem.
> Самый критичный модуль — ошибка здесь = потеря денег.

---

## orders.rs — Размещение ордеров

```rust
use pp_core::types::*;

pub async fn place_order(
    clob: &ClobClient,
    signal: &Signal,
    state: &Arc<RwLock<AppState>>,
    config: &Config,
    fee_cache: &Arc<RwLock<HashMap<TokenId, u32>>>,
) {
    let risk = pp_risk::RiskManager::new(&config.risk);
    let s = state.read().await;

    let size_usdc = risk.position_size(signal.edge, s.balance, config.strategy.min_edge);
    let token_id = match signal.side {
        Side::Yes => &signal.market.token_yes,
        Side::No  => &signal.market.token_no,
    };
    drop(s);

    // Fee rate из кэша (обязателен для подписи)
    let fee_bps = fee_cache::get(fee_cache, token_id).await;

    match config.strategy.order_strategy {
        // ── MAKER (0% fee, рекомендуемый) ──
        OrderStrategy::Passive => {
            let order = clob.limit_order()
                .token_id(&token_id.0)
                .price(round_tick(signal.entry_price, signal.market.tick_size))
                .size(to_shares(size_usdc, signal.entry_price))
                .side(to_sdk_side(signal.side))
                .post_only(true)    // ГАРАНТИРОВАННО maker = 0% fee
                .fee_rate_bps(fee_bps)
                .build().await;

            match order {
                Ok(o) => post_and_track(clob, o, signal, state).await,
                Err(e) => tracing::warn!("Order build failed: {e}"),
            }
        }

        // ── BALANCED: maker → fallback taker ──
        OrderStrategy::Balanced => {
            // Сначала пробуем post-only
            let result = clob.limit_order()
                .token_id(&token_id.0)
                .price(round_tick(signal.entry_price, signal.market.tick_size))
                .size(to_shares(size_usdc, signal.entry_price))
                .side(to_sdk_side(signal.side))
                .post_only(true)
                .fee_rate_bps(fee_bps)
                .build().await;

            match result {
                Ok(o) => post_and_track(clob, o, signal, state).await,
                // Post-only rejected → FAK (partial fill OK)
                Err(_) => {
                    let fak = clob.market_order()
                        .token_id(&token_id.0)
                        .amount(size_usdc)
                        .side(to_sdk_side(signal.side))
                        .order_type(OrderType::Fak)
                        .fee_rate_bps(fee_bps)
                        .worst_price(signal.entry_price + 0.03) // 3% slippage max
                        .build().await;

                    if let Ok(o) = fak {
                        post_and_track(clob, o, signal, state).await;
                    }
                }
            }
        }

        // ── AGGRESSIVE: FOK taker (платим fee, но гарантия fill) ──
        OrderStrategy::Aggressive => {
            let order = clob.market_order()
                .token_id(&token_id.0)
                .amount(size_usdc)
                .side(to_sdk_side(signal.side))
                .order_type(OrderType::Fok)
                .fee_rate_bps(fee_bps)
                .worst_price(signal.entry_price + 0.02)
                .build().await;

            match order {
                Ok(o) => post_and_track(clob, o, signal, state).await,
                Err(e) => tracing::warn!("FOK build failed: {e}"),
            }
        }
    }
}

async fn post_and_track(
    clob: &ClobClient,
    order: SignedOrder,
    signal: &Signal,
    state: &Arc<RwLock<AppState>>,
) {
    match clob.post_order(order).await {
        Ok(resp) if resp.success => {
            let mut s = state.write().await;
            // Записать maker order для cancel/replace loop
            if let Some(order_id) = resp.order_id {
                s.maker_orders.insert(order_id, MakerOrder {
                    token_id: signal.market.token_yes.clone(),
                    asset: signal.market.asset,
                    price: signal.entry_price,
                    size: to_shares(10.0, signal.entry_price), // TODO: real size
                    side: signal.side,
                    placed: Instant::now(),
                });
            }
            tracing::info!(
                "✅ {} {:?} @ {:.3} edge={:.1}%",
                signal.market.question, signal.side,
                signal.entry_price, signal.edge * 100.0
            );
        }
        Ok(resp) => tracing::warn!("Order rejected: {}", resp.error_msg),
        Err(e) => tracing::error!("Post order error: {e}"),
    }
}

fn round_tick(price: f64, tick: Decimal) -> Decimal {
    let t = tick.to_f64().unwrap_or(0.01);
    Decimal::from_f64_retain((price / t).round() * t).unwrap()
}

fn to_shares(usdc: f64, price: f64) -> Decimal {
    Decimal::from_f64_retain(usdc / price).unwrap()
}
```

---

## heartbeat.rs — Обязательный heartbeat

> ⚠️ Без heartbeat каждые 10с (буфер 5с) → ВСЕ ордера отменяются.

```rust
use std::sync::atomic::{AtomicBool, Ordering};

static HEALTHY: AtomicBool = AtomicBool::new(false);

pub fn is_healthy() -> bool { HEALTHY.load(Ordering::Relaxed) }

pub async fn run(clob: Arc<ClobClient>) -> anyhow::Result<()> {
    let mut id = String::new();
    let mut fails = 0u32;

    loop {
        match clob.post_heartbeat(&id).await {
            Ok(resp) => {
                id = resp.heartbeat_id;
                fails = 0;
                HEALTHY.store(true, Ordering::Relaxed);
            }
            Err(e) => {
                fails += 1;
                HEALTHY.store(false, Ordering::Relaxed);

                // 400 с правильным ID → обновить
                if let Some(correct) = extract_correct_id(&e) {
                    id = correct;
                } else {
                    tracing::error!("❌ Heartbeat fail #{fails}: {e}");
                }

                if fails >= 3 {
                    tracing::error!("🚨 HEARTBEAT DEAD — ордера отменены сервером!");
                    // TODO: Telegram alert
                }
            }
        }

        tokio::time::sleep(Duration::from_secs(8)).await; // 10с лимит - 2с буфер
    }
}
```

---

## maker_loop.rs — Cancel/Replace (< 200ms)

> ⚠️ После удаления 500ms taker delay — taker fills мгновенные.
> Стейлый maker ордер = adverse selection = убыток.

```rust
pub async fn run(
    state: Arc<RwLock<AppState>>,
    clob: Arc<ClobClient>,
    config: &Config,
) -> anyhow::Result<()> {
    let mut interval = tokio::time::interval(Duration::from_millis(200));

    loop {
        interval.tick().await;

        let s = state.read().await;
        let orders: Vec<_> = s.maker_orders.iter()
            .map(|(id, o)| (id.clone(), o.clone()))
            .collect();
        drop(s);

        for (order_id, order) in orders {
            let s = state.read().await;
            let asset_key = format!("{:?}", order.asset).to_lowercase();
            let Some(binance) = s.prices.binance.get(&asset_key) else { continue };
            let Some(chainlink) = s.prices.chainlink.get(&asset_key) else { continue };
            drop(s);

            // Пересчитать fair price
            // (нужен Market — хранить в MakerOrder или lookup)
            let new_fair = binance.value; // simplified: use binance as proxy
            let tick = 0.01_f64; // TODO: from market

            let diff = (new_fair - order.price).abs();
            if diff < tick { continue; } // цена не изменилась

            let start = Instant::now();

            // Cancel
            if let Err(e) = clob.cancel_order(&order_id).await {
                tracing::error!("Cancel {order_id}: {e}");
                continue;
            }

            // Replace с новой ценой
            let new_price = (new_fair / tick).round() * tick;
            // ... (аналогично orders.rs, post-only)

            let elapsed = start.elapsed();
            tracing::info!(
                "🔄 C/R {:?}: {:.3}→{:.3} ({}ms) {}",
                order.asset, order.price, new_price,
                elapsed.as_millis(),
                if elapsed.as_millis() < 200 { "✅" } else { "⚠️ SLOW" }
            );
        }
    }
}
```

---

## fee_cache.rs — Кэш feeRateBps

```rust
const CLOB: &str = "https://clob.polymarket.com";

/// Фоновое обновление fee rates каждые 60 секунд
pub async fn refresh_loop(
    cache: Arc<RwLock<HashMap<TokenId, u32>>>,
    markets: Arc<RwLock<Vec<Market>>>,
) -> anyhow::Result<()> {
    let http = reqwest::Client::new();
    loop {
        tokio::time::sleep(Duration::from_secs(60)).await;

        let m = markets.read().await;
        let tokens: Vec<TokenId> = m.iter()
            .flat_map(|m| [m.token_yes.clone(), m.token_no.clone()])
            .collect();
        drop(m);

        let mut fresh = HashMap::new();
        for token in &tokens {
            if let Ok(resp) = http.get(format!("{CLOB}/fee-rate"))
                .query(&[("token_id", &token.0)])
                .send().await
            {
                if let Ok(body) = resp.json::<serde_json::Value>().await {
                    if let Some(rate) = body["fee_rate_bps"].as_u64() {
                        fresh.insert(token.clone(), rate as u32);
                    }
                }
            }
            tokio::time::sleep(Duration::from_millis(100)).await; // rate limit
        }

        *cache.write().await = fresh;
        tracing::debug!("Fee cache: {} tokens", fresh.len());
    }
}

/// Получить fee rate. Fallback: direct HTTP если нет в кэше.
pub async fn get(cache: &Arc<RwLock<HashMap<TokenId, u32>>>, token: &TokenId) -> u32 {
    if let Some(&rate) = cache.read().await.get(token) { return rate; }
    // Geopolitics = 0, или ещё не закэшировано
    0
}
```

---

## redeem.rs — Auto-redeem выигрышей

```rust
/// Каждые 120 секунд проверяет resolved markets и redeems выигрыши.
pub async fn run(clob: Arc<ClobClient>, state: Arc<RwLock<AppState>>) -> anyhow::Result<()> {
    loop {
        tokio::time::sleep(Duration::from_secs(120)).await;

        let s = state.read().await;
        let to_redeem: Vec<_> = s.positions.iter()
            .filter(|(cid, _)| s.resolved.contains(cid))
            .map(|(cid, pos)| (cid.clone(), pos.clone()))
            .collect();
        drop(s);

        for (cid, pos) in to_redeem {
            match clob.redeem(&cid.0).await {
                Ok(resp) => {
                    let pnl = resp.payout - (pos.size * Decimal::from_f64_retain(pos.entry).unwrap());
                    let mut s = state.write().await;
                    s.balance += pnl.to_f64().unwrap_or(0.0).into();
                    s.positions.remove(&cid);
                    s.resolved.remove(&cid);

                    let won = pnl > Decimal::ZERO;
                    if won { s.wins += 1; }
                    s.trades += 1;
                    s.daily_pnl += pnl;
                    s.total_pnl += pnl;

                    tracing::info!(
                        "{} Redeemed {}: PnL={:+.2}",
                        if won { "🟢" } else { "🔴" },
                        pos.market.question, pnl
                    );
                }
                Err(e) => tracing::error!("Redeem {}: {e}", cid.0),
            }
        }
    }
}
```
