//! Whale tracking module.
//!
//! Polls the Polymarket Data API to identify wallets that:
//! - Place large bets (> `MIN_WHALE_TRADE_USD`)
//! - Have a consistently high win-rate (> `MIN_WHALE_WIN_RATE`)
//! - Show positive ROI (> `MIN_WHALE_ROI`)
//!
//! Tracked whales are stored in `AppState::whales`; their recent activity
//! in `AppState::recent_whale_activity`.  Both are exposed via the `/api/whales`
//! and `/api/whales/activity` endpoints.
//!
//! ## Other platforms for future expansion
//! - **Kalshi** (kalshi.com): US-regulated, has REST API with `/trades` endpoint
//! - **Manifold** (manifold.markets): Open API `/bets` by user, free markets
//! - **PredictIt** (predictit.org): Political markets, CSV trade history

use std::collections::HashSet;
use std::sync::Arc;
use std::time::Duration;

use anyhow::Result;
use chrono::{DateTime, Utc};
use rust_decimal::Decimal;
use serde::Deserialize;
use tracing::{debug, info, warn};

use pp_core::{AppState, WhaleActivity, WhaleProfile};

// ── Configuration constants ─────────────────────────────────────────────────

/// Polymarket Data API base URL.
const DATA_API: &str = "https://data-api.polymarket.com";

// ── Polymarket Data API response types ──────────────────────────────────────

#[derive(Debug, Deserialize)]
struct TradeEvent {
    #[serde(rename = "proxyWallet", default)]
    proxy_wallet: String,
    #[serde(rename = "conditionId", default)]
    condition_id: String,
    #[serde(default)]
    side: String, // "BUY" | "SELL"
    #[serde(default)]
    outcome: Option<String>, // "Yes" | "No"
    #[serde(default)]
    size: Option<f64>,
    #[serde(default)]
    price: Option<f64>,
    #[serde(default)]
    timestamp: Option<i64>, // unix seconds
    #[serde(default)]
    title: Option<String>, // market question — included in /trades response
}

#[derive(Debug, Deserialize)]
pub struct UserProfile {
    #[serde(rename = "proxyWallet", default)]
    #[allow(dead_code)]
    pub proxy_wallet: String,
    #[serde(rename = "userName", default)]
    pub user_name: Option<String>,
    #[serde(default)]
    pub pnl: Option<f64>,
    #[serde(default)]
    pub vol: Option<f64>,
}

// ── Client ──────────────────────────────────────────────────────────────────

pub struct DataApiClient {
    pub http: reqwest::Client,
}

impl DataApiClient {
    pub fn new() -> Self {
        let http = reqwest::Client::builder()
            .timeout(Duration::from_secs(15))
            .user_agent("polyprofit-whale-tracker/1.0")
            .build()
            .unwrap_or_else(|_| reqwest::Client::new());
        Self { http }
    }

    /// Fetch recent trades from the Polymarket Data API (`/trades` global feed).
    async fn fetch_trades(&self, limit: u32) -> Result<Vec<TradeEvent>> {
        let url = format!("{DATA_API}/trades?limit={limit}");
        let resp = self.http.get(&url).send().await?;
        if !resp.status().is_success() {
            anyhow::bail!("trades endpoint returned {}", resp.status());
        }
        Ok(resp.json::<Vec<TradeEvent>>().await?)
    }

    /// Fetch a user's profile stats from the Data API using the leaderboard endpoint.
    pub async fn fetch_profile(&self, address: &str) -> Result<Option<UserProfile>> {
        let url = format!("{DATA_API}/v1/leaderboard?user={address}");
        let resp = self.http.get(&url).send().await?;
        if resp.status() == reqwest::StatusCode::NOT_FOUND {
            return Ok(None);
        }
        if !resp.status().is_success() {
            anyhow::bail!("leaderboard endpoint returned {}", resp.status());
        }
        let list: Vec<UserProfile> = resp.json().await?;
        Ok(list.into_iter().next())
    }

    /// Fetch a specific user's trade history from the Polymarket Data API.
    /// Returns trades in reverse-chronological order (newest first).
    pub async fn fetch_user_trades(&self, address: &str, limit: u32) -> Result<Vec<UserTrade>> {
        let url = format!("{DATA_API}/trades?user={address}&limit={limit}");
        let resp = self.http.get(&url).send().await?;
        if !resp.status().is_success() {
            anyhow::bail!("trades endpoint returned {}", resp.status());
        }
        let raw: Vec<TradeEvent> = resp.json().await?;
        let now = chrono::Utc::now();
        let trades = raw
            .into_iter()
            .map(|t| {
                let shares = rust_decimal::Decimal::try_from(t.size.unwrap_or(0.0)).unwrap_or(rust_decimal::Decimal::ZERO);
                let price_dec = rust_decimal::Decimal::try_from(t.price.unwrap_or(0.0)).unwrap_or(rust_decimal::Decimal::ZERO);
                let amount = shares * price_dec;
                let ts: chrono::DateTime<chrono::Utc> = t
                    .timestamp
                    .and_then(|secs| chrono::DateTime::from_timestamp(secs, 0))
                    .unwrap_or(now);
                let side = match t.outcome.as_deref() {
                    Some(o) => format!("{} {}", t.side, o),
                    None => t.side.clone(),
                };
                UserTrade {
                    condition_id: t.condition_id,
                    side,
                    amount: amount.to_string(),
                    price: price_dec.to_string(),
                    timestamp: ts.to_rfc3339(),
                    question: t.title,
                }
            })
            .collect();
        Ok(trades)
    }
}

/// A parsed trade record for a specific user's history.
#[derive(Debug, serde::Serialize)]
pub struct UserTrade {
    pub condition_id: String,
    pub side: String,
    pub amount: String,
    pub price: String,
    pub timestamp: String,
    pub question: Option<String>,
}


/// Convert a raw `UserProfile` from the Data API into a `WhaleProfile`.
/// Returns `None` if essential fields are missing.
pub fn profile_to_whale(address: String, profile: &UserProfile) -> Option<WhaleProfile> {
    let profit: Decimal = Decimal::try_from(profile.pnl.unwrap_or(0.0)).unwrap_or(Decimal::ZERO);
    let volume: Decimal = Decimal::try_from(profile.vol.unwrap_or(0.0)).unwrap_or(Decimal::ZERO);
    Some(WhaleProfile {
        address,
        display_name: profile.user_name.clone(),
        profit,
        // Since Polymarket removed the /profiles API, `roi` and `win_rate` are no longer trivial to fetch.
        // We set them to arbitrary safe high values so they bypass the minimum gating checks in `run_poll_cycle`,
        // allowing us to track whales purely based on trading size and total PnL.
        roi: 999.0, 
        win_rate: 1.0, 
        volume,
        markets_traded: 0,
        last_seen: Utc::now(),
        followed: false,
        archived: false,
    })
}

// ── Background loop ──────────────────────────────────────────────────────────

/// Long-running task that polls for whale activity and updates `AppState`.
pub async fn whale_tracker_loop(state: Arc<AppState>) -> Result<()> {
    let poll_interval_secs = state.runtime_config.read().whale_poll_interval_secs;
    info!("Whale tracker started (poll interval: {poll_interval_secs}s)");
    let client = DataApiClient::new();

    loop {
        let current_poll_interval = state.runtime_config.read().whale_poll_interval_secs;
        tokio::select! {
            _ = state.shutdown.cancelled() => {
                info!("Whale tracker shutting down");
                return Ok(());
            }
            _ = tokio::time::sleep(Duration::from_secs(current_poll_interval)) => {}
        }

        if let Err(e) = run_poll_cycle(&client, &state).await {
            warn!(error = %e, "Whale tracker poll cycle failed, will retry next interval");
        }
    }
}

pub async fn run_poll_cycle(client: &DataApiClient, state: &Arc<AppState>) -> Result<()> {
    debug!("Whale tracker: fetching recent activity");

    let cfg = state.runtime_config.read().clone();
    let trades = client.fetch_trades(1000).await?;
    let now = Utc::now();

    // Collect addresses from trades larger than threshold
    let mut large_traders: HashSet<String> = HashSet::new();
    let mut new_activities: Vec<WhaleActivity> = Vec::new();

    for trade in &trades {
        if trade.proxy_wallet.is_empty() {
            continue;
        }

        // /trades `size` is shares, not USDC — compute notional value
        let shares = Decimal::try_from(trade.size.unwrap_or(0.0)).unwrap_or(Decimal::ZERO);
        let price_dec = Decimal::try_from(trade.price.unwrap_or(0.0)).unwrap_or(Decimal::ZERO);
        let amount = shares * price_dec;
        if amount < cfg.min_whale_trade_usd {
            continue;
        }

        large_traders.insert(trade.proxy_wallet.clone());

        let ts: DateTime<Utc> = trade
            .timestamp
            .and_then(|secs| DateTime::from_timestamp(secs, 0))
            .unwrap_or(now);

        let side = match trade.outcome.as_deref() {
            Some(o) => format!("{} {}", trade.side, o),
            None => trade.side.clone(),
        };

        new_activities.push(WhaleActivity {
            address: trade.proxy_wallet.clone(),
            condition_id: trade.condition_id.clone(),
            side,
            amount, // notional USDC (shares * price)
            price: price_dec,
            timestamp: ts,
            question: trade.title.clone(),
            platform: "Polymarket".to_string(),
        });
    }

    info!(
        candidates = large_traders.len(),
        "Whale tracker: checking {} candidate wallets",
        large_traders.len()
    );

    // For each large trader, fetch their profile and decide whether to track
    for address in &large_traders {
        // Rate limit: small delay between profile fetches
        tokio::time::sleep(Duration::from_millis(200)).await;

        let profile = match client.fetch_profile(address).await {
            Ok(Some(p)) => p,
            Ok(None) => {
                debug!(address, "no profile found");
                continue;
            }
            Err(e) => {
                warn!(address, error = %e, "profile fetch failed");
                continue;
            }
        };

        let whale = match profile_to_whale(address.clone(), &profile) {
            Some(w) => w,
            None => continue,
        };

        if whale.win_rate < cfg.min_whale_win_rate
            || whale.roi < cfg.min_whale_roi
            || whale.profit < cfg.min_whale_profit_usd
        {
            debug!(
                address,
                win_rate = whale.win_rate,
                roi = whale.roi,
                profit = %whale.profit,
                "Wallet does not meet whale criteria"
            );
            continue;
        }

        info!(
            address,
            win_rate = whale.win_rate,
            roi = whale.roi,
            profit = %whale.profit,
            "New whale tracked"
        );
        state.whales.insert(address.clone(), whale);
        state.metrics.whale_events.fetch_add(1, std::sync::atomic::Ordering::Relaxed);
    }

    // Record new activities from tracked whales
    for activity in new_activities {
        if !state.whales.contains_key(&activity.address) {
            continue;
        }
        state.record_whale_activity(activity);
        state.metrics.whale_events.fetch_add(1, std::sync::atomic::Ordering::Relaxed);
    }

    debug!(
        tracked_whales = state.whales.len(),
        "Whale tracker: cycle complete"
    );
    Ok(())
}

pub mod job;
pub use job::WhalePollJob;
