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
