# pp-core — cleanup + extension

## db.rs (543 LOC > 500)
- [ ] Разбить на модуль `db/` с подфайлами:
  - `db/mod.rs` — BotDb struct, open(), checkpoint_loop
  - `db/trades.rs` — insert_trade/load_trades/load_recent_trades/trade_count
  - `db/state.rs` — save_state/load_state/checkpoint_balance/load_balance_checkpoint/save_trading_date/load_trading_date
  - `db/config.rs` — save_config/load_config
  - `db/whales.rs` — save_whale/load_whales/delete_whale
  - `db/equity.rs` — save_equity_point/load_equity_history_since/backfill_equity_if_empty

## types.rs (377 LOC) — AppState refactor
- [ ] Сделать `AppState::new(db: BotDb)` — DB всегда. Удалить `Option<BotDb>` шаблон. Тесты используют `BotDb::open(tempfile)`.
- [ ] Удалить дубликат конструкторов `new()`/`new_with_db()`/`Default`. Только `new(db)` + `new_in_memory()` для тестов
- [ ] Generalize for multi-venue:
  - DashMap keys поменять с `ConditionId` на `MarketId(venue, id)` — venue-aware
  - `Position`, `Market`, `Orderbook` → добавить поле `venue: VenueId`
  - НО: на первом этапе оставить только Polymarket, добавить `venue: VenueId` поле со default `Polymarket`. Сделать минимальный шаг чтобы остальной код легко мигрировал.
- [ ] `whale_seen_activity` — использует `format!("{}:{}:{}", ...)` ключ. Норм. Оставить.

## models/
- [ ] models/market.rs:
  - Добавить `pub enum VenueId { Polymarket, Hyperliquid, Kalshi }` (Serialize/Deserialize/TS)
  - `Market`, `Position`, `Orderbook` — добавить `venue: VenueId` (default Polymarket)
- [ ] models/whale.rs: `platform: String` уже есть → enum VenueId
- [ ] models/config/structures.rs: `AssetDef` остается — это TOML DTO

## config.rs
- [ ] `to_runtime_config()` маппит TOML → RuntimeConfig — оставить, добавить venue_definitions если делаем multi-venue
- [ ] Добавить `[[venues]]` секцию в TOML (Polymarket по умолчанию)

## jobs/queue.rs
- [ ] OK — generic JobQueue работает. Убрать `_workers: Vec<JoinHandle>` если не используется (поле _-prefixed → действительно ignored). Поле нужно для drop poll но shutdown через token — пометка корректна.
- [ ] DynJob — оставить, используется в whale path

## error.rs
- [ ] AppError — глянуть, могут быть unused варианты

## ts-rs bindings
- [ ] Перегенерить после изменения моделей: `cargo test --workspace -- --ignored ts_rs`

