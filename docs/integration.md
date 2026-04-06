# 🔧 Integration — Готовые решения и как их использовать

> Не изобретать велосипед. Взять лучшее из open-source, адаптировать под Rust.

---

## Обзор готовых решений (март 2026)

| Проект                          | Язык       | Что делает                                                      | Брать?                                 |
| ------------------------------- | ---------- | --------------------------------------------------------------- | -------------------------------------- |
| **oracle-lag-sniper**           | Python     | 15-мин BTC/ETH/SOL/XRP oracle arb, backtest, Telegram           | **Да — логика, параметры, backtest**   |
| **polymarket-latency-bot**      | Python     | 5-мин BTC up/down, простой                                      | **Да — структура, signal logic**       |
| **polymarket-kalshi-arb**       | Python+TS  | Cross-platform Poly↔Kalshi                                      | **Да — если добавим Kalshi**           |
| **polymarket-market-maker-bot** | TypeScript | Cancel/replace loop, inventory mgmt, spread farming, Prometheus | **Да — cancel/replace, risk, metrics** |
| **polybot**                     | Java       | Microservices: executor, strategy, analytics, ClickHouse        | **Архитектура — не код**               |
| **polymarket-client-sdk**       | Rust       | Официальный SDK: CLOB, WS, RTDS, Gamma                          | **Да — основа бота (Фаза 1-2)**        |
| **polyfill-rs**                 | Rust       | Форк SDK: SIMD JSON, zero-alloc, 21% быстрее                    | **Да — оптимизация (Фаза 4+)**         |
| **polymarket-hft**              | Rust       | HFT framework: всё-в-одном (early dev)                          | Наблюдать — pre-0.1.0                  |
| **@polymarket/clob-client**     | TS         | Официальный SDK для TS                                          | Нет — фронт не торгует                 |

---

## 1. oracle-lag-sniper — Главный источник логики

**Repo:** `github.com/JonathanPetersonn/oracle-lag-sniper`  
**Версия:** 1.1.0 | **Тесты:** 195 passed | **Coverage:** 71%

### Что взять

**Frozen strategy parameters (проверены на 5017 сделках):**

```
delta_threshold = 0.07%     # минимальное движение от open price
max_entry_price = 0.62      # не покупать дороже $0.62
min_time_remaining = 300s   # не входить в последние 5 минут
max_trade_size = $5         # по умолчанию
```

**Результаты бэктеста (8,876 рынков, фев 2026):**

| Актив     | Сделки    | Win Rate  | Прибыль     | Avg Return |
| --------- | --------- | --------- | ----------- | ---------- |
| BTC       | 1,014     | 61.5%     | $11,550     | 11.4%      |
| ETH       | 1,302     | 62.7%     | $19,268     | 14.8%      |
| XRP       | 1,342     | 61.4%     | $15,599     | 11.6%      |
| SOL       | 1,359     | 60.1%     | $12,826     | 9.4%       |
| **Total** | **5,017** | **61.4%** | **$59,244** | **11.8%**  |

**Ключевые инсайты из backtest (oracle-lag-sniper):**

- 20 из 24 дней прибыльные (83%)
- Максимальный drawdown: $4,734
- Максимальная серия проигрышей: 23 подряд
- Средняя серия проигрышей: 2-3
- OOS (out-of-sample) win rate: 60.7% vs IS 61.9% — стабильно

**Oracle source:**

- По умолчанию: Polymarket RTDS relay (без ключей)
- Прямой: Chainlink Data Streams (нужен API key с `pm-ds-request.streams.chain.link`)

**Config (.env):**

```env
ORACLE_SOURCE=polymarket        # или "chainlink" для прямого доступа
ASSETS=btc,eth,xrp,sol
NOTIONAL_PER_TRADE=5
DAILY_PNL_LIMIT=-150
MAX_CONCURRENT_POSITIONS=16
REDEEM_ENABLED=true
REDEEM_INTERVAL=120
```

**Data pipeline (для бэктеста):**

```bash
oracle-lag-sniper data refresh    # ~50 мин: markets + ticks + prices
oracle-lag-sniper backtest        # все 7 falsification tests
```

### Что НЕ брать

- Python runtime — заменяем на Rust
- Только 15-мин рынки — мы торгуем ВСЕ типы (как в видео)

---

## 2. polymarket-latency-bot — Простая структура

**Repo:** `github.com/learningworship/polymarket-latency-bot`

### Что взять

**Signal logic (простая, рабочая):**

```
Каждую 1 секунду:
  btc_now vs btc_30s_ago
  if move > +0.4% AND poly_up_price in [0.35, 0.65] AND edge > 0.10:
    → BUY UP
  if move < -0.4% AND poly_up_price in [0.35, 0.65] AND edge > 0.10:
    → BUY DOWN
```

**Risk controls:**

- Daily loss limit: $100
- Settlement buffer: не входить в последние 60с
- Spread filter: skip если spread > 0.05
- Max concurrent: 1 позиция
- Hold timeout: 240с макс

**Config.yaml структура** — удобный формат, стоит взять:

```yaml
signal:
  price_change_threshold_pct: 0.4
  lookback_seconds: 30

position:
  max_trade_size_usdc: 20
  hold_seconds: 240

risk:
  daily_loss_limit_usdc: 100
  min_edge: 0.10
  max_spread: 0.05
```

### Что НЕ брать

- Binance WS напрямую — используем RTDS (уже включает Binance)
- Только 5-мин BTC — слишком узко

---

## 3. polymarket-kalshi-arb — Cross-platform

**Repo:** `github.com/CarlosIbCu/polymarket-kalshi-btc-arbitrage-bot`

### Что взять (на фазе 4)

**Арбитраж между платформами:**

```
Polymarket: "BTC Up or Down?" — YES (Up) = $0.52
Kalshi:     "BTC above $65k?" — YES = $0.45
Total cost: $0.52 + $0.45 = $0.97 < $1.00
Profit: $0.03 per pair = risk-free
```

**Когда добавлять:** когда основной oracle arb стабильно прибылен ($5k+ баланс).  
**Stack:** FastAPI backend + Next.js dashboard — можно переписать фронт на наш React.

---

## 4. polymarket-market-maker-bot — Cancel/Replace Reference

**Repo:** `github.com/lorine93s/polymarket-market-maker-bot`  
**Язык:** TypeScript (Node.js 20+) | **Статус:** Production-grade

### Что взять

**Cancel/Replace цикл (КРИТИЧНО после удаления 500ms delay):**

- `QUOTE_REFRESH_RATE_MS` (default 1000ms) — как часто обновлять котировки
- `CANCEL_REPLACE_INTERVAL_MS` (default 500ms) — интервал cancel/replace loop
- `ORDER_LIFETIME_MS` — stale order detection по timestamp
- `BATCH_CANCELLATIONS` — групповая отмена через API

**Inventory management (для maker стратегии):**

- Mirrored YES/NO positioning — сбалансированная экспозиция
- `MAX_EXPOSURE_USD` / `MIN_EXPOSURE_USD` — hard caps
- `INVENTORY_SKEW_LIMIT` — предел перекоса (e.g. 0.3 = 30%)
- `TARGET_INVENTORY_BALANCE` — 0 = нейтральный, bias для направленной торговли

**Spread farming:**

- Mid price из best bid/ask, котировки через `MIN_SPREAD_BPS`
- Passive-first: ордера размещаются off-mid со спредом

**Observability (портируем в Rust):**

- Prometheus `/metrics` endpoint (порт 9305)
- Structured JSON logging (Pino → мы используем `tracing`)
- Метрики: orders, inventory, exposure, spread, profit, quote latency

### Что НЕ брать

- TypeScript runtime — переписываем логику на Rust
- ethers signer — используем Alloy
- Формат конфигурации — у нас config.toml

---

## 5. polybot — Архитектурный референс

**Repo:** `github.com/ent0n29/polybot`  
**Язык:** Java 21 (microservices) | **Статус:** Active development

### Что взять (идеи, не код)

**Микросервисная архитектура:**

| Сервис                      | Порт | Наш аналог            |
| --------------------------- | ---- | --------------------- |
| executor-service            | 8080 | `execution/` модули   |
| strategy-service            | 8081 | `strategy/signal.rs`  |
| analytics-service           | 8082 | Axum `/api/analytics` |
| ingestor-service            | 8083 | `feeds/` модули       |
| infrastructure-orchestrator | 8084 | `main.rs`             |

**Complete-set arbitrage** для Up/Down binaries — полезная стратегия дополнительно к oracle lag.

**Event pipeline:** ClickHouse + Redpanda (Kafka) — для фазы 5 когда нужна аналитика по историческим данным.

**Monitoring stack:** Grafana + Prometheus + Alertmanager — стандартный набор, добавим на фазе 3.

### Что НЕ брать

- Java runtime — абсолютно не наш стек
- Spring Boot overhead — Axum в 10x легковеснее
- 5 отдельных процессов — у нас tokio tasks в одном бинарнике

---

## 6. polymarket-client-sdk (Rust) — Основа всего

**Repo:** `github.com/Polymarket/rs-clob-client`  
**Crate:** `polymarket-client-sdk` v0.3

### Features — что включить

```toml
[dependencies]
polymarket-client-sdk = { version = "0.3", features = [
    "clob",        # ОБЯЗАТЕЛЬНО: ордера, auth, market data
    "ws",          # ОБЯЗАТЕЛЬНО: orderbook WS streaming
    "rtds",        # ОБЯЗАТЕЛЬНО: Binance + Chainlink цены
    "gamma",       # ОБЯЗАТЕЛЬНО: поиск рынков
    "heartbeats",  # ВАЖНО: авто-heartbeat (без него ордера отменяются!)
    "ctf",         # НУЖНО: redeem выигрышей
    "tracing",     # ПОЛЕЗНО: структурированные логи
] }
```

### Ключевые преимущества Rust SDK

1. **Type-level state machine** — нельзя вызвать auth-эндпоинт без auth (compile-time)
2. **Авто tick_size/neg_risk** — `limit_order().build().await` сам подтягивает
3. **Авто heartbeat** — с фичей `heartbeats`
4. **Zero-cost abstractions** — нет dynamic dispatch в hot paths
5. **Alloy signers** — поддержка LocalSigner, AWS KMS, remote signers

Важно: AWS KMS и remote signers — это альтернативные signer backends для той же обязательной EIP-712 подписи. Они не превращают CLOB trading в credentials-only flow и не отменяют requirement на signer.

### Готовые WS стримы

```rust
// Orderbook
ws.subscribe_orderbook(asset_ids)?;

// Prices
ws.subscribe_prices(asset_ids)?;

// Midpoints
ws.subscribe_midpoints(asset_ids)?;

// Authenticated: мои ордера/сделки
ws.subscribe_orders()?;
ws.subscribe_trades()?;
```

---

## 7. polyfill-rs — Высокопроизводительный Rust клиент

**Repo:** `github.com/floor-licker/polyfill-rs`  
**Crate:** `polyfill-rs` v0.3 | Drop-in замена `polymarket-rs-client`

### Что взять (Фаза 4+)

**Бенчмарки vs official SDK:**

| Метрика            | polyfill-rs      | official Rust SDK | Python SDK |
| ------------------ | ---------------- | ----------------- | ---------- |
| Fetch Markets      | **321ms**        | 409ms             | 1,366ms    |
| WS hot path        | **0.28µs**       | ~1µs              | —          |
| JSON parse (480KB) | **2.3ms** (SIMD) | ~4ms              | ~8ms       |

**Ключевые оптимизации:**

- `simd-json` — SIMD-ускоренный JSON парсинг (1.77x быстрее serde_json)
- Zero-allocation hot paths — после warm-up heap не аллоцируется
- HTTP/2 с window 512KB + DNS caching
- Идентичный API → можно подменить SDK без рефакторинга

### Когда переключаться

- Когда latency станет bottleneck (>50ms на cancel/replace)
- Когда конкуренция вырастет и нужен каждый микросекунда
- **НЕ** на MVP — лишняя сложность

---

## 8. polymarket-hft — HFT Framework (наблюдаем)

**Crate:** `polymarket-hft` v0.0.7 | ⚠️ Pre-0.1.0

Полный HFT framework со встроенными клиентами: Data API, CLOB, CLOB WS, Gamma, RTDS + CLI.

### Что потенциально полезно

- Единая точка входа для всех Polymarket API
- Встроенный CLI для быстрых проверок
- Может стать production-ready к Фазе 5

### Что НЕ брать сейчас

- Слишком ранняя версия (0.0.7), API нестабильный
- Нет heartbeat support
- Мало документации

---

## План интеграции

> Бизнес-roadmap по фазам: [strategy.md](./strategy.md#масштабирование-roadmap)

| Фаза               | Что интегрировать                   | Из какого проекта          |
| ------------------ | ----------------------------------- | -------------------------- |
| 1 (MVP)            | Signal parameters, delta thresholds | oracle-lag-sniper          |
| 1                  | `polymarket-client-sdk` как основа  | polymarket-client-sdk      |
| 2 (Maker)          | Cancel/replace, inventory mgmt      | market-maker-bot           |
| 3 (Dashboard)      | Prometheus metrics, Grafana         | market-maker-bot + polybot |
| 4 (Optimization)   | SIMD JSON, zero-alloc hot paths     | polyfill-rs                |
| 5 (Cross-platform) | Kalshi API, ClickHouse pipeline     | kalshi-arb + polybot       |
