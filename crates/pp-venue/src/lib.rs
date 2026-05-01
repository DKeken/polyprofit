//! Venue abstraction — exchange/marketplace-agnostic trait surface.
//!
//! Each trading venue (Polymarket CLOB, Hyperliquid HIP-4, Kalshi, …) implements
//! [`Venue`]. The execution layer (`pp-execution`) routes signals to the right
//! venue without knowing the underlying transport, signing scheme, or order
//! schema. The strategy layer (`pp-strategy`) stays venue-agnostic.

pub mod balance;
pub mod feed;
pub mod order;

use anyhow::Result;
use async_trait::async_trait;

pub use balance::TokenBalance;
pub use feed::{OrderbookFeed, OrderbookUpdate, PriceFeed, PriceUpdate};
pub use order::{OrderId, OrderRouter, PlacedOrder};

use pp_core::{Market, Position, Signal};

/// Stable identifier for a trading venue. Used as a key in maps and configs.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, serde::Serialize, serde::Deserialize, ts_rs::TS)]
#[ts(export)]
#[serde(rename_all = "snake_case")]
pub enum VenueId {
    Polymarket,
    Hyperliquid,
    Kalshi,
}

impl std::fmt::Display for VenueId {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            Self::Polymarket => write!(f, "polymarket"),
            Self::Hyperliquid => write!(f, "hyperliquid"),
            Self::Kalshi => write!(f, "kalshi"),
        }
    }
}

impl std::str::FromStr for VenueId {
    type Err = String;
    fn from_str(s: &str) -> Result<Self, Self::Err> {
        match s.trim().to_ascii_lowercase().as_str() {
            "polymarket" | "poly" => Ok(Self::Polymarket),
            "hyperliquid" | "hl" => Ok(Self::Hyperliquid),
            "kalshi" => Ok(Self::Kalshi),
            other => Err(format!("unknown venue id: {other}")),
        }
    }
}

/// Top-level trait every venue adapter implements. Combines the read, trade,
/// and lifecycle paths so a single `Arc<dyn Venue>` can drive every loop.
#[async_trait]
pub trait Venue: OrderRouter + Send + Sync {
    fn id(&self) -> VenueId;
    fn name(&self) -> &'static str;
    fn is_authenticated(&self) -> bool;

    /// Discover currently tradeable markets.
    async fn discover_markets(&self) -> Result<Vec<Market>>;

    /// Open positions held on this venue.
    async fn positions(&self) -> Result<Vec<Position>>;

    /// Wallet / collateral balances on this venue.
    async fn balances(&self) -> Result<Vec<TokenBalance>>;

    /// True when the venue's heartbeat / connection liveness check is healthy.
    async fn heartbeat_alive(&self) -> Result<bool>;
}

/// Convenience: bundle a venue with an outbound `Signal` channel.
pub struct VenueRouter {
    pub venue: std::sync::Arc<dyn Venue>,
}

impl VenueRouter {
    pub fn new(venue: std::sync::Arc<dyn Venue>) -> Self {
        Self { venue }
    }

    pub async fn dispatch(&self, signal: &Signal) -> Result<PlacedOrder> {
        self.venue.place_order(signal).await
    }
}
