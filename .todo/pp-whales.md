# pp-whales — refactor

## lib.rs (323 LOC)
- [ ] Сейчас Polymarket-only. Переименовать в `pp-tracking` (общий tracker for whales/leaders/copy-trade)
- [ ] DataApiClient → `polymarket_sdk::data::Client` (typed)
- [ ] Trait `WhaleSource` (fetch_trades, fetch_profile, fetch_user_trades) → impl PolymarketWhaleSource, KalshiWhaleSource, HyperliquidWhaleSource
- [ ] `profile_to_whale` хардкодит `roi: 999.0, win_rate: 1.0` — TODO заменить на реальные расчёты через Polymarket leaderboard endpoint когда вернётся

## job.rs
- [ ] OK
