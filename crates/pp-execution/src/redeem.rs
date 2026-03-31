use std::str::FromStr;
use std::sync::Arc;

use anyhow::Result;
use chrono::Utc;
use rust_decimal::Decimal;
use rust_decimal_macros::dec;
use tracing::{debug, info, warn};

use alloy::primitives::B256;
use polymarket_client_sdk::clob::types::request::CancelMarketOrderRequest;

use pp_core::{AppState, Side, TradeLog};
use crate::AuthClient;

const REDEEM_INTERVAL_SECS: u64 = 60;
const GAMMA_API: &str = "https://gamma-api.polymarket.com";

/// Gamma API market response (only fields we need for resolution)
#[derive(Debug, serde::Deserialize)]
struct GammaMarketResolution {
    #[serde(default)]
    outcomes: Option<String>, // stringified JSON array: "[\"Yes\",\"No\"]"
    #[serde(default)]
    outcome_prices: Option<String>, // stringified JSON array: "[\"1\",\"0\"]"
    #[serde(rename = "outcomePrices", default)]
    outcome_prices_alt: Option<String>, // camelCase variant
    #[serde(default)]
    closed: bool,
}

impl GammaMarketResolution {
    /// Parse the resolution. Returns (outcome_names, outcome_prices) if available.
    fn parse_outcomes(&self) -> Option<(Vec<String>, Vec<String>)> {
        let outcomes_str = self.outcomes.as_deref()?;
        let prices_str = self.outcome_prices.as_deref()
            .or(self.outcome_prices_alt.as_deref())?;

        let outcomes: Vec<String> = serde_json::from_str(outcomes_str).ok()?;
        let prices: Vec<String> = serde_json::from_str(prices_str).ok()?;

        if outcomes.len() != prices.len() || outcomes.is_empty() {
            return None;
        }

        Some((outcomes, prices))
    }

    /// Determine if YES won. Returns Some(true) if YES=1, Some(false) if NO=1, None if unclear.
    fn yes_won(&self) -> Option<bool> {
        let (outcomes, prices) = self.parse_outcomes()?;

        // Find the outcome that resolved to "1"
        for (outcome, price) in outcomes.iter().zip(prices.iter()) {
            if price == "1" {
                let lower = outcome.to_lowercase();
                if lower == "yes" || lower == "up" {
                    return Some(true);
                } else if lower == "no" || lower == "down" {
                    return Some(false);
                }
            }
        }

        // Fallback: first outcome with price "1" = index 0 = YES
        for (i, price) in prices.iter().enumerate() {
            if price == "1" {
                return Some(i == 0);
            }
        }

        None
    }
}

/// Fetch resolution from Gamma API for a specific market
async fn fetch_resolution(
    http: &reqwest::Client,
    condition_id: &str,
) -> Result<Option<bool>> {
    let url = format!("{GAMMA_API}/markets?id={condition_id}");
    let resp = http.get(&url).send().await?;

    if !resp.status().is_success() {
        anyhow::bail!("Gamma API returned {}", resp.status());
    }

    let markets: Vec<GammaMarketResolution> = resp.json().await?;
    let market = match markets.into_iter().next() {
        Some(m) => m,
        None => return Ok(None),
    };

    if !market.closed {
        return Ok(None); // not yet resolved
    }

    Ok(market.yes_won())
}

/// Calculate PnL for a resolved position.
/// If we held YES and YES won: PnL = (1.0 - entry_price) * size_shares
/// If we held YES and YES lost: PnL = -entry_price * size_shares
/// Same logic for NO side with inverted resolution.
fn calculate_pnl(side: Side, entry_price: Decimal, size: Decimal, yes_won: bool) -> Decimal {
    let won = match side {
        Side::Yes => yes_won,
        Side::No => !yes_won,
    };

    if won {
        // Settlement price = 1.0, we paid entry_price per share
        (dec!(1.0) - entry_price) * size
    } else {
        // Settlement price = 0.0, we lose our entire entry
        -entry_price * size
    }
}

/// Background loop: auto-redeem resolved markets.
/// Queries Gamma API for resolution, calculates real PnL.
/// In Live mode, cancels remaining orders for expired markets via SDK.
pub async fn redeem_loop(state: Arc<AppState>, client: Option<Arc<AuthClient>>) -> Result<()> {
    info!("Auto-redeem loop started (interval: {REDEEM_INTERVAL_SECS}s)");
    let http = reqwest::Client::new();

    loop {
        tokio::time::sleep(std::time::Duration::from_secs(REDEEM_INTERVAL_SECS)).await;

        let now = Utc::now();
        let mut to_redeem = Vec::new();

        for entry in state.positions.iter() {
            let position = entry.value();

            if let Some(market) = state.markets.get(&position.condition_id) {
                if market.end_time <= now {
                    to_redeem.push(position.condition_id.clone());
                }
            }
        }

        for condition_id in to_redeem {
            // Cancel any remaining orders for this market via SDK
            if let Some(ref clob) = client {
                if let Ok(market_b256) = B256::from_str(&condition_id.0) {
                    let req = CancelMarketOrderRequest::builder()
                        .market(market_b256)
                        .build();
                    if let Err(e) = clob.cancel_market_orders(&req).await {
                        warn!(condition_id = %condition_id.0, error = %e, "Failed to cancel market orders before redeem");
                    }
                }
            }

            // Query resolution from Gamma API
            let resolution = match fetch_resolution(&http, &condition_id.0).await {
                Ok(Some(yes_won)) => Some(yes_won),
                Ok(None) => {
                    debug!(condition_id = %condition_id.0, "Market not yet resolved on Gamma, will retry next cycle");
                    continue; // Don't redeem yet — wait for resolution
                }
                Err(e) => {
                    warn!(condition_id = %condition_id.0, error = %e, "Gamma resolution fetch failed, will retry");
                    continue;
                }
            };

            if let Some((_, position)) = state.positions.remove(&condition_id) {
                let pnl = match resolution {
                    Some(yes_won) => {
                        let pnl = calculate_pnl(
                            position.side,
                            position.entry_price,
                            position.size,
                            yes_won,
                        );
                        // Update daily PnL and peak balance
                        state.record_pnl(pnl);
                        info!(
                            condition_id = %condition_id.0,
                            side = %position.side,
                            size = %position.size,
                            entry_price = %position.entry_price,
                            yes_won,
                            pnl = %pnl,
                            "Position redeemed with PnL"
                        );
                        Some(pnl)
                    }
                    None => {
                        // Should not reach here due to continue above, but handle gracefully
                        warn!(condition_id = %condition_id.0, "Redeemed without resolution — PnL unknown");
                        None
                    }
                };

                // Log trade
                let trade = TradeLog {
                    condition_id: condition_id.clone(),
                    side: position.side,
                    price: position.entry_price,
                    size: position.size,
                    pnl,
                    is_adverse: pnl.map(|p| p < Decimal::ZERO).unwrap_or(false),
                    timestamp: Utc::now(),
                };
                state.trades.write().push(trade);
            }
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_pnl_yes_wins() {
        // Bought YES at 0.40, size 100 shares, YES won
        let pnl = calculate_pnl(Side::Yes, dec!(0.40), dec!(100), true);
        assert_eq!(pnl, dec!(60.00)); // (1.0 - 0.4) * 100 = 60
    }

    #[test]
    fn test_pnl_yes_loses() {
        // Bought YES at 0.40, size 100 shares, NO won (YES lost)
        let pnl = calculate_pnl(Side::Yes, dec!(0.40), dec!(100), false);
        assert_eq!(pnl, dec!(-40.00)); // -0.4 * 100 = -40
    }

    #[test]
    fn test_pnl_no_wins() {
        // Bought NO at 0.60 (i.e. NO token price), NO won
        let pnl = calculate_pnl(Side::No, dec!(0.60), dec!(50), false);
        // Side::No + yes_won=false → our side won
        assert_eq!(pnl, dec!(20.00)); // (1.0 - 0.6) * 50 = 20
    }

    #[test]
    fn test_pnl_no_loses() {
        // Bought NO at 0.60, YES won (our NO side lost)
        let pnl = calculate_pnl(Side::No, dec!(0.60), dec!(50), true);
        assert_eq!(pnl, dec!(-30.00)); // -0.6 * 50 = -30
    }

    #[test]
    fn test_gamma_resolution_parsing() {
        let market = GammaMarketResolution {
            outcomes: Some(r#"["Yes","No"]"#.into()),
            outcome_prices: Some(r#"["1","0"]"#.into()),
            outcome_prices_alt: None,
            closed: true,
        };
        assert_eq!(market.yes_won(), Some(true));

        let market_no = GammaMarketResolution {
            outcomes: Some(r#"["Yes","No"]"#.into()),
            outcome_prices: Some(r#"["0","1"]"#.into()),
            outcome_prices_alt: None,
            closed: true,
        };
        assert_eq!(market_no.yes_won(), Some(false));
    }

    #[test]
    fn test_gamma_resolution_camel_case() {
        let market = GammaMarketResolution {
            outcomes: Some(r#"["Yes","No"]"#.into()),
            outcome_prices: None,
            outcome_prices_alt: Some(r#"["1","0"]"#.into()),
            closed: true,
        };
        assert_eq!(market.yes_won(), Some(true));
    }
}
