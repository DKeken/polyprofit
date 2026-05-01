use super::*;
use rust_decimal_macros::dec;

#[test]
fn round_tick_snaps_to_cent() {
    assert_eq!(round_tick(dec!(0.534), dec!(0.01)), dec!(0.53));
    assert_eq!(round_tick(dec!(0.535), dec!(0.01)), dec!(0.54));
    assert_eq!(round_tick(dec!(0.10), dec!(0.01)), dec!(0.10));
}

#[test]
fn round_tick_zero_tick_returns_price() {
    assert_eq!(round_tick(dec!(0.123456), Decimal::ZERO), dec!(0.123456));
}

#[test]
fn shares_truncation_to_2dp() {
    // SDK LOT_SIZE_SCALE = 2: size must have <= 2 decimal places
    let usdc = dec!(10.00);
    let price = dec!(0.33);
    let shares = (usdc / price).trunc_with_scale(LOT_SIZE_SCALE);
    // 10 / 0.33 = 30.303030... → truncated to 30.30
    assert_eq!(shares, dec!(30.30));
    assert!(shares.scale() <= LOT_SIZE_SCALE);
}

#[test]
fn shares_truncation_exact() {
    let usdc = dec!(5.00);
    let price = dec!(0.50);
    let shares = (usdc / price).trunc_with_scale(LOT_SIZE_SCALE);
    assert_eq!(shares, dec!(10.00));
}
