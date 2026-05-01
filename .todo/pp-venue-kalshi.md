# pp-venue-kalshi — NEW crate (STUB)

## Purpose
Stub adapter для Kalshi (CFTC-regulated event contracts).

## crates/pp-venue-kalshi/Cargo.toml
```toml
[dependencies]
pp-core.workspace = true
pp-venue.workspace = true
async-trait = "0.1"
anyhow, tokio, tracing, rust_decimal, serde, serde_json, reqwest, base64
kalshi-rs = { version = "0.2", optional = true }
rsa = { version = "0.9", optional = true, features = ["pem","sha2"] }
sha2 = { version = "0.10", optional = true }

[features]
default = []
real = ["dep:kalshi-rs", "dep:rsa", "dep:sha2"]
```

## src/lib.rs
- pub struct KalshiVenue { http, api_key_id, private_key }
- impl `Venue`:
  - place_order: POST `/trade-api/v2/portfolio/orders` с RSA-PSS signed headers
  - cancel: DELETE `/trade-api/v2/portfolio/orders/{order_id}`
  - orderbook: GET `/trade-api/v2/markets/{ticker}/orderbook`
  - positions: GET `/trade-api/v2/portfolio/positions`
  - balance: GET `/trade-api/v2/portfolio/balance`
  - discover: GET `/trade-api/v2/markets`
  - heartbeat: тривиальный health check (ping `/exchange/status`)

## Auth scheme (Kalshi)
Headers per request:
- `KALSHI-ACCESS-KEY` — UUID API key id
- `KALSHI-ACCESS-TIMESTAMP` — ms epoch
- `KALSHI-ACCESS-SIGNATURE` — base64 RSA-PSS(SHA256, MGF1, MAX_LENGTH) of `{ts}{METHOD}{path_no_query}`

## URLs
- Production: `https://api.elections.kalshi.com/trade-api/v2`
- Demo: `https://demo-api.kalshi.co/trade-api/v2`
- WS prod: `wss://api.elections.kalshi.com/trade-api/ws/v2`
- WS demo: `wss://demo-api.kalshi.co/trade-api/ws/v2`

## Differences vs Polymarket
- Yes/No prices в центах (1-99), не decimal 0-1
- USD collateral (custodial)
- Markets идентифицируются ticker'ом (e.g. "KXHARRIS24-LSV"), не condition_id
- Min order size 1 contract
- WS требует auth даже для public channels

## TODO
- [ ] private key load from PEM file
- [ ] RSA-PSS sign helper
- [ ] WS handshake с auth headers (tokio-tungstenite)
- [ ] Map Kalshi side ("yes"/"no") в наш `Side::Yes/No`
