# Cargo.toml (workspace + root)

## Workspace deps swap
- [ ] `polymarket-client-sdk = "0.4"` REMOVE
- [ ] `polymarket_client_sdk_v2 = { version = "0.5", features = ["clob","ws","rtds","gamma","data","heartbeats","ctf","tracing"] }` ADD
- [ ] Re-name внутри проекта via `polymarket_sdk = { package = "polymarket_client_sdk_v2", version = "0.5", features = [...] }` так чтобы ссылки в коде шли через `polymarket_sdk::*` и в логе читалось без "v2"
- [ ] Обновить MSRV если нужно (SDK требует 1.88+; у нас уже 1.95)

## New workspace members
- [ ] crates/pp-venue (trait)
- [ ] crates/pp-venue-polymarket (impl)
- [ ] crates/pp-venue-hyperliquid (stub) — добавить опциональным feature
- [ ] crates/pp-venue-kalshi (stub) — feature "kalshi"

## Cleanup
- [ ] Удалить `polymarket-client-sdk.workspace = true` из root [dependencies]
- [ ] Добавить `pp-venue.workspace = true` (главный trait)

## Bonus
- Возможно нужны: `secrecy = "0.10"`, `rsa = "0.9"` (для Kalshi RSA-PSS), `pem = "3"` — отложить до реализации Kalshi
