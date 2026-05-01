# pp-venue-polymarket — NEW crate

## Purpose
Polymarket-specific impl `Venue` trait, обёртка над polymarket_sdk.

## crates/pp-venue-polymarket/Cargo.toml
```toml
[dependencies]
pp-core.workspace = true
pp-venue.workspace = true
async-trait = "0.1"
anyhow.workspace = true
tokio.workspace = true
tracing.workspace = true
rust_decimal.workspace = true
chrono.workspace = true
alloy.workspace = true
reqwest.workspace = true
serde.workspace = true
serde_json.workspace = true
uuid.workspace = true
polymarket_sdk = { package = "polymarket_client_sdk_v2", version = "0.5", features = ["clob","ws","gamma","data","rtds","heartbeats","ctf","tracing"] }
```

## src/lib.rs
- Re-export submodules:
  - `auth.rs` (PolymarketAuth: load env, instantiate Client)
  - `discovery.rs` (impl PolymarketVenue::discover_markets via gamma)
  - `orders.rs` (impl place/cancel via clob)
  - `balance.rs` (USDC/MATIC fetch via Polygon RPC; later — `polymarket_sdk::data::balances` if available)
  - `feeds.rs` (rtds + orderbook WS)
  - `redeem.rs`
  - `whales.rs` (Data API)

## struct PolymarketVenue
```rust
pub struct PolymarketVenue {
    client: Arc<polymarket_sdk::clob::Client<Authenticated<Normal>>>,
    signer: AutoSigner,
    state: Arc<AppState>,
}

#[async_trait]
impl Venue for PolymarketVenue { ... }
```

## Migration steps
1. Создать crate, добавить как member в workspace
2. Скопировать `pp-execution/src/orders.rs` → `pp-venue-polymarket/src/orders.rs`, переписать в impl `Venue::place_order`
3. Скопировать `pp-discovery/src/lib.rs` → `pp-venue-polymarket/src/discovery.rs`, обернуть в trait method
4. `pp-execution/lib.rs` → удалить, заменить на тонкий router slim crate

## Hosts
- CLOB host: `https://clob.polymarket.com` (после Apr-28 cutover routes to upgraded protocol auto)
- Gamma: `https://gamma-api.polymarket.com`
- Data: `https://data-api.polymarket.com`
- RTDS WS: `wss://ws-live-data.polymarket.com`
- Orderbook WS: `wss://ws-subscriptions-clob.polymarket.com/ws/market`
