# PolyProfit

Автоматизированный торговый бот для [Polymarket](https://polymarket.com/) — предикшн-маркетов на блокчейне Polygon. Использует ценовой арбитраж между оракулами Chainlink/Binance и рыночными ценами Polymarket для генерации прибыли.

**Backend:** Rust (edition 2024) — Cargo workspace из 7 крейтов
**Frontend:** React 19 + Vite 8 + Tailwind 4 + Recharts
**Runtime:** real-only execution через Polymarket CLOB SDK

---

## Содержание

- [Требования](#требования)
- [Установка](#установка)
- [Конфигурация](#конфигурация)
- [Запуск](#запуск)
- [Архитектура](#архитектура)
- [API эндпоинты](#api-эндпоинты)
- [Фронтенд](#фронтенд)
- [Запуск с реальным исполнением](#запуск-с-реальным-исполнением)
- [Troubleshooting](#troubleshooting)

---

## Требования

| Зависимость | Версия | Зачем |
|---|---|---|
| **Rust** | stable latest (edition 2024) | Backend, торговый движок |
| **Bun** | 1.3+ | Frontend runtime, сборка, тесты, пакетный менеджер |

Дополнительно для запуска runtime:
- Polymarket аккаунт с USDC на Polygon
- Private key кошелька (MetaMask export или новый)
- ~0.5 POL для gas (если EOA wallet)

---

## Установка

### 1. Клонировать репозиторий

```bash
git clone <repo-url> polyprofit
cd polyprofit
```

### 2. Собрать backend

```bash
cargo build --release
```

Бинарник появится в `target/release/polyprofit`.

### 3. Собрать frontend

```bash
cd frontend
bun install
bun run build
cd ..
```

Статика соберётся в `frontend/dist/` — Axum сервер отдаёт её автоматически.

### 4. Проверить сборку

```bash
cargo test --workspace
```

Должны пройти все тесты (pp-strategy, pp-execution).

---

## Конфигурация

Проект использует **два** конфиг-файла:

### `config.toml` — параметры стратегии и поведения

```toml
chain_id = 137           # Polygon mainnet

[strategy]
min_edge = "0.05"        # Минимальный edge (5%) для входа
min_prob = "0.15"        # Нижняя граница вероятности
max_prob = "0.85"        # Верхняя граница вероятности
max_spread = "0.06"      # Макс. спред ордербука
order_strategy = "Passive" # "Passive" или "Balanced"
market_refresh_secs = 60 # Интервал обновления рынков
assets = ["BTC", "ETH", "SOL", "XRP"]

[risk]
daily_loss_limit = "-100"   # Стоп-лосс на день (центы)
daily_profit_cap = "100000" # Тейк-профит на день
max_position_pct = "0.05"   # Макс. размер позиции (% от баланса)
max_concurrent = 50         # Макс. одновременных позиций
drawdown_limit = "0.20"     # Макс. просадка от пика (20%)
adverse_fill_pause = 3      # Пауза после adverse fill (сек)
starting_balance = "1000"   # Стартовый баланс (центы)

[server]
port = 3000                    # Порт HTTP/WS сервера
frontend_dist = "frontend/dist" # Путь к собранному фронту
```

#### Добавление нового актива

Добавить блок `[[asset_definitions]]` в `config.toml` и включить символ в `strategy.assets`:

```toml
[[asset_definitions]]
symbol = "DOGE"
binance_symbol = "DOGEUSDT"
keywords = ["doge", "dogecoin"]
```

Изменения кода не требуются.

### `.env` — секреты (НИКОГДА не коммитить)

```env
POLYMARKET_PRIVATE_KEY=0xYOUR_PRIVATE_KEY_HERE
# optional: reuse existing API credentials instead of deriving them on startup
# POLYMARKET_API_KEY=xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx
# POLYMARKET_SECRET=...
# POLYMARKET_PASSPHRASE=...
```

`POLYMARKET_PRIVATE_KEY` — это именно EVM wallet private key (32-byte hex, `0x...`).
Если у вас уже есть Polymarket API key bundle, кладите UUID в `POLYMARKET_API_KEY`, а не в `POLYMARKET_PRIVATE_KEY`.
Backend аутентифицируется через Polymarket CLOB SDK при старте и всё равно требует wallet signer для order signing.

---

## Запуск

### Запуск runtime

```bash
cargo run --release
```

Бот запустится и:
1. Загрузит рынки с Gamma API
2. Подключится к RTDS (live цены Binance/Chainlink)
3. Аутентифицируется через Polymarket CLOB SDK
4. Начнёт генерировать и исполнять реальные торговые сигналы
5. Поднимет dashboard на `http://localhost:3000`

Логи в формате JSON — ожидаемый вывод:

```
{"level":"INFO","message":"polyprofit starting..."}
{"level":"INFO","message":"Config loaded","chain_id":137}
{"level":"INFO","message":"CLOB client authenticated"}
{"level":"INFO","message":"Initial markets discovered","count":47}
{"level":"INFO","message":"Server listening","addr":"0.0.0.0:3000"}
```

### Запуск runtime

```bash
# 1. Прописать реальный ключ в .env
# 2. Запустить
cargo run --release
```

Бот аутентифицируется через Polymarket CLOB SDK и начинает работать в единственном реальном runtime.

### Остановка

`Ctrl+C` — бот корректно завершает все задачи, сохраняет состояние в БД (`polyprofit.db`).

---

## Архитектура

```
polyprofit/
├── src/main.rs              # Точка входа, оркестрация задач
├── config.toml              # Конфигурация
├── .env                     # Секреты
├── crates/
│   ├── pp-core/             # Типы, состояние, БД (redb), конфиг
│   ├── pp-feeds/            # RTDS WebSocket + Orderbook фиды
│   ├── pp-discovery/        # Поиск рынков через Gamma API
│   ├── pp-strategy/         # Сигнальная логика (edge, fair price)
│   ├── pp-execution/        # Ордера, heartbeat, maker loop, redeem
│   ├── pp-risk/             # Risk management (лимиты, drawdown)
│   └── pp-server/           # Axum HTTP API + WebSocket + статика
├── frontend/
│   ├── src/                 # React 19 приложение
│   │   ├── components/      # Dashboard компоненты
│   │   ├── hooks/           # useBot (WS auto-reconnect)
│   │   └── api.ts           # HTTP API клиент
│   └── dist/                # Собранная статика (после bun run build)
└── docs/                    # Документация (architecture, strategy, API, etc.)
```

### Задачи (tokio tasks)

`main.rs` запускает **11 параллельных задач** через `tokio::select!`:

| Задача | Крейт | Описание |
|---|---|---|
| **RTDS Feed** | pp-feeds | Цены через WebSocket |
| **Orderbook Feed** | pp-feeds | Глубина стакана |
| **Heartbeat** | pp-execution | Keepalive CLOB соединения |
| **Signal Loop** | pp-strategy | Генерация торговых сигналов |
| **Executor** | pp-execution | Исполнение ордеров |
| **Maker Loop** | pp-execution | Пассивные лимитные ордера |
| **Discovery Refresh** | pp-discovery | Периодическое обновление рынков |
| **Redeem** | pp-execution | Погашение выигравших позиций |
| **HTTP Server** | pp-server | API + Dashboard + WebSocket |
| **Fee Refresh** | pp-execution | Кэш комиссий |
| **Checkpoint** | pp-core | Сохранение состояния в БД каждые 30с |

---

## API эндпоинты

Сервер слушает на порту из `config.toml` (по умолчанию `3000`).

### REST API

| Метод | Путь | Описание |
|---|---|---|
| `GET` | `/api/status` | Статус бота (PnL, позиции, метрики) |
| `GET` | `/api/positions` | Открытые позиции |
| `GET` | `/api/trades` | История сделок |
| `GET` | `/api/markets` | Активные рынки |
| `GET` | `/api/analytics` | Аналитика и статистика |
| `GET` | `/api/pnl-history` | История P&L |
| `GET` | `/api/db/stats` | Статистика БД |
| `GET` | `/api/trades/export` | Экспорт сделок (CSV) |
| `GET` | `/api/config` | Текущая runtime-конфигурация |
| `PUT` | `/api/config` | Обновить конфигурацию на лету |
| `POST` | `/api/pause` | Приостановить торговлю |
| `POST` | `/api/resume` | Возобновить торговлю |
| `POST` | `/api/kill` | Принудительная остановка |

### WebSocket

```
ws://localhost:3000/ws
```

Автоматическая трансляция обновлений статуса, сделок и позиций в реальном времени. Фронтенд подключается автоматически с auto-reconnect.

---

## Фронтенд

### Режим разработки (hot reload)

```bash
cd frontend
bun run dev
```

Откроется на `http://localhost:5173` с проксированием API и WS на backend (`localhost:3000`).

**Важно:** backend должен быть запущен параллельно (`cargo run --release` в другом терминале).

### Production

```bash
cd frontend
bun run build
```

Собранная статика в `frontend/dist/` — Axum отдаёт её по `/`. Dashboard доступен на том же порту, что и API (`http://localhost:3000`).

### Стек фронтенда

- **React 19** — UI фреймворк
- **Vite 8** — сборщик
- **Tailwind CSS 4** — стилизация (тёмная тема, zinc-950 фон, emerald/red акценты)
- **Recharts** — графики

---

## Запуск с реальным исполнением

### Чеклист

1. **USDC на кошельке** — минимум $100 на Polygon
2. **POL для gas** — ~0.5 POL (если EOA wallet)
3. **Token Allowances** — одноразовый approve USDC + Conditional Tokens (только для EOA; proxy wallets — автоматически)
4. **Risk лимиты** — `daily_loss_limit` настроен
5. **Verification** — `make verify` проходит без ошибок

### Запуск

```bash
# .env
POLYMARKET_PRIVATE_KEY=0x<ваш_реальный_ключ>
```

```bash
cargo run --release
```

### Масштабирование

| Фаза | Капитал | Активы |
|---|---|---|
| 1 | $100 | BTC only |
| 2 | $500 | BTC + ETH |
| 3 | $2,000 | Все 4 актива |
| 4 | $10,000+ | Все + расширение |

---

## Персистентность

Состояние хранится в embedded БД `polyprofit.db` (redb):

- **Runtime config** — сохраняется при изменении через API
- **Trade history** — все сделки
- **Balance checkpoint** — PnL и peak balance
- **Trading date** — для автоматического daily reset

При перезапуске бот восстанавливает всё состояние из БД автоматически.

---

## Переменные окружения

| Переменная | Обязательная | Описание |
|---|---|---|
| `POLYMARKET_PRIVATE_KEY` | Да | Приватный ключ кошелька (0x...) |
| `RUST_LOG` | Нет | Уровень логов (`info`, `debug`, `trace`) |

Пример с verbose логами:

```bash
RUST_LOG=debug cargo run --release
```

---

## Troubleshooting

| Проблема | Причина | Решение |
|---|---|---|
| `CLOB connected: unauthorized` | Неправильный private key | Проверить `.env` |
| `No markets found` | Gamma API даунтайм | Подождать 5 мин, перезапустить |
| RTDS не шлёт данные | Zombie WebSocket | Бот автоматически переподключается |
| `Order rejected: price` | Tick size mismatch | SDK обрабатывает автоматически |
| `Order rejected: post_only` | Ордер исполнился бы сразу | Нормально — retry/skip |
| Высокий reject rate (>20%) | Конкуренция, stale prices | Уменьшить `min_edge` или `Balanced` strategy |
| Win rate < 50% | Слабый edge | Увеличить `min_edge` до 0.15 |
| `POLYMARKET_PRIVATE_KEY must be set` | Нет `.env` или переменная не экспортирована | Создать `.env` с ключом |
| Порт 3000 занят | Другой процесс | Изменить `[server] port` в `config.toml` |
| Frontend не обновляется | Старый билд | `cd frontend && bun run build` |

---

## Документация

Подробная документация в `docs/`:

- `docs/architecture.md` — архитектура, зависимости, паттерны
- `docs/strategy.md` — торговая стратегия, edge-расчёты
- `docs/api.md` — Polymarket API (CLOB, Gamma, RTDS)
- `docs/integration.md` — интеграция SDK
- `docs/fees.md` — комиссии, fee rate, расчёт P&L
- `docs/risks.md` — риск-менеджмент
- `docs/quickstart.md` — пошаговый quickstart
- `docs/code/` — domain-split псевдокод (8 файлов)

---

## Лицензия

Private. All rights reserved.
