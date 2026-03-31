use std::str::FromStr;
use std::sync::atomic::Ordering;
use std::sync::Arc;

use anyhow::{Context, Result, bail};
use chrono::Utc;
use rust_decimal::Decimal;
use rust_decimal_macros::dec;
use tracing::info;

use alloy::signers::Signer;
use polymarket_client_sdk::clob::types::{Amount, OrderType, Side as SdkSide};
use polymarket_client_sdk::types::U256;

use pp_core::{AppState, MakerOrder, OrderStrategy, Position, Signal, Side, TradeLog};
use crate::AuthClient;

/// SDK enforces max 2 decimal places on order size (shares).
const LOT_SIZE_SCALE: u32 = 2;

/// Execute a signal in Demo mode — simulate instant fill.
pub async fn execute_demo(state: &Arc<AppState>, signal: &Signal) -> Result<()> {
    let market = state
        .markets
        .get(&signal.condition_id)
        .ok_or_else(|| anyhow::anyhow!("Market not found: {:?}", signal.condition_id))?;

    let token_id = match signal.side {
        Side::Yes => market.token_yes.clone(),
        Side::No => market.token_no.clone(),
    };
    drop(market);

    let position = Position {
        condition_id: signal.condition_id.clone(),
        token_id: token_id.clone(),
        side: signal.side,
        size: signal.size_usdc,
        entry_price: signal.market_price,
        opened_at: Utc::now(),
    };

    state.positions.insert(signal.condition_id.clone(), position);
    state.metrics.orders_placed.fetch_add(1, Ordering::Relaxed);
    state.metrics.orders_filled.fetch_add(1, Ordering::Relaxed);

    let trade = TradeLog {
        condition_id: signal.condition_id.clone(),
        side: signal.side,
        price: signal.market_price,
        size: signal.size_usdc,
        pnl: None,
        is_adverse: false,
        timestamp: Utc::now(),
    };

    state.trades.write().push(trade.clone());

    // Persist trade to DB
    if let Some(ref db) = state.db {
        if let Err(e) = db.insert_trade(&trade) {
            tracing::warn!(error = %e, "Failed to persist trade to DB");
        }
    }

    info!(
        side = %signal.side,
        price = %signal.market_price,
        size = %signal.size_usdc,
        edge = %signal.edge,
        "[DEMO] Order filled"
    );

    Ok(())
}

/// Execute a signal in Live mode — real SDK order placement.
pub async fn execute_live<S: Signer + Send + Sync>(
    state: &Arc<AppState>,
    signal: &Signal,
    strategy: OrderStrategy,
    client: &AuthClient,
    signer: &S,
) -> Result<()> {
    let market = state
        .markets
        .get(&signal.condition_id)
        .ok_or_else(|| anyhow::anyhow!("Market not found: {:?}", signal.condition_id))?;

    let token_id = match signal.side {
        Side::Yes => market.token_yes.clone(),
        Side::No => market.token_no.clone(),
    };
    drop(market);

    let token_u256 = U256::from_str(&token_id.0)
        .context("Invalid token_id for U256")?;

    match strategy {
        OrderStrategy::Passive | OrderStrategy::Balanced => {
            place_maker_order(state, signal, &token_id, token_u256, client, signer).await?;
        }
        OrderStrategy::Aggressive => {
            place_market_order(state, signal, &token_id, token_u256, client, signer).await?;
        }
    }

    Ok(())
}

/// Map our Side to SDK Side.
/// Yes → Buy (we want the Yes token), No → Buy the No token (both are buys on different tokens).
/// The token_id already selects which token, so we always Buy.
fn sdk_side(side: Side) -> SdkSide {
    match side {
        Side::Yes => SdkSide::Buy,
        Side::No => SdkSide::Buy,
    }
}

/// Place a post-only maker order via the SDK.
async fn place_maker_order<S: Signer + Send + Sync>(
    state: &Arc<AppState>,
    signal: &Signal,
    token_id: &pp_core::TokenId,
    token_u256: U256,
    client: &AuthClient,
    signer: &S,
) -> Result<()> {
    let ob = state
        .orderbooks
        .get(&signal.condition_id)
        .ok_or_else(|| anyhow::anyhow!("No orderbook for {:?}", signal.condition_id))?;

    // Post 1 tick ahead of best bid/ask to sit at top of book
    let price = match signal.side {
        Side::Yes => ob.best_bid + dec!(0.01),
        Side::No => ob.best_ask - dec!(0.01),
    };
    drop(ob);

    if price <= dec!(0) || price >= dec!(1) {
        bail!("Price {price} out of valid range (0, 1)");
    }

    // Compute shares from USDC budget. Truncate to 2dp (SDK LOT_SIZE_SCALE).
    let shares = (signal.size_usdc / price).trunc_with_scale(LOT_SIZE_SCALE);
    if shares <= Decimal::ZERO {
        bail!("Computed shares {shares} ≤ 0 for price {price}");
    }

    // Build limit order via SDK
    let order = client
        .limit_order()
        .token_id(token_u256)
        .side(sdk_side(signal.side))
        .price(price)
        .size(shares)
        .post_only(true)
        .build()
        .await
        .context("SDK limit_order build failed")?;

    let signed = client.sign(signer, order).await
        .context("Order signing failed")?;

    let response = client.post_order(signed).await
        .context("post_order request failed")?;

    // Check SDK response — it can return success=false with an error
    if !response.success {
        let msg = response.error_msg.as_deref().unwrap_or("unknown");
        bail!("Order rejected by CLOB: {msg}");
    }

    let order_id = response.order_id.clone();

    let maker_order = MakerOrder {
        order_id: order_id.clone(),
        condition_id: signal.condition_id.clone(),
        token_id: token_id.clone(),
        side: signal.side,
        price,
        size: shares,
        placed_at: Utc::now(),
    };

    state.maker_orders.insert(order_id.clone(), maker_order);
    state.metrics.orders_placed.fetch_add(1, Ordering::Relaxed);

    info!(
        order_id = %order_id,
        side = %signal.side,
        price = %price,
        shares = %shares,
        edge = %signal.edge,
        "Maker order posted"
    );

    Ok(())
}

/// Place a FOK market order via the SDK (aggressive taker).
async fn place_market_order<S: Signer + Send + Sync>(
    state: &Arc<AppState>,
    signal: &Signal,
    token_id: &pp_core::TokenId,
    token_u256: U256,
    client: &AuthClient,
    signer: &S,
) -> Result<()> {
    let ob = state
        .orderbooks
        .get(&signal.condition_id)
        .ok_or_else(|| anyhow::anyhow!("No orderbook for {:?}", signal.condition_id))?;

    // Estimate fill price from the top of book for position tracking.
    let fill_price = match signal.side {
        Side::Yes => ob.best_ask,
        Side::No => dec!(1) - ob.best_bid,
    };
    drop(ob);

    if fill_price <= dec!(0) || fill_price >= dec!(1) {
        bail!("Fill price {fill_price} out of valid range (0, 1)");
    }

    // Truncate USDC amount to 6 decimals (SDK USDC_DECIMALS).
    let usdc_amount = signal.size_usdc.trunc_with_scale(6);
    if usdc_amount <= Decimal::ZERO {
        bail!("USDC amount {usdc_amount} ≤ 0");
    }

    let amount = Amount::usdc(usdc_amount)
        .context("Invalid USDC amount for market order")?;

    // Build FOK market order via SDK — the SDK resolves price from the book.
    let order = client
        .market_order()
        .token_id(token_u256)
        .side(sdk_side(signal.side))
        .amount(amount)
        .order_type(OrderType::FOK)
        .build()
        .await
        .context("SDK market_order build failed")?;

    let signed = client.sign(signer, order).await
        .context("Market order signing failed")?;

    let response = client.post_order(signed).await
        .context("post_order (market) request failed")?;

    if !response.success {
        let msg = response.error_msg.as_deref().unwrap_or("unknown");
        bail!("Market order rejected by CLOB: {msg}");
    }

    // FOK is fill-or-kill — if we got success the order is fully filled.
    // Record position and trade immediately.
    let position = Position {
        condition_id: signal.condition_id.clone(),
        token_id: token_id.clone(),
        side: signal.side,
        size: signal.size_usdc,
        entry_price: fill_price,
        opened_at: Utc::now(),
    };

    state.positions.insert(signal.condition_id.clone(), position);
    state.metrics.orders_placed.fetch_add(1, Ordering::Relaxed);
    state.metrics.orders_filled.fetch_add(1, Ordering::Relaxed);

    let trade = TradeLog {
        condition_id: signal.condition_id.clone(),
        side: signal.side,
        price: fill_price,
        size: signal.size_usdc,
        pnl: None,
        is_adverse: false,
        timestamp: Utc::now(),
    };

    state.trades.write().push(trade.clone());

    if let Some(ref db) = state.db {
        if let Err(e) = db.insert_trade(&trade) {
            tracing::warn!(error = %e, "Failed to persist aggressive trade to DB");
        }
    }

    info!(
        order_id = %response.order_id,
        side = %signal.side,
        fill_price = %fill_price,
        size_usdc = %signal.size_usdc,
        edge = %signal.edge,
        "Market order filled (aggressive FOK)"
    );

    Ok(())
}

/// Round price to tick size.
pub fn round_tick(price: Decimal, tick: Decimal) -> Decimal {
    if tick.is_zero() {
        return price;
    }
    let ticks = (price / tick).round();
    ticks * tick
}

#[cfg(test)]
mod tests {
    use super::*;
    use rust_decimal_macros::dec;

    #[test]
    fn round_tick_snaps_to_cent() {
        assert_eq!(round_tick(dec!(0.534), dec!(0.01)), dec!(0.53));
        assert_eq!(round_tick(dec!(0.535), dec!(0.01)), dec!(0.54));
        assert_eq!(round_tick(dec!(0.10), dec!(0.01)), dec!(0.10));
    }

    #[test]
    fn round_tick_zero_tick_returns_price() {
        assert_eq!(round_tick(dec!(0.123456), Decimal::ZERO), dec!(0.123456));
    }

    #[test]
    fn shares_truncation_to_2dp() {
        // SDK LOT_SIZE_SCALE = 2: size must have <= 2 decimal places
        let usdc = dec!(10.00);
        let price = dec!(0.33);
        let shares = (usdc / price).trunc_with_scale(LOT_SIZE_SCALE);
        // 10 / 0.33 = 30.303030... → truncated to 30.30
        assert_eq!(shares, dec!(30.30));
        assert!(shares.scale() <= LOT_SIZE_SCALE);
    }

    #[test]
    fn shares_truncation_exact() {
        let usdc = dec!(5.00);
        let price = dec!(0.50);
        let shares = (usdc / price).trunc_with_scale(LOT_SIZE_SCALE);
        assert_eq!(shares, dec!(10.00));
    }

    #[test]
    fn sdk_side_always_buy() {
        // Both Yes and No map to Buy — token_id already selects the token
        assert_eq!(sdk_side(Side::Yes), SdkSide::Buy);
        assert_eq!(sdk_side(Side::No), SdkSide::Buy);
    }
}
