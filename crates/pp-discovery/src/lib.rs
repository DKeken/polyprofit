use std::sync::Arc;

use anyhow::Result;
use rust_decimal::Decimal;
use tracing::{debug, info, warn};

use chrono::{DateTime, FixedOffset, Utc};

use pp_core::{AppState, Asset, ConditionId, Market, MarketKind, TokenId};

const GAMMA_API: &str = "https://gamma-api.polymarket.com";

#[derive(Debug, serde::Deserialize)]
struct GammaMarket {
    #[serde(default)]
    condition_id: String,
    #[serde(default)]
    question: String,
    #[serde(default)]
    tokens: Vec<GammaToken>,
    #[serde(default)]
    end_date_iso: Option<String>,
    #[serde(default)]
    active: bool,
    #[serde(default)]
    closed: bool,
}

#[derive(Debug, serde::Deserialize)]
struct GammaToken {
    #[serde(default)]
    token_id: String,
    #[serde(default)]
    outcome: String,
}

/// Initial discovery: fetch all crypto markets from Gamma API.
/// Fetches once, then filters locally per asset (avoids N identical HTTP requests).
pub async fn discover(state: &Arc<AppState>, assets: &[Asset]) -> Result<usize> {
    let client = reqwest::Client::new();
    let mut total = 0;

    // Single fetch — the Gamma API tag=crypto filter already narrows results
    let url = format!(
        "{GAMMA_API}/markets?tag=crypto&active=true&closed=false&limit=100&ascending=false&order=volume"
    );
    let resp = client.get(&url).send().await?;
    let all_markets: Vec<GammaMarket> = resp.json().await?;

    for gm in &all_markets {
        if gm.condition_id.is_empty() || gm.tokens.len() < 2 {
            continue;
        }

        // Match against ALL requested assets locally
        let question_lower = gm.question.to_lowercase();
        let matched_asset = assets.iter().find(|asset| {
            match asset {
                Asset::Btc => {
                    question_lower.contains("btc") || question_lower.contains("bitcoin")
                }
                Asset::Eth => {
                    question_lower.contains("eth") || question_lower.contains("ethereum")
                }
                Asset::Sol => question_lower.contains("sol") || question_lower.contains("solana"),
                Asset::Xrp => question_lower.contains("xrp") || question_lower.contains("ripple"),
            }
        });

        let asset = match matched_asset {
            Some(a) => *a,
            None => continue,
        };

        let kind = classify_market(&gm.question);
        let strike = extract_strike(&gm.question);

        let (token_yes, token_no) = extract_tokens(&gm.tokens);

        let end_time = gm
            .end_date_iso
            .as_deref()
            .and_then(|s| DateTime::parse_from_rfc3339(s).ok())
            .map(|dt: DateTime<FixedOffset>| dt.with_timezone(&Utc))
            .unwrap_or_else(|| Utc::now() + chrono::Duration::hours(1));

        let market = Market {
            condition_id: ConditionId(gm.condition_id.clone()),
            token_yes: TokenId(token_yes),
            token_no: TokenId(token_no),
            asset,
            kind,
            question: gm.question.clone(),
            strike,
            end_time,
            active: gm.active && !gm.closed,
        };

        state
            .markets
            .insert(ConditionId(gm.condition_id.clone()), market);
        total += 1;
    }

    info!(count = total, "Markets discovered");
    Ok(total)
}

/// Background loop: refresh markets periodically.
/// Reads interval from runtime_config so UI changes to market_refresh_secs take effect.
pub async fn refresh_loop(state: Arc<AppState>, assets: Vec<Asset>) -> Result<()> {
    loop {
        let interval_secs = state.runtime_config.read().market_refresh_secs.max(10);
        tokio::time::sleep(std::time::Duration::from_secs(interval_secs)).await;

        match discover(&state, &assets).await {
            Ok(count) => {
                debug!(count, "Markets refreshed");
                // Remove expired markets
                let now = chrono::Utc::now();
                state.markets.retain(|_, m| m.end_time > now && m.active);
            }
            Err(e) => {
                warn!("Market refresh failed: {e:#}");
            }
        }
    }
}

fn classify_market(question: &str) -> MarketKind {
    let q = question.to_lowercase();

    if q.contains("5 min") || q.contains("5-min") || q.contains("five min") {
        MarketKind::FiveMin
    } else if q.contains("up or down") || q.contains("up/down") {
        MarketKind::UpDown
    } else if q.contains("above") {
        MarketKind::Above
    } else if q.contains("below") {
        MarketKind::Below
    } else if q.contains("dip") {
        MarketKind::Dip
    } else if q.contains("reach") {
        MarketKind::Reach
    } else if q.contains("between") || q.contains("range") {
        MarketKind::Range
    } else {
        MarketKind::Unknown
    }
}

fn extract_strike(question: &str) -> Option<Decimal> {
    // Look for $XX,XXX or $XX,XXX.XX patterns
    let re_like = question
        .split('$')
        .nth(1)
        .and_then(|s| {
            let num_str: String = s
                .chars()
                .take_while(|c| c.is_ascii_digit() || *c == ',' || *c == '.')
                .collect();
            let cleaned = num_str.replace(',', "");
            cleaned.parse::<Decimal>().ok()
        });

    re_like
}

fn extract_tokens(tokens: &[GammaToken]) -> (String, String) {
    let mut yes = String::new();
    let mut no = String::new();

    for t in tokens {
        match t.outcome.to_lowercase().as_str() {
            "yes" | "up" => yes = t.token_id.clone(),
            "no" | "down" => no = t.token_id.clone(),
            _ => {
                if yes.is_empty() {
                    yes = t.token_id.clone();
                } else {
                    no = t.token_id.clone();
                }
            }
        }
    }

    (yes, no)
}
