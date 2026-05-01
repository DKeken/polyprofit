//! Order routing primitives shared by all venues.

use anyhow::Result;
use async_trait::async_trait;
use rust_decimal::Decimal;
use serde::{Deserialize, Serialize};

use pp_core::Signal;

/// Opaque per-venue order identifier.
#[derive(Debug, Clone, PartialEq, Eq, Hash, Serialize, Deserialize)]
pub struct OrderId(pub String);

impl std::fmt::Display for OrderId {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        write!(f, "{}", self.0)
    }
}

impl From<String> for OrderId {
    fn from(s: String) -> Self {
        OrderId(s)
    }
}

/// Result of a successful order placement. `filled` is whatever the venue
/// can confirm immediately — for resting orders it will be zero.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PlacedOrder {
    pub id: OrderId,
    pub filled: Decimal,
    pub avg_price: Option<Decimal>,
}

/// Trait every venue implements to accept signals from the strategy layer.
#[async_trait]
pub trait OrderRouter: Send + Sync {
    async fn place_order(&self, signal: &Signal) -> Result<PlacedOrder>;
    async fn cancel_order(&self, id: &OrderId) -> Result<()>;
    async fn cancel_all(&self) -> Result<usize>;
}
