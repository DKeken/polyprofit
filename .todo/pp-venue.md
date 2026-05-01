# pp-venue — NEW crate

## Purpose
Trait abstraction для multi-venue trading.

## crates/pp-venue/Cargo.toml
- pp-core
- async-trait = "0.1"
- anyhow, tokio, tracing
- futures = "0.3"

## crates/pp-venue/src/lib.rs
```rust
pub mod feed;
pub mod order;
pub mod balance;

use anyhow::Result;
use async_trait::async_trait;
use pp_core::{Market, Orderbook, Position, Signal};
use rust_decimal::Decimal;

#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, serde::Serialize, serde::Deserialize)]
pub enum VenueId { Polymarket, Hyperliquid, Kalshi }

impl std::fmt::Display for VenueId { ... }

pub use feed::{PriceFeed, OrderbookFeed};
pub use order::{OrderRouter, PlacedOrder, OrderId};
pub use balance::{BalanceProvider, TokenBalance};

#[async_trait]
pub trait Venue: Send + Sync {
    fn id(&self) -> VenueId;
    fn name(&self) -> &'static str;
    fn is_authenticated(&self) -> bool;

    async fn place_order(&self, signal: &Signal) -> Result<PlacedOrder>;
    async fn cancel_order(&self, id: &OrderId) -> Result<()>;
    async fn cancel_all(&self) -> Result<usize>;

    async fn discover_markets(&self) -> Result<Vec<Market>>;
    async fn balance(&self) -> Result<Vec<TokenBalance>>;
    async fn positions(&self) -> Result<Vec<Position>>;

    async fn heartbeat(&self) -> Result<bool>;
}
```

## crates/pp-venue/src/order.rs
```rust
pub struct OrderId(pub String);
pub struct PlacedOrder { pub id: OrderId, pub filled: Decimal }
```

## crates/pp-venue/src/feed.rs
```rust
use futures::Stream;

#[async_trait]
pub trait PriceFeed: Send + Sync {
    async fn subscribe(&self, assets: Vec<String>) -> Result<Box<dyn Stream<Item = PriceUpdate> + Send + Unpin>>;
}

#[async_trait]
pub trait OrderbookFeed: Send + Sync {
    async fn subscribe(&self, market_ids: Vec<String>) -> Result<Box<dyn Stream<Item = (String, Orderbook)> + Send + Unpin>>;
}
```

## crates/pp-venue/src/balance.rs
```rust
pub struct TokenBalance {
    pub venue: VenueId,
    pub token: String,
    pub amount: Decimal,
    pub usd_value: Option<Decimal>,
}
```
