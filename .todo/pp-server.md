# pp-server — refactor

## api/auth.rs
- [ ] Сейчас пишет credentials в .env файл — ОПАСНО (private key disk plaintext). Заменить:
  - Сохранить в keyring (`keyring` crate) или
  - Шифровать симметрично с локальным ключом из OS keystore
  - Либо в DB redb с чёткой пометкой "secrets table"
  - На минимум: оставить .env но с предупреждением + chmod 600
- [ ] Убрать perform-shutdown-and-restart hack — заменить на in-process re-auth (новый SDK позволяет re-create Client)

## api/admin.rs
- [ ] `wallet_info`: hardcoded Polygon RPC + USDC addresses. Generalize:
  - Per-venue balance fetch через `Venue::balance() -> Vec<TokenBalance>`
  - Frontend получает `[{ token, amount, venue }]`
- [ ] `status` использует POLYMARKET_PRIVATE_KEY env var hardcoded. Заменить на `state.venues.iter().any(|v| v.is_authenticated())`

## api/whales.rs (313 LOC)
- [ ] `market_slug` — hardcoded `https://clob.polymarket.com/markets/{}` — переименовать в `polymarket_market_slug`, добавить per-venue routing
- [ ] DataApiClient — Polymarket-specific; обернуть в `Venue::user_trades(address) -> Vec<Trade>`

## api/jobs.rs
- [ ] `run_scan` / `run_followed_watch` — Polymarket-only. Generalize:
  ```
  for venue in &state.venues {
      venue.scan_whales(state).await;
  }
  ```

## api/trading.rs (350 LOC)
- [ ] `export_trades` хардкодит "polyprofit_trades.csv" — generic ok
- [ ] CSV header — добавить `venue` column
- [ ] Tests: добавить

## api/config.rs
- [ ] OK. Добавить venue_config update в будущем
- [ ] update_config: `update_decimal!` macro — норм
- [ ] При изменении asset_definitions — rebuild registry

## ws.rs (372 LOC)
- [ ] OK. После добавления venue в models — Tick включит venue info
- [ ] PriceInfo: binance/chainlink hardcoded — generalize в `oracles: HashMap<String, OraclePrice>`

## api/dto.rs (267 LOC)
- [ ] OK
