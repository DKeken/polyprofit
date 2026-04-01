use std::collections::HashSet;
use std::sync::Arc;

use anyhow::Result;
use rust_decimal::Decimal;
use tracing::{debug, info, warn};

use chrono::{DateTime, FixedOffset, Utc};

use pp_core::{AppState, Asset, ConditionId, Market, MarketKind, TokenId};

const GAMMA_API: &str = "https://gamma-api.polymarket.com";

#[derive(Debug, serde::Deserialize)]
#[serde(rename_all = "camelCase")]
struct GammaMarket {
    #[serde(default)]
    condition_id: String,
    #[serde(default)]
    question: String,
    /// Stringified JSON array of token IDs, e.g. `"[\"tok1\", \"tok2\"]"``
    #[serde(default)]
    clob_token_ids: String,
    /// Stringified JSON array of outcome labels, e.g. `"[\"Yes\", \"No\"]"``
    #[serde(default)]
    outcomes: String,
    /// Full RFC-3339 end datetime, e.g. `"2026-04-06T13:00:00Z"`
    #[serde(default)]
    end_date: Option<String>,
    #[serde(default)]
    active: bool,
    #[serde(default)]
    closed: bool,
}

/// Initial discovery: fetch crypto markets from Gamma API via per-asset keyword search.
/// One request per asset (e.g. q=btc, q=eth) to get relevant markets; deduplicates
/// by condition_id and then applies data-driven keyword matching for final filtering.
pub async fn discover(state: &Arc<AppState>, assets: &[Asset]) -> Result<usize> {
    let client = reqwest::Client::new();
    let mut total = 0;

    // Per-asset queries — asset symbol lowercased is the search term (btc, eth, sol, xrp).
    // The Gamma API `tag=` filter is unreliable; `q=` keyword search works correctly.
    let queries: Vec<String> = assets.iter().map(|a| a.0.to_lowercase()).collect();

    let mut seen: HashSet<String> = HashSet::new();
    let mut all_markets: Vec<GammaMarket> = Vec::new();

    for q in &queries {
        let url = format!(
            "{GAMMA_API}/markets?active=true&closed=false&limit=100&order=volume&q={q}"
        );
        let resp = match client.get(&url).send().await {
            Ok(r) => r,
            Err(e) => { warn!(q, error = %e, "Gamma API request failed"); continue; }
        };
        let markets: Vec<GammaMarket> = match resp.json().await {
            Ok(m) => m,
            Err(e) => { warn!(q, error = %e, "Gamma API parse failed"); continue; }
        };
        for m in markets {
            if !m.condition_id.is_empty() && seen.insert(m.condition_id.clone()) {
                all_markets.push(m);
            }
        }
    }

    for gm in &all_markets {
        let ids: Vec<String> = serde_json::from_str(&gm.clob_token_ids).unwrap_or_default();
        if ids.len() < 2 {
            continue;
        }

        let question_lower = gm.question.to_lowercase();
        let matched_asset = state.match_asset_by_keywords(&question_lower, assets);

        let asset = match matched_asset {
            Some(a) => a,
            None => continue,
        };

        let kind = classify_market(&gm.question);
        let strike = extract_strike(&gm.question);
        let (token_yes, token_no) = extract_tokens_from_clob(&gm.clob_token_ids, &gm.outcomes);

        let end_time = gm
            .end_date
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
        tokio::select! {
            _ = state.shutdown.cancelled() => {
                tracing::info!("Discovery refresh loop shutting down");
                return Ok(());
            }
            _ = tokio::time::sleep(std::time::Duration::from_secs(interval_secs)) => {}
        }

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

/// Parse YES/NO token IDs from the Gamma API's stringified JSON fields.
/// `clob_token_ids`: e.g. `"[\"tok1\", \"tok2\"]"``
/// `outcomes`:       e.g. `"[\"Yes\", \"No\"]"`` or `"[\"Up\", \"Down\"]"``
fn extract_tokens_from_clob(clob_token_ids: &str, outcomes: &str) -> (String, String) {
    let ids: Vec<String> = serde_json::from_str(clob_token_ids).unwrap_or_default();
    let outs: Vec<String> = serde_json::from_str(outcomes).unwrap_or_default();

    let mut yes = String::new();
    let mut no = String::new();

    for (i, out) in outs.iter().enumerate() {
        let id = ids.get(i).cloned().unwrap_or_default();
        match out.to_lowercase().as_str() {
            "yes" | "up" => yes = id,
            "no" | "down" => no = id,
            _ => {
                if yes.is_empty() {
                    yes = id;
                } else if no.is_empty() {
                    no = id;
                }
            }
        }
    }

    // Positional fallback when outcomes don't contain yes/no/up/down
    if yes.is_empty() { yes = ids.get(0).cloned().unwrap_or_default(); }
    if no.is_empty()  { no  = ids.get(1).cloned().unwrap_or_default(); }

    (yes, no)
}

#[cfg(test)]
mod tests {
    use super::*;
    use pp_core::MarketKind;
    use rust_decimal_macros::dec;

    // ── classify_market ──

    #[test]
    fn classify_five_min() {
        assert_eq!(classify_market("BTC 5 min prediction"), MarketKind::FiveMin);
        assert_eq!(classify_market("ETH 5-min move"), MarketKind::FiveMin);
        assert_eq!(classify_market("SOL five min candle"), MarketKind::FiveMin);
    }

    #[test]
    fn classify_up_down() {
        assert_eq!(
            classify_market("Will BTC go up or down?"),
            MarketKind::UpDown
        );
        assert_eq!(classify_market("ETH up/down today"), MarketKind::UpDown);
    }

    #[test]
    fn classify_above() {
        assert_eq!(
            classify_market("Will BTC be above $85,000?"),
            MarketKind::Above
        );
    }

    #[test]
    fn classify_below() {
        assert_eq!(
            classify_market("Will ETH drop below $2,000?"),
            MarketKind::Below
        );
    }

    #[test]
    fn classify_dip() {
        assert_eq!(
            classify_market("Will BTC dip 5% today?"),
            MarketKind::Dip
        );
    }

    #[test]
    fn classify_reach() {
        assert_eq!(
            classify_market("Will SOL reach $200?"),
            MarketKind::Reach
        );
    }

    #[test]
    fn classify_range() {
        assert_eq!(
            classify_market("BTC between $80k and $90k"),
            MarketKind::Range
        );
        assert_eq!(
            classify_market("ETH trading range today"),
            MarketKind::Range
        );
    }

    #[test]
    fn classify_unknown() {
        assert_eq!(
            classify_market("Some random question about crypto"),
            MarketKind::Unknown
        );
    }

    // ── extract_strike ──

    #[test]
    fn extract_strike_with_comma() {
        assert_eq!(
            extract_strike("Will BTC be above $85,000?"),
            Some(dec!(85000))
        );
    }

    #[test]
    fn extract_strike_with_decimals() {
        assert_eq!(
            extract_strike("XRP above $1.50 today"),
            Some(dec!(1.50))
        );
    }

    #[test]
    fn extract_strike_large_number() {
        assert_eq!(
            extract_strike("ETH reach $100,000.50?"),
            Some(dec!(100000.50))
        );
    }

    #[test]
    fn extract_strike_no_dollar() {
        assert_eq!(extract_strike("Will BTC go up?"), None);
    }

    #[test]
    fn extract_strike_dollar_no_number() {
        // "$" followed by a letter — no digits to parse
        assert_eq!(extract_strike("Worth $ nothing"), None);
    }

    // ── extract_tokens_from_clob ──

    #[test]
    fn extract_tokens_yes_no() {
        let ids  = r#"["tok_yes","tok_no"]"#;
        let outs = r#"["Yes","No"]"#;
        let (yes, no) = extract_tokens_from_clob(ids, outs);
        assert_eq!(yes, "tok_yes");
        assert_eq!(no, "tok_no");
    }

    #[test]
    fn extract_tokens_up_down() {
        let ids  = r#"["tok_up","tok_down"]"#;
        let outs = r#"["Up","Down"]"#;
        let (yes, no) = extract_tokens_from_clob(ids, outs);
        assert_eq!(yes, "tok_up");
        assert_eq!(no, "tok_down");
    }

    #[test]
    fn extract_tokens_arbitrary_outcomes() {
        let ids  = r#"["tok_a","tok_b"]"#;
        let outs = r#"["Above","Below"]"#;
        let (yes, no) = extract_tokens_from_clob(ids, outs);
        // Neither matches yes/no/up/down, so positional: first→yes, second→no
        assert_eq!(yes, "tok_a");
        assert_eq!(no, "tok_b");
    }

    #[test]
    fn extract_tokens_reversed_order() {
        let ids  = r#"["tok_no","tok_yes"]"#;
        let outs = r#"["No","Yes"]"#;
        let (yes, no) = extract_tokens_from_clob(ids, outs);
        assert_eq!(yes, "tok_yes");
        assert_eq!(no, "tok_no");
    }
}
