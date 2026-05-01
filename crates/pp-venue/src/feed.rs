//! Streaming feed traits for price + orderbook data.
//!
//! Implementations return boxed `Stream`s that the runtime drains. Reconnect
//! policies belong to the implementation, not the consumer.

use anyhow::Result;
use async_trait::async_trait;
use chrono::{DateTime, Utc};
use futures::stream::Stream;
use rust_decimal::Decimal;
use serde::{Deserialize, Serialize};

use pp_core::{Asset, ConditionId, Orderbook};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PriceUpdate {
    pub asset: Asset,
    pub source: String,
    pub price: Decimal,
    pub at: DateTime<Utc>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct OrderbookUpdate {
    pub market: ConditionId,
    pub book: Orderbook,
}

pub type BoxedStream<T> = std::pin::Pin<Box<dyn Stream<Item = T> + Send>>;

#[async_trait]
pub trait PriceFeed: Send + Sync {
    async fn subscribe(&self, assets: Vec<Asset>) -> Result<BoxedStream<PriceUpdate>>;
}

#[async_trait]
pub trait OrderbookFeed: Send + Sync {
    async fn subscribe(&self, market_ids: Vec<String>) -> Result<BoxedStream<OrderbookUpdate>>;
}
