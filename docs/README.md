# 📚 Polymarket Oracle Arbitrage — База знаний

> **Цель:** Заработать на oracle latency арбитраже на Polymarket.
> **Дата:** 31 марта 2026
> **Статус:** Исследование завершено, кодовая база реализована. Текущий фокус — стабилизация runtime, UI/API config flow и verification path.

---

## Навигация

### Бизнес + стратегия

| Документ                             | Что внутри                                                       | ~Строк |
| ------------------------------------ | ---------------------------------------------------------------- | ------ |
| [architecture.md](./architecture.md) | **Monorepo, Rust 2026 patterns, P&L анализ, deps, LLM, UI spec** | 330    |
| [strategy.md](./strategy.md)         | **Бизнес-стратегия.** Как заработать, рынки, тайминг, экономика  | 245    |
| [fees.md](./fees.md)                 | **Комиссии.** Таблицы, формулы, Maker Rebates, Liquidity Rewards | 222    |
| [risks.md](./risks.md)               | **Риски.** Kill switches, adverse selection, heartbeat failure   | 116    |

### Код (pseudocode, разбит по доменам)

| Документ                                       | Crate          | Что внутри                                           | ~Строк |
| ---------------------------------------------- | -------------- | ---------------------------------------------------- | ------ |
| [code/01-types.md](./code/01-types.md)         | `pp-core`      | Типы, ошибки, конфиг. Newtypes, zero deps            | 219    |
| [code/02-feeds.md](./code/02-feeds.md)         | `pp-feeds`     | RTDS (Binance+Chainlink) + CLOB WS orderbook         | 133    |
| [code/03-discovery.md](./code/03-discovery.md) | `pp-discovery` | Gamma API → market classification                    | 149    |
| [code/04-strategy.md](./code/04-strategy.md)   | `pp-strategy`  | Signal loop + fair_price per market type             | 202    |
| [code/05-execution.md](./code/05-execution.md) | `pp-execution` | Orders, heartbeat, cancel/replace, fee cache, redeem | 346    |
| [code/06-risk.md](./code/06-risk.md)           | `pp-risk`      | Risk manager, kill switches, position sizing         | 102    |
| [code/07-server.md](./code/07-server.md)       | `pp-server`    | Axum REST+WS + React dashboard (UI spec)             | 325    |
| [code/08-main.md](./code/08-main.md)           | binary         | Orchestrator: wiring + tokio::try_join!              | 125    |

### Справочники

| Документ                           | Что внутри                                                | ~Строк |
| ---------------------------------- | --------------------------------------------------------- | ------ |
| [api.md](./api.md)                 | **Все API эндпоинты.** WS, REST, error codes, rate limits | 601    |
| [integration.md](./integration.md) | **9 open-source проектов.** Что взять, план по фазам      | 337    |
| [quickstart.md](./quickstart.md)   | **Пошаговый запуск.** От нуля до первой сделки            | 278    |

---

## Суть в 30 секунд

1. **Polymarket** — рынок предсказаний. "BTC up?" → YES/NO по $0–$1
2. **Chainlink oracle** отстаёт от Binance на **15–55 секунд**
3. **В это окно** исход уже известен, контракты ещё не переоценены
4. **Бот** ставит maker order на правильную сторону → 0% fee + rebates
5. **~$250-500/мес на $500 капитал** (честная оценка). $985/день при $10k+

## Текущее состояние репозитория

Это уже не пустой шаблон и не research-only monorepo. В репозитории есть:

- рабочий Rust workspace с доменными crate'ами (`pp-core`, `pp-feeds`, `pp-discovery`, `pp-strategy`, `pp-execution`, `pp-risk`, `pp-server`)
- React/Vite frontend dashboard
- runtime config flow через UI + backend persistence
- DB restore/checkpoint path
- verification target: `make verify`

Если цель — **запустить и проверить текущий проект**, начинай с [quickstart.md](./quickstart.md) и ориентируйся на реальные verification-команды из репозитория, а не на bootstrap-инструкции по созданию monorepo с нуля.

Если цель — **сравнить реализацию с исходным design intent**, используй документы в `docs/code/*` как архитектурный reference, а не как точное описание текущего состояния каждого файла.

---

## Что уже стабилизировано в коде

- Heartbeat в UI трактуется как operational runtime liveness, а не как отдельный режим работы
- Settings flow обновляет runtime config через API и синхронизируется с persisted server state
- backend validation ошибки доходят до UI как содержательные сообщения
- frontend verification включает lint, tests и production build
- targeted tests добавлены для backend config flow и frontend Settings flow

---

## Где смотреть правду о текущем состоянии

- Runtime orchestration: `src/main.rs`
- REST API / config updates: `crates/pp-server/src/api.rs`
- Dashboard tick stream: `crates/pp-server/src/ws.rs`
- Frontend settings flow: `frontend/src/components/Settings.tsx`
- Unified verification path: `Makefile`
- Frontend scripts/deps: `frontend/package.json`

---

## Как читать docs правильно

- `architecture.md`, `strategy.md`, `fees.md`, `risks.md` — design intent и бизнес-контекст
- `docs/code/*.md` — domain-oriented pseudocode / target architecture
- `quickstart.md` — onboarding и operational verification для текущего real-only runtime
- `api.md` — внешний Polymarket/API reference, а не гарантия, что все описанные интеграционные сценарии уже нужны или активны в текущем runtime

---

## Рекомендуемый порядок для продолжения работ

1. `make verify`
2. `cargo run --release`
3. smoke test dashboard и Settings flow
4. только потом — точечные улучшения по реальным gap'ам

---

## Исходная идея стратегии

1. **Polymarket** — рынок предсказаний. "BTC up?" → YES/NO по $0–$1
2. **Chainlink oracle** отстаёт от Binance на **15–55 секунд**
3. **В это окно** исход уже известен, контракты ещё не переоценены
4. **Бот** ставит maker order на правильную сторону → 0% fee + rebates
5. **~$250-500/мес на $500 капитал** (честная оценка). $985/день при $10k+

---

## ⚠️ Критические изменения (фев–мар 2026)

| Дата   | Событие                      | Влияние                                          |
| ------ | ---------------------------- | ------------------------------------------------ |
| 18 фев | **500ms taker delay УДАЛЁН** | Cancel/replace < 200ms обязателен                |
| 18 фев | **Heartbeat API**            | Без heartbeat каждые 10с → все ордера отменяются |
| 12 фев | **5-мин BTC рынки**          | 288 рынков/день, tie = UP wins (bias ~51%)       |
| 30 мар | **Fee Structure V2**         | Fees на ВСЕ категории (кроме Geopolitics)        |
| —      | **Maker > Taker**            | `feeRateBps` обязателен + daily USDC rebates     |

---

## Архитектура (Cargo Workspace)

```
polyprofit/
├── Cargo.toml          # [workspace] — единые версии
├── src/main.rs         # orchestrator → tokio::try_join!
├── crates/
│   ├── pp-core/        # типы, ошибки, конфиг (0 deps)
│   ├── pp-feeds/       # RTDS + CLOB WS
│   ├── pp-discovery/   # Gamma API markets
│   ├── pp-strategy/    # signal + fair_price
│   ├── pp-execution/   # orders, heartbeat, cancel/replace, redeem
│   ├── pp-risk/        # kill switches, position sizing
│   └── pp-server/      # Axum REST + WS
├── frontend/           # React 19 + Vite 6 + Tailwind 4
└── docs/               # ← ты здесь
```

Подробности: [architecture.md](./architecture.md)

---

## Промпт для LLM (скопируй и вставь)

> Ты — Rust-разработчик, создающий арбитражного бота для Polymarket.
>
> **Stack:** Rust (Cargo workspace, edition 2024) + React 19/Vite 6/Tailwind 4.
> **SDK:** `polymarket-client-sdk` v0.4.4 (features: clob, ws, rtds, gamma, heartbeats, ctf, tracing, data).
> **Сервер:** Axum 0.8 (REST + WS + serves React build).
>
> **Правила (март 2026):**
>
> - Heartbeat каждые 8с (лимит 10с) — иначе все ордера отменяются
> - `feeRateBps` обязателен в signed order payload
> - Cancel/replace loop < 200ms (500ms taker delay удалён)
> - Post-only maker orders = 0% fee + daily USDC rebates
>
> **Документация — читать по доменам:**
>
> - `docs/architecture.md` — monorepo, patterns, deps, P&L, UI spec
> - `docs/code/01-types.md` через `08-main.md` — вся логика бота (Rust pseudocode)
> - `docs/api.md` — Polymarket API endpoints, error codes, rate limits
> - `docs/strategy.md` — бизнес-стратегия, 5-min markets, fee timeline
> - `docs/integration.md` — 9 open-source проектов, что взять
> - `docs/fees.md` — fee tables, maker rebates, liquidity rewards
> - `docs/risks.md` — risk management, kill switches
>
> Приоритет: real runtime. Maker-first. Monorepo. Structured logging.
