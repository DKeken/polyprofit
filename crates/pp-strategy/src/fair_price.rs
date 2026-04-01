use rust_decimal::Decimal;
use rust_decimal_macros::dec;

use pp_core::MarketKind;

// ── Model Constants ──────────────────────────────────────────────────────────
//
// Each constant controls sensitivity in a specific fair-probability model.
// The naming convention is: <MODEL>_<PARAMETER>.
//
// These are empirical estimates calibrated against Polymarket historical data.
// Increasing a SENSITIVITY constant makes the model react more aggressively
// to price deltas / strike distances. Adjust with care — too aggressive and
// the bot takes too many positions; too conservative and it misses edges.

/// UpDown: sensitivity of YES probability to the oracle delta.
/// A 1% delta shifts fair by ±5 percentage points (pp).
/// Example: delta_pct=+0.02 → fair=0.50+0.10=0.60.
const UPDOWN_DELTA_SENSITIVITY: Decimal = dec!(5.0);

/// FiveMin: base probability reflecting the tie-resolution rule
/// (UP wins on tie → structural ~52% YES bias in 5-min markets).
const FIVEMIN_BASE_PROB: Decimal = dec!(0.52);

/// FiveMin: delta sensitivity — slightly higher than UpDown because
/// 5-min markets have shorter horizon → delta is more predictive.
const FIVEMIN_DELTA_SENSITIVITY: Decimal = dec!(6.0);

/// Above/Below: how much the strike distance shifts the base probability.
/// A +1% strike_dist (price above strike) adds 2 pp to Above YES probability.
const STRIKE_DISTANCE_SENSITIVITY: Decimal = dec!(2.0);

/// Above/Below: delta contribution on top of the strike distance effect.
const STRIKE_DELTA_SENSITIVITY: Decimal = dec!(3.0);

/// Dip/Reach touch contracts: base probability when at maximum distance
/// from strike (= low chance of touching). Closer proximity raises this.
const TOUCH_BASE_PROB: Decimal = dec!(0.30);

/// Dip/Reach: how much proximity to strike raises probability (additive).
/// At proximity=1.0 (on strike): adds 0.4 → base reaches 0.70.
const TOUCH_PROXIMITY_WEIGHT: Decimal = dec!(0.4);

/// Dip/Reach: delta sensitivity for touch contracts (lower than directional
/// markets because touch is path-dependent, not just endpoint).
const TOUCH_DELTA_SENSITIVITY: Decimal = dec!(2.0);

/// Maximum distance (as fraction) at which proximity function saturates.
/// Beyond 50% distance from strike, proximity is clamped to zero.
const TOUCH_MAX_DISTANCE: Decimal = dec!(0.5);

/// Proximity attenuation factor: converts distance → proximity linearly.
/// proximity = 1.0 - min(abs(strike_dist), MAX_DISTANCE) * ATTENUATION
const TOUCH_PROXIMITY_ATTENUATION: Decimal = dec!(2.0);

/// Lower bound for clamped probability (prevents impossible-seeming quotes).
const PROB_FLOOR: Decimal = dec!(0.05);

/// Upper bound for clamped probability (prevents certainty-seeming quotes).
const PROB_CEILING: Decimal = dec!(0.95);

// ── Public API ───────────────────────────────────────────────────────────────

/// Calculate fair probability for a market given the price delta.
///
/// `delta_pct` = (binance - chainlink) / chainlink
/// `strike_dist` = distance from current price to strike (for Above/Below/Dip/Reach)
pub fn fair_probability(
    kind: MarketKind,
    delta_pct: Decimal,
    strike_dist: Option<Decimal>,
) -> Decimal {
    match kind {
        MarketKind::UpDown => fair_updown(delta_pct),
        MarketKind::FiveMin => fair_fivemin(delta_pct),
        MarketKind::Above => fair_above(delta_pct, strike_dist.unwrap_or(dec!(0))),
        MarketKind::Below => fair_below(delta_pct, strike_dist.unwrap_or(dec!(0))),
        MarketKind::Dip => fair_dip(delta_pct, strike_dist.unwrap_or(dec!(0))),
        MarketKind::Reach => fair_reach(delta_pct, strike_dist.unwrap_or(dec!(0))),
        MarketKind::Range | MarketKind::Unknown => dec!(0.50),
    }
}

// ── Model Implementations ────────────────────────────────────────────────────

/// Up/Down: sigmoid-like mapping from oracle delta to probability.
///
/// Positive delta (Binance > Chainlink) means price is rising → UP (YES) more likely.
/// The linear approximation is valid for small deltas (|delta| < 10%);
/// beyond that, the clamp saturates the output — this is intentional
/// to avoid overconfident bets on extreme moves.
fn fair_updown(delta_pct: Decimal) -> Decimal {
    let base = dec!(0.50) + delta_pct * UPDOWN_DELTA_SENSITIVITY;
    clamp_prob(base)
}

/// 5-minute markets: UP wins on tie (Polymarket rule) → structural YES bias.
///
/// The 0.52 base reflects the ~2pp edge from tie-resolution, empirically
/// observed across Polymarket 5-min BTC/ETH markets. The higher delta
/// sensitivity (6.0 vs 5.0) reflects the shorter horizon — a delta that
/// formed in 5 minutes is more persistent than one in a 1-hour window.
fn fair_fivemin(delta_pct: Decimal) -> Decimal {
    let base = FIVEMIN_BASE_PROB + delta_pct * FIVEMIN_DELTA_SENSITIVITY;
    clamp_prob(base)
}

/// Above $X: YES = price stays above strike at expiry.
///
/// Two signals compose:
///   1. Strike distance — price already above/below strike (structural edge)
///   2. Delta — momentum confirmation (Binance leading Chainlink)
fn fair_above(delta_pct: Decimal, strike_dist: Decimal) -> Decimal {
    let base = dec!(0.50)
        + strike_dist * STRIKE_DISTANCE_SENSITIVITY
        + delta_pct * STRIKE_DELTA_SENSITIVITY;
    clamp_prob(base)
}

/// Below $X: YES = price goes below strike at expiry.
///
/// Mirror of Above: negative strike_dist and negative delta favor YES.
fn fair_below(delta_pct: Decimal, strike_dist: Decimal) -> Decimal {
    let base = dec!(0.50)
        - strike_dist * STRIKE_DISTANCE_SENSITIVITY
        - delta_pct * STRIKE_DELTA_SENSITIVITY;
    clamp_prob(base)
}

/// Dip to $X: YES = price touches strike from above (barrier/touch option).
///
/// Touch contracts are path-dependent: the probability depends on
/// *how close* we are to the strike (proximity) and *direction of travel*
/// (delta). Negative delta (price falling) increases the chance of a dip.
fn fair_dip(delta_pct: Decimal, strike_dist: Decimal) -> Decimal {
    let proximity = dec!(1.0)
        - strike_dist.abs().min(TOUCH_MAX_DISTANCE) * TOUCH_PROXIMITY_ATTENUATION;
    let base = TOUCH_BASE_PROB
        + proximity * TOUCH_PROXIMITY_WEIGHT
        - delta_pct * TOUCH_DELTA_SENSITIVITY;
    clamp_prob(base)
}

/// Reach $X: YES = price reaches strike from below (barrier/touch option).
///
/// Same structure as Dip, but positive delta (price rising) increases YES.
fn fair_reach(delta_pct: Decimal, strike_dist: Decimal) -> Decimal {
    let proximity = dec!(1.0)
        - strike_dist.abs().min(TOUCH_MAX_DISTANCE) * TOUCH_PROXIMITY_ATTENUATION;
    let base = TOUCH_BASE_PROB
        + proximity * TOUCH_PROXIMITY_WEIGHT
        + delta_pct * TOUCH_DELTA_SENSITIVITY;
    clamp_prob(base)
}

/// Clamp probability to [PROB_FLOOR, PROB_CEILING] to prevent degenerate quotes.
fn clamp_prob(p: Decimal) -> Decimal {
    p.max(PROB_FLOOR).min(PROB_CEILING)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_fivemin_tie_bias() {
        let fair = fair_fivemin(dec!(0.0));
        assert!(fair > dec!(0.50), "5-min should have UP bias: {fair}");
        assert!(fair < dec!(0.55), "5-min bias shouldn't be too large: {fair}");
    }

    #[test]
    fn test_updown_positive_delta() {
        let fair = fair_updown(dec!(0.05));
        assert!(fair > dec!(0.50), "Positive delta should favor YES: {fair}");
    }

    #[test]
    fn test_updown_zero_delta_is_neutral() {
        let fair = fair_updown(dec!(0.0));
        assert_eq!(fair, dec!(0.50), "Zero delta should be exactly 0.50");
    }

    #[test]
    fn test_updown_negative_delta() {
        let fair = fair_updown(dec!(-0.03));
        assert!(fair < dec!(0.50), "Negative delta should favor NO: {fair}");
    }

    #[test]
    fn test_above_price_well_above_strike() {
        // strike_dist=+0.10 (10% above strike), delta=0 → should favor YES
        let fair = fair_above(dec!(0.0), dec!(0.10));
        assert!(fair > dec!(0.60), "Well above strike: {fair}");
    }

    #[test]
    fn test_below_price_well_below_strike() {
        // strike_dist=-0.10 (10% below strike), delta=0 → should favor YES
        let fair = fair_below(dec!(0.0), dec!(-0.10));
        assert!(fair > dec!(0.60), "Well below strike: {fair}");
    }

    #[test]
    fn test_dip_at_strike() {
        // At strike (dist=0), delta=0 → proximity=1.0 → base = 0.30+0.4 = 0.70
        let fair = fair_dip(dec!(0.0), dec!(0.0));
        assert_eq!(fair, dec!(0.70), "At strike, dip should be 0.70: {fair}");
    }

    #[test]
    fn test_reach_at_strike() {
        // At strike (dist=0), delta=0 → same as dip
        let fair = fair_reach(dec!(0.0), dec!(0.0));
        assert_eq!(fair, dec!(0.70), "At strike, reach should be 0.70: {fair}");
    }

    #[test]
    fn test_range_is_neutral() {
        let fair = fair_probability(MarketKind::Range, dec!(0.05), None);
        assert_eq!(fair, dec!(0.50));
    }

    #[test]
    fn test_unknown_is_neutral() {
        let fair = fair_probability(MarketKind::Unknown, dec!(-0.10), None);
        assert_eq!(fair, dec!(0.50));
    }

    #[test]
    fn test_clamp_floor() {
        assert_eq!(clamp_prob(dec!(-0.5)), PROB_FLOOR);
    }

    #[test]
    fn test_clamp_ceiling() {
        assert_eq!(clamp_prob(dec!(1.5)), PROB_CEILING);
    }

    #[test]
    fn test_clamp_within_range_unchanged() {
        assert_eq!(clamp_prob(dec!(0.42)), dec!(0.42));
    }
}
