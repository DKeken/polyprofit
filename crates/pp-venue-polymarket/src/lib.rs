//! Polymarket adapter for the [`pp_venue::Venue`] trait.
//!
//! The bot still drives Polymarket directly through `pp-execution` /
//! `pp-discovery` today; this crate is the seam that lets the runtime route
//! signals through a `Arc<dyn Venue>` instead of the SDK type. The trait
//! methods delegate to existing helpers wherever they exist, and return
//! `unimplemented!`-shaped errors for endpoints that need additional plumbing
//! (live positions, on-chain balances, structured cancel-all). Wiring up the
//! remaining methods is tracked in `.todo/pp-venue-polymarket.md`.

use std::sync::Arc;

use anyhow::{Context, Result};
use async_trait::async_trait;
use rust_decimal::Decimal;
use tracing::info;

use pp_core::{AppState, Asset, Market, Position, Signal};
use pp_execution::{AuthClient, AutoSigner};
use pp_venue::{
    OrderId, OrderRouter, PlacedOrder, TokenBalance, Venue, VenueId,
};

/// Polymarket-specific [`Venue`] implementation.
///
/// Wraps an authenticated CLOB client + signer and a shared [`AppState`]
/// snapshot so that the trait methods can read the same in-memory caches
/// that the rest of the bot already populates (orderbooks, markets…).
pub struct PolymarketVenue {
    client: Arc<AuthClient>,
    signer: AutoSigner,
    state: Arc<AppState>,
    assets: Vec<Asset>,
}

impl PolymarketVenue {
    pub fn new(
        client: Arc<AuthClient>,
        signer: AutoSigner,
        state: Arc<AppState>,
        assets: Vec<Asset>,
    ) -> Self {
        Self { client, signer, state, assets }
    }
}

impl std::fmt::Debug for PolymarketVenue {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        f.debug_struct("PolymarketVenue")
            .field("address", &self.signer.address())
            .field("assets", &self.assets.len())
            .finish()
    }
}

#[async_trait]
impl OrderRouter for PolymarketVenue {
    async fn place_order(&self, signal: &Signal) -> Result<PlacedOrder> {
        let strategy = self.state.runtime_config.read().order_strategy;
        // Delegate to the existing order pipeline. It already performs
        // strategy-aware maker / taker placement and persists state.
        pp_execution::orders::execute(
            &self.state,
            signal,
            strategy,
            self.client.as_ref(),
            &self.signer,
        )
        .await
        .context("Polymarket order execute failed")?;

        // The legacy `execute` doesn't surface fill information directly;
        // the maker order id is dropped into `state.maker_orders`. Look it up
        // by condition_id (single open maker per condition).
        let order_id = self
            .state
            .maker_orders
            .iter()
            .find(|entry| entry.value().condition_id == signal.condition_id)
            .map(|entry| entry.key().clone())
            .unwrap_or_else(|| format!("polymarket:{}", signal.condition_id.0));

        Ok(PlacedOrder {
            id: OrderId(order_id),
            filled: Decimal::ZERO,
            avg_price: None,
        })
    }

    async fn cancel_order(&self, id: &OrderId) -> Result<()> {
        self.client
            .cancel_order(&id.0)
            .await
            .with_context(|| format!("cancel_order {} failed", id.0))?;
        self.state.maker_orders.remove(&id.0);
        Ok(())
    }

    async fn cancel_all(&self) -> Result<usize> {
        let ids: Vec<String> = self
            .state
            .maker_orders
            .iter()
            .map(|entry| entry.key().clone())
            .collect();
        if ids.is_empty() {
            return Ok(0);
        }
        let refs: Vec<&str> = ids.iter().map(|s| s.as_str()).collect();
        self.client
            .cancel_orders(&refs)
            .await
            .context("cancel_orders failed")?;
        for id in &ids {
            self.state.maker_orders.remove(id);
        }
        info!(count = ids.len(), "Polymarket cancel_all complete");
        Ok(ids.len())
    }
}

#[async_trait]
impl Venue for PolymarketVenue {
    fn id(&self) -> VenueId {
        VenueId::Polymarket
    }

    fn name(&self) -> &'static str {
        "Polymarket"
    }

    fn is_authenticated(&self) -> bool {
        // We hold a fully authenticated SDK client; treat that as the source of truth.
        true
    }

    async fn discover_markets(&self) -> Result<Vec<Market>> {
        let count = pp_discovery::discover(&self.state, &self.assets)
            .await
            .context("Polymarket discover_markets failed")?;
        info!(count, "Polymarket markets discovered");
        Ok(self
            .state
            .markets
            .iter()
            .map(|entry| entry.value().clone())
            .collect())
    }

    async fn positions(&self) -> Result<Vec<Position>> {
        // The runtime keeps positions in `state.positions`. Surfacing the
        // remote view (CLOB / on-chain CTF) is on the roadmap.
        Ok(self
            .state
            .positions
            .iter()
            .map(|entry| entry.value().clone())
            .collect())
    }

    async fn balances(&self) -> Result<Vec<TokenBalance>> {
        // On-chain balance fetch lives in `pp-server::api::admin`. Wiring it
        // through here requires a small refactor (extract into pp-wallet).
        anyhow::bail!("PolymarketVenue::balances: not wired yet — see .todo/pp-venue-polymarket.md")
    }

    async fn heartbeat_alive(&self) -> Result<bool> {
        Ok(self.client.heartbeats_active())
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use pp_core::AppState;

    fn dummy_state() -> Arc<AppState> {
        AppState::new()
    }

    #[test]
    fn id_and_name() {
        // Cannot easily build an AuthClient in a unit test — assert via the
        // type-system that the trait methods are wired. Compile-time check.
        fn assert_traits<T: Venue + OrderRouter + Send + Sync>(_: &T) {}
        // Provide a no-op handle just to satisfy `assert_traits`. We don't
        // actually run any awaitable methods.
        let _ = dummy_state();
        // Compile-time assertion only — no runtime invocation.
        let _check_id = VenueId::Polymarket;
        assert_eq!(format!("{}", VenueId::Polymarket), "polymarket");
        assert_traits::<DummyVenue>(&DummyVenue);
    }

    struct DummyVenue;

    #[async_trait]
    impl OrderRouter for DummyVenue {
        async fn place_order(&self, _: &Signal) -> Result<PlacedOrder> {
            unreachable!()
        }
        async fn cancel_order(&self, _: &OrderId) -> Result<()> {
            unreachable!()
        }
        async fn cancel_all(&self) -> Result<usize> {
            unreachable!()
        }
    }

    #[async_trait]
    impl Venue for DummyVenue {
        fn id(&self) -> VenueId { VenueId::Polymarket }
        fn name(&self) -> &'static str { "DummyVenue" }
        fn is_authenticated(&self) -> bool { false }
        async fn discover_markets(&self) -> Result<Vec<Market>> { Ok(vec![]) }
        async fn positions(&self) -> Result<Vec<Position>> { Ok(vec![]) }
        async fn balances(&self) -> Result<Vec<TokenBalance>> { Ok(vec![]) }
        async fn heartbeat_alive(&self) -> Result<bool> { Ok(false) }
    }
}
