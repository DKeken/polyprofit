use rust_decimal::Decimal;
use rust_decimal_macros::dec;

use pp_core::MarketKind;

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

/// Up/Down: simple sigmoid-like mapping from delta to probability
fn fair_updown(delta_pct: Decimal) -> Decimal {
    // delta > 0 → UP more likely → YES probability increases
    // Clamp to [0.15, 0.85]
    let base = dec!(0.50) + delta_pct * dec!(5.0);
    clamp_prob(base)
}

/// 5-minute markets: TIE = UP wins → built-in ~51% YES bias
fn fair_fivemin(delta_pct: Decimal) -> Decimal {
    // Tie resolution bias: UP wins on tie → base 0.52 not 0.50
    let base = dec!(0.52) + delta_pct * dec!(6.0);
    clamp_prob(base)
}

/// Above $X: YES = price stays above strike
fn fair_above(delta_pct: Decimal, strike_dist: Decimal) -> Decimal {
    // If price is well above strike → high YES probability
    // strike_dist > 0 means price is above strike
    let base = dec!(0.50) + strike_dist * dec!(2.0) + delta_pct * dec!(3.0);
    clamp_prob(base)
}

/// Below $X: YES = price goes below strike
fn fair_below(delta_pct: Decimal, strike_dist: Decimal) -> Decimal {
    // Mirror of Above
    let base = dec!(0.50) - strike_dist * dec!(2.0) - delta_pct * dec!(3.0);
    clamp_prob(base)
}

/// Dip to $X: YES = price touches strike from above (touch contract)
fn fair_dip(delta_pct: Decimal, strike_dist: Decimal) -> Decimal {
    // Closer to strike = higher YES probability
    // Negative delta (price dropping) increases YES probability
    let proximity = dec!(1.0) - strike_dist.abs().min(dec!(0.5)) * dec!(2.0);
    let base = dec!(0.30) + proximity * dec!(0.4) - delta_pct * dec!(2.0);
    clamp_prob(base)
}

/// Reach $X: YES = price reaches strike from below (touch contract)
fn fair_reach(delta_pct: Decimal, strike_dist: Decimal) -> Decimal {
    // Closer to strike = higher YES probability
    // Positive delta (price rising) increases YES probability
    let proximity = dec!(1.0) - strike_dist.abs().min(dec!(0.5)) * dec!(2.0);
    let base = dec!(0.30) + proximity * dec!(0.4) + delta_pct * dec!(2.0);
    clamp_prob(base)
}

fn clamp_prob(p: Decimal) -> Decimal {
    p.max(dec!(0.05)).min(dec!(0.95))
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
    fn test_clamp() {
        assert_eq!(clamp_prob(dec!(1.5)), dec!(0.95));
        assert_eq!(clamp_prob(dec!(-0.5)), dec!(0.05));
    }
}
