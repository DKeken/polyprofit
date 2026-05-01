# Master plan — 2026-05-01 rework

## Цель
- Бот ожил после Polymarket exchange upgrade 2026-04-28
- Архитектура multi-venue (Polymarket первый, Hyperliquid HIP-4 + Kalshi — стабы)
- Чистый код: dead removed, files <500 LOC, типы в порядке
- Frontend готов к multi-venue (Wallet/Auth абстракция)

## Фазы (последовательно)

### A. SDK swap
- Cargo.toml workspace: `polymarket-client-sdk = "0.4"` → `polymarket_client_sdk_v2 = "0.5"` (литерал имя крейта). Rename re-export в коде на `polymarket_sdk`.
- pp-execution/lib.rs: AutoSigner adapt — новый Client, type alias AuthClient переименовать в PolymarketClient, убрать catch_unwind hack.
- pp-execution/orders.rs: ordering API остался почти такой же (limit_order/market_order builders). Подправить tipy.
- pp-execution/redeem.rs, fee_cache.rs, maker_loop.rs, heartbeat.rs: импорты swapped.
- pp-discovery/lib.rs: `/markets` остался, но добавить `closed=false` явно (default flip).
- src/main.rs: `credential_bundle_from_legacy_env` → use polymarket_sdk::auth::Credentials.

### B. Venue abstraction
- New crate `pp-venue/` с Trait `Venue` (place_order/cancel/orderbook/positions/balance/heartbeat)
- New crate `pp-venue-polymarket/` impl `Venue` поверх SDK
- Stub crates `pp-venue-hyperliquid/`, `pp-venue-kalshi/` с TODO и Trait stubs (без работающего I/O)
- pp-execution рефакторится: принимает `Arc<dyn Venue>`, не SDK напрямую
- pp-strategy остается venue-agnostic
- pp-server status показывает per-venue connection state

### C. Cleanup
- pp-core/src/db.rs (543) разбить на `db/{trades,state,config,whales,equity}.rs`
- Убрать `sdk_side` (no-op)
- Убрать unused `Default` for `AppState` (оставить только new/new_with_db)
- Object dedup: `AssetDef` (config DTO) и `AssetMeta` (runtime) — оставить оба, но с явной конверсией
- pp-server `set_credentials` пишет .env — убрать (плохая практика); хранить в DB
- Все `Option<&BotDb>` чеки через `if let Some(ref db) = state.db` уничтожить — DB всегда (in-memory test variant)
- pp-wallet caching через OnceLock — убрать (race на тестах)

### D. Frontend
- Rename "polyprofit" → "tradingbot" в UI (хотя проект всё ещё polyprofit на crates)
- Multi-venue selector
- Generic Wallet info (не только USDC + MATIC)
- WhaleTracker: добавить platform поле в RowItem

### E. Docs
- README rewrite multi-venue
- docs/architecture.md обновить
- docs/venues.md новый файл
- .env.example отдельно
- Удалить устаревшие docs/code/*

## Не трогаем (out of scope сейчас)
- Реальные Hyperliquid/Kalshi реализации (только traits + stub)
- Backtester
- Telegram alerts
- Advanced order types beyond market/limit

## Phase F — SaaS pivot (см. saas-migration.md)
- Frontend: Vite/React → Next.js 15 App Router
- Backend: single-tenant → multi-tenant control-plane + per-tenant bot workers
- Auth: Auth.js v5 (OAuth + magic link)
- Billing: Stripe subscriptions (Free / Pro $29 / Pro+ $99 / Enterprise)
- Storage: Postgres для shared state, redb sidecar per bot
- Secrets: AWS KMS / Vault для private keys и API credentials
- Hosting: Vercel + Fly.io на старте, AWS позже
- Подробности и pricing — `.todo/saas-migration.md`

## Чек-лист готовности
- [ ] cargo build --workspace --release
- [ ] cargo test --workspace
- [ ] cargo clippy --workspace -- -D warnings
- [ ] frontend bun run build
- [ ] frontend bun test
- [ ] make verify
