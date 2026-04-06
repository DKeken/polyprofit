# 🔌 API Reference — Все эндпоинты Polymarket

> Полная справка для имплементации на Rust. Все эндпоинты, форматы, подводные камни.  
> SDK: `polymarket-client-sdk` v0.3 (Rust) — основной. Альтернативы: `polyfill-rs` v0.3 (21% быстрее, zero-alloc), `polymarket-hft` v0.0.7 (HFT framework, early dev).  
> **Обновлено:** 31 марта 2026 (включая Fee Structure V2 от 30 марта).

---

## Оглавление

1. [Обзор эндпоинтов](#1-обзор-эндпоинтов)
2. [RTDS WebSocket — Цены](#2-rtds-websocket--цены)
3. [CLOB WebSocket — Ордербук](#3-clob-websocket--ордербук)
4. [CLOB REST — Ордера](#4-clob-rest--ордера)
5. [Gamma API — Поиск рынков](#5-gamma-api--поиск-рынков)
6. [User WebSocket — Мои ордера](#6-user-websocket--мои-ордера)
7. [Аутентификация](#7-аутентификация)
8. [Подводные камни](#8-подводные-камни)

---

## 1. Обзор эндпоинтов

| Назначение                     | Endpoint                                               | Auth      | SDK feature |
| ------------------------------ | ------------------------------------------------------ | --------- | ----------- |
| **RTDS (Binance + Chainlink)** | `wss://ws-live-data.polymarket.com`                    | Нет       | `rtds`      |
| **CLOB Orderbook**             | `wss://ws-subscriptions-clob.polymarket.com/ws/market` | Нет       | `ws`        |
| **CLOB User**                  | `wss://ws-subscriptions-clob.polymarket.com/ws/user`   | API creds | `ws`        |
| **CLOB REST**                  | `https://clob.polymarket.com`                          | L2 HMAC   | `clob`      |
| **Gamma (рынки)**              | `https://gamma-api.polymarket.com`                     | Нет       | `gamma`     |
| **Data API**                   | `https://data-api.polymarket.com`                      | Нет       | `data`      |

---

## 2. RTDS WebSocket — Цены

**Endpoint:** `wss://ws-live-data.polymarket.com`  
**Auth:** Не нужна  
**Heartbeat:** Отправлять `PING` каждые **5 секунд**  
**Rust SDK:** feature `rtds`

### Подписка

```json
// Binance (реальная цена, обновляется ~каждые 100ms)
{
  "action": "subscribe",
  "subscriptions": [{
    "topic": "crypto_prices",
    "type": "update",
    "filters": "btcusdt,ethusdt,solusdt,xrpusdt"
  }]
}

// Chainlink (oracle — задержанная, обновляется ~каждые 1-5с)
{
  "action": "subscribe",
  "subscriptions": [{
    "topic": "crypto_prices_chainlink",
    "type": "*",
    "filters": ""
  }]
}
```

### Формат ответа — Binance

```json
{
  "topic": "crypto_prices",
  "type": "update",
  "timestamp": 1753314088421,
  "payload": {
    "symbol": "btcusdt",
    "timestamp": 1753314088395,
    "value": 67234.5
  }
}
```

### Формат ответа — Chainlink

```json
{
  "topic": "crypto_prices_chainlink",
  "type": "update",
  "timestamp": 1753314064237,
  "payload": {
    "symbol": "btc/usd",
    "timestamp": 1753314064213,
    "value": 67234.5
  }
}
```

### Поддерживаемые символы

| Актив | Binance filter | Chainlink symbol |
| ----- | -------------- | ---------------- |
| BTC   | `btcusdt`      | `btc/usd`        |
| ETH   | `ethusdt`      | `eth/usd`        |
| SOL   | `solusdt`      | `sol/usd`        |
| XRP   | `xrpusdt`      | `xrp/usd`        |

### Equity/Stocks (через Pyth Network)

```json
{
  "action": "subscribe",
  "subscriptions": [
    {
      "topic": "equity_prices",
      "type": "update",
      "filters": "{\"symbol\":\"AAPL\"}"
    }
  ]
}
```

Ответ включает `full_accuracy_value` (строка) и `received_at` (ms).

### Отписка

```json
{
  "action": "unsubscribe",
  "subscriptions": [{ "topic": "crypto_prices", "type": "update" }]
}
```

---

## 3. CLOB WebSocket — Ордербук

**Endpoint:** `wss://ws-subscriptions-clob.polymarket.com/ws/market`  
**Auth:** Не нужна для market data  
**Heartbeat:** `PING` каждые **10 секунд**, иначе disconnect  
**Rust SDK:** feature `ws` → `WsClient::subscribe_orderbook()`

### Подписка (raw)

```json
{
  "assets_ids": ["TOKEN_ID_YES", "TOKEN_ID_NO"],
  "type": "market",
  "custom_feature_enabled": true
}
```

> **`custom_feature_enabled: true`** — включает событие `best_bid_ask`. Без него — только `book` и `price_change`.

### Типы событий

| Событие            | Что                                     | Когда                          |
| ------------------ | --------------------------------------- | ------------------------------ |
| `book`             | Полный snapshot ордербука (bids + asks) | При подписке                   |
| `price_change`     | Изменение уровней цен                   | Каждый tick                    |
| `best_bid_ask`     | Только лучшие bid/ask                   | Нужен `custom_feature_enabled` |
| `last_trade_price` | Последняя сделка                        | Каждая сделка                  |
| `market_resolved`  | Рынок рассчитан                         | Один раз                       |

### Пример: `book`

```json
{
  "event_type": "book",
  "asset_id": "TOKEN_ID",
  "market": "CONDITION_ID",
  "timestamp": "1711382400",
  "bids": [
    { "price": "0.48", "size": "1500" },
    { "price": "0.47", "size": "3000" }
  ],
  "asks": [
    { "price": "0.52", "size": "2000" },
    { "price": "0.53", "size": "1000" }
  ]
}
```

### Пример: `best_bid_ask`

```json
{
  "event_type": "best_bid_ask",
  "asset_id": "TOKEN_ID",
  "best_bid": "0.48",
  "best_ask": "0.52"
}
```

### Rust SDK (рекомендовано)

```rust
use polymarket_client_sdk::clob::ws::Client;
use futures::StreamExt;

let ws = Client::default();
let stream = ws.subscribe_orderbook(vec!["TOKEN_ID".into()])?;
let mut stream = Box::pin(stream);

while let Some(Ok(book)) = stream.next().await {
    println!("Bids: {}, Asks: {}", book.bids.len(), book.asks.len());
}
```

Доступные стримы SDK:

- `subscribe_orderbook()` — bids/asks
- `subscribe_prices()` — price changes
- `subscribe_midpoints()` — midpoints
- `subscribe_orders()` — мои ордера (**auth**)
- `subscribe_trades()` — мои сделки (**auth**)

---

## 4. CLOB REST — Ордера

**Base URL:** `https://clob.polymarket.com`  
**Chain ID:** 137 (Polygon)  
**Auth:** L2 HMAC (API key + secret + passphrase)  
**Rust SDK:** feature `clob`

### Типы ордеров

| Тип     | Enum             | Поведение                                           | Fee           |
| ------- | ---------------- | --------------------------------------------------- | ------------- |
| **GTC** | `OrderType::GTC` | Лимитка, живёт пока не исполнена/отменена           | 0% если maker |
| **GTD** | `OrderType::GTD` | Как GTC но с expiration timestamp                   | 0% если maker |
| **FOK** | `OrderType::FOK` | Fill-or-Kill: всё целиком или отмена                | Taker fee     |
| **FAK** | `OrderType::FAK` | Fill-and-Kill: заполни сколько есть, отмени остаток | Taker fee     |

### Rust: Лимитный ордер (GTC, maker = 0% fee)

```rust
use polymarket_client_sdk::clob::types::Side;
use rust_decimal_macros::dec;

let order = clob.limit_order()
    .token_id("TOKEN_ID")
    .price(dec!(0.50))       // $0.50 за контракт
    .size(dec!(100))         // 100 shares
    .side(Side::Buy)
    .build()
    .await?;

let signed = clob.sign(&signer, order).await?;
let resp = clob.post_order(signed).await?;
```

> В production runtime этот шаг обычно оборачивают в auto-signing layer: приложение само вызывает signer backend перед `post_order`, но это всё ещё реальная EIP-712 подпись, а не signerless trading.

> L2 API credentials (`POLYMARKET_API_KEY` / `POLYMARKET_SECRET` / `POLYMARKET_PASSPHRASE`) нужны для authenticated CLOB requests, но сами по себе не заменяют wallet signer.

### Rust: Лимитный ордер POST-ONLY (гарантия maker, 0% fee)

```rust
let order = clob.limit_order()
    .token_id("TOKEN_ID")
    .price(dec!(0.50))
    .size(dec!(100))
    .side(Side::Buy)
    .post_only(true)         // КЛЮЧ: отклоняет если бы исполнился сразу
    .build()
    .await?;
```

### Rust: Market ордер (FOK, taker fee!)

```rust
use polymarket_client_sdk::clob::types::{Amount, OrderType};

let order = clob.market_order()
    .token_id("TOKEN_ID")
    .amount(Amount::usdc(dec!(25))?)  // $25 USDC
    .side(Side::Buy)
    .order_type(OrderType::FOK)
    .build()
    .await?;

let signed = clob.sign(&signer, order).await?;
let resp = clob.post_order(signed).await?;
```

> Даже для gasless / relayed execution пользовательский order payload остаётся подписанным. Auto-signing = автоматический вызов signer backend, а не отказ от подписи.

### Rust: GTD ордер (с expiration)

```rust
let order = clob.limit_order()
    .token_id("TOKEN_ID")
    .price(dec!(0.50))
    .size(dec!(100))
    .side(Side::Buy)
    .expiration(Utc::now() + Duration::minutes(14)) // истекает через 14 мин
    .build()
    .await?;
```

### REST: Отмена ордеров

```rust
// Отменить один
clob.cancel("ORDER_ID").await?;

// Отменить все
clob.cancel_all().await?;
```

### REST: Получить мои ордера

```rust
use polymarket_client_sdk::clob::types::request::OpenOrdersRequest;
let orders = clob.open_orders(&OpenOrdersRequest::default()).await?;
```

### REST: Получить orderbook (без WS)

```rust
let book = clob.order_book("TOKEN_ID").await?;
let mid = clob.midpoint("TOKEN_ID").await?;
let price = clob.price("TOKEN_ID", Side::Buy).await?;
```

### Tick Size

Каждый рынок имеет `minimum_tick_size` (обычно `0.01` или `0.001`). Цена ордера должна быть кратна tick size. **Rust SDK автоматически подтягивает** tick_size и neg_risk при `.build().await`.

### Neg Risk

Некоторые рынки используют `neg_risk = true` (negative risk markets). Это влияет на то, какой exchange contract используется для подписи. **Rust SDK обрабатывает это автоматически**.

---

## 5. Gamma API — Поиск рынков

**Base URL:** `https://gamma-api.polymarket.com`  
**Auth:** Не нужна  
**Rust SDK:** feature `gamma`

### Получить активные рынки

```
GET /markets?active=true&closed=false&limit=100&offset=0
```

### Фильтры

| Параметр    | Тип    | Пример        | Описание        |
| ----------- | ------ | ------------- | --------------- |
| `active`    | bool   | `true`        | Только активные |
| `closed`    | bool   | `false`       | Не закрытые     |
| `limit`     | int    | `100`         | Макс за запрос  |
| `offset`    | int    | `0`           | Пагинация       |
| `order`     | string | `volume_24hr` | Сортировка      |
| `ascending` | bool   | `false`       | Порядок         |
| `tag_id`    | string | `crypto`      | Категория       |

### Ключевые поля ответа

```json
{
  "question": "Will Bitcoin be above $65,000 on March 29?",
  "conditionId": "0xabc...",
  "clobTokenIds": ["TOKEN_YES", "TOKEN_NO"],
  "endDate": "2026-03-29T00:00:00Z",
  "minimum_tick_size": 0.01,
  "neg_risk": false,
  "volume24hr": 125000,
  "active": true,
  "closed": false
}
```

### Rust SDK

```rust
use polymarket_client_sdk::gamma;

let client = gamma::Client::default();
let request = gamma::types::request::MarketsRequest::builder()
    .active(true)
    .closed(false)
    .limit(100)
    .build();
let markets = client.markets(&request).await?;
```

### Получить events (группы рынков)

```
GET /events?active=true&closed=false&limit=100
```

Event содержит массив `markets[]`. Например, event "Bitcoin March 29" может содержать рынки "above $64k", "above $65k", "above $66k" итд.

---

## 6. User WebSocket — Мои ордера

**Endpoint:** `wss://ws-subscriptions-clob.polymarket.com/ws/user`  
**Auth:** API credentials required  
**Rust SDK:** `subscribe_orders()`, `subscribe_trades()`

Позволяет в реальном времени видеть:

- Исполнение моих ордеров
- Частичные заполнения
- Отмены

```rust
let ws = WsClient::authenticated(&api_creds);
let orders_stream = ws.subscribe_orders()?;
let trades_stream = ws.subscribe_trades()?;
```

---

## 7. Аутентификация

### Signature Types

| Type | Значение   | Когда                                      |
| ---- | ---------- | ------------------------------------------ |
| `0`  | EOA        | MetaMask, hardware wallet, raw private key |
| `1`  | Proxy      | Email/Magic wallet                         |
| `2`  | GnosisSafe | Browser wallet proxy                       |

### Rust: Аутентификация

```rust
use polymarket_client_sdk::clob::{Client, Config};
use polymarket_client_sdk::clob::types::SignatureType;
use polymarket_client_sdk::auth::LocalSigner;
use polymarket_client_sdk::POLYGON;
use std::str::FromStr;

let signer = LocalSigner::from_str(&private_key)?
    .with_chain_id(Some(POLYGON));

// EOA (простой private key)
let client = Client::new("https://clob.polymarket.com", Config::default())?
    .authentication_builder(&signer)
    .authenticate()
    .await?;

// GnosisSafe (funder auto-derived via CREATE2)
let client = Client::new("https://clob.polymarket.com", Config::default())?
    .authentication_builder(&signer)
    .signature_type(SignatureType::GnosisSafe)
    .authenticate()
    .await?;
```

### Token Allowances (EOA only)

**Нужно один раз:**

- USDC: `0x2791Bca1f2de4661ED88A30C99A7a9449Aa84174`
- Conditional Tokens: `0x4D97DCd97eC945f40cF65F87097ACe5EA0476045`

Approve для:

- `0x4bFb41d5B3570DeFd03C39a9A4D8dE6Bd8B8982E` (Main exchange)
- `0xC5d563A36AE78145C45a50134d48A1215220f80a` (Neg risk markets)
- `0xd91E80cF2E7be2e162c6513ceD06f1dD0dA35296` (Neg risk adapter)

Proxy/GnosisSafe wallets — allowances set automatically.

### Heartbeat API (КРИТИЧНО — январь 2026)

**Без heartbeat ВСЕ открытые ордера отменяются через 10-15 секунд.**

Правила:

- Отправлять heartbeat каждые **10 секунд** (буфер: ещё 5 секунд)
- Включать `heartbeat_id` из предыдущего ответа. Первый запрос — пустая строка.
- Если отправить expired ID → сервер вернёт `400` с правильным ID. Обновить и retry.

```rust
// С SDK feature "heartbeats" — автоматический heartbeat:
polymarket-client-sdk = { version = "0.3", features = ["heartbeats"] }

// Ручная реализация (если нужен контроль):
let mut heartbeat_id = String::new();
loop {
    let resp = clob.post_heartbeat(&heartbeat_id).await?;
    heartbeat_id = resp.heartbeat_id;
    tokio::time::sleep(Duration::from_secs(8)).await; // 8с для запаса
}
```

### Fee Rate Endpoint (ОБЯЗАТЕЛЬНО для fee-enabled рынков)

```
GET https://clob.polymarket.com/fee-rate?token_id={token_id}
```

**НИКОГДА не хардкодить fee.** Polymarket может изменить ставку в любой момент.

SDK делает это автоматически при создании ордера. Если подписываете ордер вручную — поле `feeRateBps` **обязательно** в signed payload:

```json
{
  "salt": "...",
  "maker": "0x...",
  "signer": "0x...",
  "taker": "0x...",
  "tokenId": "...",
  "makerAmount": "50000000",
  "takerAmount": "100000000",
  "feeRateBps": "150"
}
```

Если `feeRateBps` не совпадает с текущей fee rate рынка → ордер **отклоняется**.

---

## 8. Подводные камни

### 1. Zombie WebSocket

WS может быть "жив" (ping/pong OK), но не слать данных. Мониторить `last_real_data` — если >30с без данных → реконнект.

### 2. Tick size mismatch

Ордер с ценой не кратной tick_size → reject. Rust SDK обрабатывает автоматически при `.build().await`.

### 3. Neg risk mismatch

Ордер с неправильным neg_risk flag → reject. Rust SDK обрабатывает автоматически.

### 4. Post-only reject

Post-only ордер, который бы сматчился сразу → **отклоняется** (не исполняется). Это нормально — retry с другой ценой или fallback на FAK.

### 5. Order Error Codes (полный список из docs.polymarket.com)

| Error                              | Описание                           | Что делать                                |
| ---------------------------------- | ---------------------------------- | ----------------------------------------- |
| `INVALID_ORDER_MIN_TICK_SIZE`      | Цена не кратна tick_size рынка     | Округлить цену через `round_to_tick()`    |
| `INVALID_ORDER_MIN_SIZE`           | Размер ордера ниже минимального    | Увеличить размер                          |
| `INVALID_ORDER_DUPLICATED`         | Дубликат — такой же ордер уже есть | Пропустить                                |
| `INVALID_ORDER_NOT_ENOUGH_BALANCE` | Недостаточно баланса или allowance | Проверить USDC + allowances               |
| `INVALID_ORDER_EXPIRATION`         | GTD timestamp в прошлом            | Обновить expiration                       |
| `INVALID_POST_ONLY_ORDER_TYPE`     | `post_only` с FOK/FAK              | Убрать post_only или использовать GTC/GTD |
| `INVALID_POST_ONLY_ORDER`          | Post-only ордер пересёк бы спред   | Retry с менее агрессивной ценой           |
| `FOK_ORDER_NOT_FILLED_ERROR`       | FOK не смог заполниться полностью  | Retry с FAK или увеличить price           |
| `INVALID_ORDER_ERROR`              | Системная ошибка при вставке       | Retry через 1с                            |
| `EXECUTION_ERROR`                  | Системная ошибка при исполнении    | Retry через 1с                            |
| `ORDER_DELAYED`                    | Ордер задержан (market conditions) | Ждать — ордер в очереди                   |
| `DELAYING_ORDER_ERROR`             | Ошибка при задержке ордера         | Retry                                     |
| `MARKET_NOT_READY`                 | Рынок ещё не принимает ордера      | Ждать — рынок ещё не открыт               |

### 6. Rate limits (актуальные, май 2025+)

| Endpoint             | Burst (10s) | Sustained (10min) | Per second                        |
| -------------------- | ----------- | ----------------- | --------------------------------- |
| POST /order          | 500         | 3,000             | **50/s** burst, **5/s** sustained |
| DELETE /order        | 500         | 3,000             | **50/s** burst, **5/s** sustained |
| GET /books (API)     | 50          | —                 | 5/s                               |
| GET /books (website) | 300         | —                 | 30/s                              |
| GET /price           | 100         | —                 | 10/s                              |
| GET /markets/{id}    | 50          | —                 | 5/s                               |

Batch orders (до 15 за вызов) — **обязательны** для экономии rate limit.

### 7. Token IDs меняются

Каждый новый 15-мин рынок получает новые token_ids. Обновлять через Gamma API каждые 60 секунд.

### 8. Market resolution

После resolution рынок исчезает из CLOB. Нужно отслеживать `market_resolved` событие в WS и auto-redeem.

### 9. feeRateBps отсутствует в подписи

Без `feeRateBps` в signed payload → ордер **отклоняется** в fee-enabled рынках. SDK v0.3 обрабатывает автоматически. При ручной подписи — обязательно включать.

### 10. Sports markets — особые правила

- Лимитные ордера **автоматически отменяются** когда игра начинается
- Marketable ордера имеют **3-секундную задержку** перед matching
- Время начала игры может сдвигаться → мониторить ордера

### 11. Order statuses (trade lifecycle)

| Статус      | Финальный? | Описание                                 |
| ----------- | ---------- | ---------------------------------------- |
| `MATCHED`   | Нет        | Сматчен, отправлен на onchain submission |
| `MINED`     | Нет        | Замайнен, ещё не finality                |
| `CONFIRMED` | **Да**     | Подтверждён — сделка успешна             |
| `RETRYING`  | Нет        | Транзакция failed — ретрай               |
| `FAILED`    | **Да**     | Финальный провал, не ретраится           |

---

## 9. Альтернативные Rust клиенты

> Подробный обзор, бенчмарки и рекомендации по фазам: [integration.md](./integration.md#6-polymarket-client-sdk-rust--основа-всего)

| Фаза             | SDK                          | Почему                                  |
| ---------------- | ---------------------------- | --------------------------------------- |
| MVP (1-2)        | `polymarket-client-sdk` v0.3 | Стабильный, официальный, авто-heartbeat |
| Оптимизация (4+) | `polyfill-rs` v0.3           | 21% быстрее, SIMD JSON, zero-alloc      |
| Эксперимент      | `polymarket-hft` v0.0.7      | Всё-в-одном, но pre-0.1.0               |
