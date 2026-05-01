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
