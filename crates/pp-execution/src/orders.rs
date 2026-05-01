use std::str::FromStr;
use std::sync::atomic::Ordering;
use std::sync::Arc;

use anyhow::{Context, Result, bail};
use chrono::Utc;
use rust_decimal::Decimal;
use rust_decimal_macros::dec;
use tracing::info;

use polymarket_sdk::clob::types::{Amount, OrderType, Side as SdkSide};
use polymarket_sdk::types::U256;

use pp_core::{AppState, MakerOrder, OrderStrategy, Position, Signal, Side, TradeLog};
use crate::{AuthClient, AutoSigner};

/// SDK enforces max 2 decimal places on order size (shares).
const LOT_SIZE_SCALE: u32 = 2;

/// Execute a signal via the real SDK order placement path.
pub async fn execute(
    state: &Arc<AppState>,
    signal: &Signal,
    strategy: OrderStrategy,
    client: &AuthClient,
    signer: &AutoSigner,
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

/// Place a post-only maker order via the SDK.
async fn place_maker_order(
    state: &Arc<AppState>,
    signal: &Signal,
    token_id: &pp_core::TokenId,
    token_u256: U256,
    client: &AuthClient,
    signer: &AutoSigner,
) -> Result<()> {
    let (best_bid, best_ask) = {
        let ob = state
            .orderbooks
            .get(&signal.condition_id)
            .ok_or_else(|| anyhow::anyhow!("No orderbook for {:?}", signal.condition_id))?;
        (ob.best_bid, ob.best_ask)
    };
    let (price, shares) = maker_quote(signal.side, signal.size_usdc, best_bid, best_ask)?;

    // Build limit order via SDK
    let order = client
        .limit_order()
        .token_id(token_u256)
        .side(SdkSide::Buy)
        .price(price)
        .size(shares)
        .post_only(true)
        .build()
        .await
        .context("SDK limit_order build failed")?;

    let signed = signer.sign_order(client, order).await?;

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
async fn place_market_order(
    state: &Arc<AppState>,
    signal: &Signal,
    token_id: &pp_core::TokenId,
    token_u256: U256,
    client: &AuthClient,
    signer: &AutoSigner,
) -> Result<()> {
    let (best_bid, best_ask) = {
        let ob = state
            .orderbooks
            .get(&signal.condition_id)
            .ok_or_else(|| anyhow::anyhow!("No orderbook for {:?}", signal.condition_id))?;
        (ob.best_bid, ob.best_ask)
    };
    let fill_price = taker_fill_price(signal.side, best_bid, best_ask)?;

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
        .side(SdkSide::Buy)
        .amount(amount)
        .order_type(OrderType::FOK)
        .build()
        .await
        .context("SDK market_order build failed")?;

    let signed = signer
        .sign_order(client, order)
        .await
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

    state.record_trade(&trade);

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

/// Pure helper: derive maker price + share count from signal side, USDC budget,
/// and current best-bid/best-ask. Extracted from `place_maker_order` so it can
/// be unit-tested without the SDK or live network.
///
/// Returns `(price, shares)` or an error when the price falls outside the
/// `(0, 1)` valid range or when the share count truncates to zero.
pub fn maker_quote(
    side: Side,
    size_usdc: Decimal,
    best_bid: Decimal,
    best_ask: Decimal,
) -> Result<(Decimal, Decimal)> {
    let price = match side {
        Side::Yes => best_bid + dec!(0.01),
        Side::No => best_ask - dec!(0.01),
    };
    if price <= dec!(0) || price >= dec!(1) {
        bail!("Price {price} out of valid range (0, 1)");
    }
    let shares = (size_usdc / price).trunc_with_scale(LOT_SIZE_SCALE);
    if shares <= Decimal::ZERO {
        bail!("Computed shares {shares} ≤ 0 for price {price}");
    }
    Ok((price, shares))
}

/// Pure helper: derive expected fill price for an aggressive market order.
/// Used by `place_market_order`; extracted for unit testing.
pub fn taker_fill_price(side: Side, best_bid: Decimal, best_ask: Decimal) -> Result<Decimal> {
    let fill_price = match side {
        Side::Yes => best_ask,
        Side::No => dec!(1) - best_bid,
    };
    if fill_price <= dec!(0) || fill_price >= dec!(1) {
        bail!("Fill price {fill_price} out of valid range (0, 1)");
    }
    Ok(fill_price)
}

#[cfg(test)]
#[path = "orders_tests.rs"]
mod orders_tests;
