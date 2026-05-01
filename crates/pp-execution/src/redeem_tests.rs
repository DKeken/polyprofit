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
