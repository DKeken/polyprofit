# 🏗️ Architecture — Monorepo, паттерны, выгодность

> Архитектурные решения, Rust 2026 best practices, честный P&L анализ.

---

## Выгодно ли это? Честный P&L анализ

### Три источника дохода

| Источник              | Механика                                                              | Доход/день ($500 капитал) | Доход/день ($5000 капитал) |
| --------------------- | --------------------------------------------------------------------- | ------------------------- | -------------------------- |
| **Oracle lag arb**    | Купить правильную сторону пока Chainlink отстаёт от Binance на 15-55с | ~$7-15                    | ~$70-150                   |
| **Maker rebates**     | 20% от taker fees возвращается makers ежедневно                       | ~$2-5                     | ~$20-50                    |
| **Liquidity rewards** | Дневной USDC пул за quoting (отдельная программа)                     | ~$1-3                     | ~$10-30                    |
| **Итого**             |                                                                       | **~$10-23/день**          | **~$100-230/день**         |

### Консервативный расчёт (maker strategy, $500)

```
Трейды/день:     30 (selective, только strong signals)
Размер трейда:   $25 avg
Win rate:        55% (backtest 61%, -6% на реальность)
Avg edge:        8% (backtest 11.8%, -3.8% на конкуренцию)

Wins:  16.5 × $25 × 0.08 = +$33.00
Losses: 13.5 × $25 × 0.08 = -$27.00
Net trading:                  +$6.00/день
Maker fee:                     $0 (post-only)
Maker rebates:                +$3.00/день
─────────────────────────────────────────
ИТОГО:                        +$9.00/день = $270/мес

Расходы:
  VPS (Hetzner):              -$10/мес
  Polygon gas:                -$2/мес
─────────────────────────────────────────
ЧИСТАЯ ПРИБЫЛЬ:               ~$258/мес на $500
ROI:                          ~51.6%/мес
```

### Что нужно для $985/день (как из видео)

```
Капитал:         $10,000+
Трейды/день:     100+ (multi-market, multi-asset)
Win rate:        60%+ (optimized cancel/replace < 100ms)
VPS:             Colocation < 5ms до Polymarket
5-мин рынки:     288/день (главный объём)
Maker rebates:   ~$50-100/день
```

### ⚠️ Риски которые убивают прибыль

1. **Chainlink ускорит oracle** → окно арбитража сожмётся (вероятность: низкая, но фатальная)
2. **Конкуренция** → edge падает с 8% до 3-4% (уже происходит)
3. **Adverse selection** → без cancel/replace < 200ms makers теряют деньги
4. **Polymarket меняет правила** → уже произошло 4 раза за 3 месяца

### Вердикт

**ДА, выгодно** при условиях:

- Cancel/replace loop < 200ms (без этого — убыток)
- Heartbeat стабилен 24/7
- Капитал ≥ $500 (меньше — комиссии/газ съедают edge)
- Бот работает 24/7 на VPS
- Реалистичные ожидания: $250-500/мес на $500, не $30k/мес

---

## Monorepo — Cargo Workspace

### Структура

```
polyprofit/
├── Cargo.toml                 # [workspace] — корневой
├── Cargo.lock                 # единый lockfile
├── .env.example               # переменные окружения
├── config.toml                # runtime конфиг бота
│
├── crates/
│   ├── pp-core/               # типы, трейты, ошибки — 0 зависимостей
│   │   ├── Cargo.toml
│   │   └── src/
│   │       ├── lib.rs
│   │       ├── types.rs       # AppState, Signal, Position, MakerOrder...
│   │       ├── error.rs       # thiserror enum
│   │       └── config.rs      # Config struct (serde deserialize)
│   │
│   ├── pp-feeds/              # RTDS + CLOB WebSocket
│   │   ├── Cargo.toml         # deps: pp-core, tokio, polymarket-client-sdk
│   │   └── src/
│   │       ├── lib.rs
│   │       ├── rtds.rs        # Binance + Chainlink price streams
│   │       └── orderbook.rs   # CLOB WS orderbook
│   │
│   ├── pp-discovery/          # Gamma API → market registry
│   │   ├── Cargo.toml
│   │   └── src/
│   │       ├── lib.rs
│   │       └── markets.rs     # discover + classify + refresh
│   │
│   ├── pp-strategy/           # signal generation + fair price
│   │   ├── Cargo.toml
│   │   └── src/
│   │       ├── lib.rs
│   │       ├── signal.rs      # edge detection loop
│   │       └── fair_price.rs  # probability per market type
│   │
│   ├── pp-execution/          # orders, heartbeat, cancel/replace, redeem
│   │   ├── Cargo.toml
│   │   └── src/
│   │       ├── lib.rs
│   │       ├── orders.rs      # place order (post-only / FAK / FOK)
│   │       ├── heartbeat.rs   # mandatory 8s heartbeat loop
│   │       ├── maker_loop.rs  # cancel/replace < 200ms
│   │       ├── fee_cache.rs   # feeRateBps cache + refresh
│   │       └── redeem.rs      # CTF auto-redeem
│   │
│   ├── pp-risk/               # risk manager, kill switches
│   │   ├── Cargo.toml
│   │   └── src/
│   │       ├── lib.rs
│   │       └── manager.rs     # can_trade, position_size, drawdown
│   │
│   └── pp-server/             # Axum REST + WS + serves React
│       ├── Cargo.toml
│       └── src/
│           ├── lib.rs
│           ├── api.rs         # GET /status, /positions, /trades
│           └── ws.rs          # WebSocket live stream
│
├── src/
│   └── main.rs                # orchestrator: собирает crates, tokio::try_join!
│
├── frontend/                  # React + Vite + Tailwind
│   ├── package.json
│   ├── vite.config.ts
│   ├── tailwind.config.ts
│   └── src/
│       ├── App.tsx
│       ├── hooks/useBot.ts
│       └── components/
│           ├── Dashboard.tsx
│           ├── EquityCurve.tsx
│           ├── PriceMonitor.tsx
│           └── Controls.tsx
│
└── docs/                      # эта документация
```

### Корневой Cargo.toml

```toml
[workspace]
resolver = "2"
members = [
    "crates/pp-core",
    "crates/pp-feeds",
    "crates/pp-discovery",
    "crates/pp-strategy",
    "crates/pp-execution",
    "crates/pp-risk",
    "crates/pp-server",
]

# Единые версии зависимостей (workspace inheritance)
[workspace.dependencies]
tokio = { version = "1.43", features = ["full"] }
serde = { version = "1.0", features = ["derive"] }
serde_json = "1.0"
tracing = "0.1"
tracing-subscriber = { version = "0.3", features = ["env-filter", "json"] }
anyhow = "1.0"
thiserror = "2.0"
chrono = { version = "0.4", features = ["serde"] }
rust_decimal = { version = "1.36", features = ["serde-with-str"] }
reqwest = { version = "0.12", features = ["json", "rustls-tls"], default-features = false }
axum = { version = "0.8", features = ["ws"] }
tower-http = { version = "0.6", features = ["cors", "fs"] }

# Polymarket
polymarket-client-sdk = { version = "0.3", features = [
    "clob", "ws", "rtds", "gamma", "heartbeats", "ctf", "tracing"
] }

# Финальный бинарник
[package]
name = "polyprofit"
version = "0.1.0"
edition = "2024"

[dependencies]
pp-core.path = "crates/pp-core"
pp-feeds.path = "crates/pp-feeds"
pp-discovery.path = "crates/pp-discovery"
pp-strategy.path = "crates/pp-strategy"
pp-execution.path = "crates/pp-execution"
pp-risk.path = "crates/pp-risk"
pp-server.path = "crates/pp-server"
tokio.workspace = true
tracing.workspace = true
tracing-subscriber.workspace = true
anyhow.workspace = true

[profile.release]
opt-level = 3
lto = "fat"
codegen-units = 1
strip = true
panic = "abort"
```

---

## Rust 2026 Best Practices

### Паттерны которые используем

| Паттерн                       | Где                                         | Зачем                                               |
| ----------------------------- | ------------------------------------------- | --------------------------------------------------- |
| **Workspace inheritance**     | `[workspace.dependencies]`                  | Единые версии во всех crates                        |
| **Edition 2024**              | `Cargo.toml`                                | Rust 2024 edition: `gen` blocks, `async` closures   |
| **Error enum + thiserror**    | `pp-core/error.rs`                          | Типизированные ошибки вместо `anyhow` в библиотеках |
| **anyhow в binary**           | `main.rs`                                   | `anyhow::Result` только в точке входа               |
| **Newtype pattern**           | `Price(Decimal)`, `TokenId(String)`         | Type safety, нельзя перепутать аргументы            |
| **Builder pattern**           | SDK `.limit_order().price().size().build()` | Compile-time корректность ордеров                   |
| **Typestate**                 | SDK auth flow                               | Нельзя торговать без аутентификации                 |
| **Actor model (tokio tasks)** | Каждый crate = отдельная задача             | Изоляция, fail-fast через `try_join!`               |
| **Interior mutability**       | `Arc<RwLock<T>>` для state                  | Lock-free reads, exclusive writes                   |
| **Atomic flags**              | `AtomicBool` для heartbeat health           | Zero-cost health checks без lock                    |
| **Channel-based comms**       | `mpsc` для price updates                    | Decouple feeds → strategy без shared state          |
| **Structured logging**        | `tracing` + spans                           | Correlation IDs, JSON output, filtering             |
| **Config layering**           | `config.toml` → env vars → CLI args         | 12-factor app, different envs                       |

### Зависимости — обоснование каждой

| Crate                   | Версия | Зачем                                           | Альтернативы             |
| ----------------------- | ------ | ----------------------------------------------- | ------------------------ |
| `tokio`                 | 1.43   | Async runtime, единственный выбор для I/O-heavy | —                        |
| `serde`                 | 1.0    | Сериализация — стандарт de facto                | —                        |
| `tracing`               | 0.1    | Structured logging > `log` (spans, async-aware) | `log` (хуже)             |
| `anyhow`                | 1.0    | Ergonomic errors в binary crate                 | `eyre` (тот же API)      |
| `thiserror`             | 2.0    | Derive Error в library crates                   | Ручной impl              |
| `reqwest`               | 0.12   | HTTP client (rustls, no OpenSSL dep)            | `hyper` (low-level)      |
| `axum`                  | 0.8    | Web framework от tokio team, WS built-in        | `actix-web` (тяжелее)    |
| `rust_decimal`          | 1.36   | Точная арифметика для цен (не f64!)             | `bigdecimal` (медленнее) |
| `chrono`                | 0.4    | Даты/время + serde                              | `time` (меньше фич)      |
| `tower-http`            | 0.6    | CORS, static files middleware для axum          | —                        |
| `polymarket-client-sdk` | 0.3    | Official SDK: auth, orders, WS, heartbeat       | `polyfill-rs` (фаза 4)   |

### ⚠️ Что НЕ добавлять

| Crate             | Почему нет                              |
| ----------------- | --------------------------------------- |
| `diesel` / `sqlx` | Нет БД — state in-memory + JSON dump    |
| `sea-orm`         | Overkill для нашего случая              |
| `tonic` / `prost` | gRPC не нужен — один бинарник           |
| `rayon`           | CPU parallelism не нужен — мы I/O bound |
| `polyfill-rs`     | Фаза 4+, не MVP                         |

---

## LLM API — где полезен, где лишний

### ❌ НЕ полезен для oracle lag arb

Oracle lag — чистая **скорость**. LLM добавляет 200-2000ms latency. Для 5-мин рынков с окном 5-30 секунд — это убийственно.

### ✅ Полезен для:

| Задача                    | Как                                                | Latency OK?                   |
| ------------------------- | -------------------------------------------------- | ----------------------------- |
| **Market classification** | LLM парсит question text → MarketType              | Да (при discovery, раз в 60с) |
| **Non-crypto markets**    | Sentiment analysis → predict politics/sports       | Да (не time-critical)         |
| **Anomaly alerts**        | "Объясни почему P&L упал 30% за час"               | Да (async, для dashboard)     |
| **Config tuning**         | "Оптимизируй thresholds по последним 1000 трейдов" | Да (batch, раз в день)        |

### Архитектура с LLM (опционально, фаза 3+)

```
pp-llm/
├── Cargo.toml
└── src/
    ├── lib.rs
    ├── classifier.rs    # classify market question → MarketType (замена regex)
    └── analyzer.rs      # daily P&L analysis, threshold tuning
```

**Подключение:** через OpenRouter API (дешёвые модели: `google/gemma-3-12b`, `mistralai/mistral-small`).
Стоимость: ~$0.10-0.50/день при 300 запросов.

---

## UI — минималистичный как TON

### Принципы

- **Тёмная тема** — zinc-950 фон, без белого
- **Монохром + 1 акцент** — emerald-400 для profit, red-400 для loss
- **Mono шрифт** для чисел — JetBrains Mono
- **Нет лишнего** — только то что влияет на решения
- **Mobile-first** — бот на VPS, смотришь с телефона

### Экраны

**1. Main (одна страница):**

```
┌─────────────────────────────┐
│  $523.47      +$12.30 today │  ← баланс + daily P&L
│  ████████████████░░░░  61%  │  ← win rate bar
├─────────────────────────────┤
│  BTC  $67,421  lag: 23s  🟢 │  ← цена + oracle lag + статус
│  ETH  $3,891   lag: 18s  🟢 │
├─────────────────────────────┤
│  ▁▂▃▅▆▇█▇▆▅▃▂▁▂▃▅▆        │  ← equity curve (sparkline)
├─────────────────────────────┤
│  #1  BTC Up  +2.3%  $0.91  │  ← последние трейды
│  #2  ETH No  -1.1%  $0.45  │
│  #3  BTC Up  +4.7%  $0.88  │
├─────────────────────────────┤
│  [ PAUSE ]    [ KILL ]      │  ← контролы
└─────────────────────────────┘
```

**Stack:** React 19 + Vite 6 + Tailwind 4 + Recharts (для equity curve).
Без shadcn — слишком тяжёлый. Компоненты вручную, 5-6 штук.
