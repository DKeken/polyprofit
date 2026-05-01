use super::*;
use rust_decimal_macros::dec;
use std::sync::atomic::Ordering;

#[test]
fn set_starting_balance_stores_cents() {
    let state = AppState::new();
    state.set_starting_balance(dec!(1000.00));
    assert_eq!(state.starting_balance.load(Ordering::Relaxed), 100_000);
}

#[test]
fn set_starting_balance_sets_peak() {
    let state = AppState::new();
    state.set_starting_balance(dec!(500.00));
    assert_eq!(state.peak_balance.load(Ordering::Relaxed), 50_000);
}

#[test]
fn current_balance_cents_combines_start_and_pnl() {
    let state = AppState::new();
    state.set_starting_balance(dec!(1000.00));
    state.daily_pnl.store(500, Ordering::Relaxed); // +$5.00
    assert_eq!(state.current_balance_cents(), 100_500);
}

#[test]
fn current_balance_cents_with_negative_pnl() {
    let state = AppState::new();
    state.set_starting_balance(dec!(1000.00));
    state.daily_pnl.store(-2000, Ordering::Relaxed); // -$20.00
    assert_eq!(state.current_balance_cents(), 98_000);
}

#[test]
fn record_pnl_positive_updates_daily_pnl() {
    let state = AppState::new();
    state.set_starting_balance(dec!(1000.00));
    state.record_pnl(dec!(10.00));
    assert_eq!(state.daily_pnl.load(Ordering::Relaxed), 1000); // $10 = 1000 cents
}

#[test]
fn record_pnl_cumulative() {
    let state = AppState::new();
    state.set_starting_balance(dec!(1000.00));
    state.record_pnl(dec!(10.00));
    state.record_pnl(dec!(5.50));
    assert_eq!(state.daily_pnl.load(Ordering::Relaxed), 1550); // $15.50
}

#[test]
fn record_pnl_updates_peak_balance() {
    let state = AppState::new();
    state.set_starting_balance(dec!(1000.00));
    // Starting peak is 100_000
    state.record_pnl(dec!(50.00));
    // New balance = 100_000 + 5_000 = 105_000 -> new peak
    assert_eq!(state.peak_balance.load(Ordering::Relaxed), 105_000);
}

#[test]
fn record_pnl_negative_does_not_lower_peak() {
    let state = AppState::new();
    state.set_starting_balance(dec!(1000.00));
    state.record_pnl(dec!(50.00));  // peak = 105_000
    state.record_pnl(dec!(-20.00)); // balance = 103_000, peak stays 105_000
    assert_eq!(state.peak_balance.load(Ordering::Relaxed), 105_000);
    assert_eq!(state.current_balance_cents(), 103_000);
}

#[test]
fn daily_pnl_dec_conversion() {
    let state = AppState::new();
    state.daily_pnl.store(1234, Ordering::Relaxed);
    assert_eq!(state.daily_pnl_dec(), dec!(12.34));
}

#[test]
fn daily_pnl_dec_negative() {
    let state = AppState::new();
    state.daily_pnl.store(-500, Ordering::Relaxed);
    assert_eq!(state.daily_pnl_dec(), dec!(-5.00));
}

#[test]
fn is_paused_default_false() {
    let state = AppState::new();
    assert!(!state.is_paused());
}

#[test]
fn is_heartbeat_alive_default_false() {
    let state = AppState::new();
    assert!(!state.is_heartbeat_alive());
}
