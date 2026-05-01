# src/main.rs — refactor

- [ ] `load_dotenv` — оставить (удобно для dev)
- [ ] `credential_bundle_from_legacy_env` — упростить, убрать `Credentials` (новый SDK derive_or_create_api_key)
- [ ] `wallet_signer_from_env` — переименовать на `polymarket_signer_from_env`, переместить в pp-venue-polymarket
- [ ] `authenticate_runtime` → `bootstrap_venues(state) -> Vec<Arc<dyn Venue>>` итерирует config.venues
- [ ] `spawn_signal_loop` — venue-agnostic уже сейчас
- [ ] `spawn_execution_loop` — принимает signal_rx + Vec<Arc<dyn Venue>>; маршрутизирует signal → venue по venue id
- [ ] `spawn_authenticated_loops` — heartbeat/maker/redeem/fee → каждая лупа итерирует venues
- [ ] `spawn_public_loops` — RTDS/orderbook/discovery — пока polymarket-specific через PolymarketVenue::run_feeds(state)
- [ ] `restore_persisted_state` — добавить venue restoration
- [ ] Удалить `start_heartbeats` panic catch-блок (новый SDK без panic)

## После рефакторинга — main.rs ~150 LOC
