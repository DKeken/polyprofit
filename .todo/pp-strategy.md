# pp-strategy — minimal changes

## signal.rs
- [ ] _config: &Config → больше не нужен (всё из runtime_config). Убрать параметр.
- [ ] Generalize: signal_loop не привязан к Polymarket — оставить как есть
- [ ] При мульти-venue: scan по `state.markets` где значения уже содержат venue. Для каждого signal выставить venue в Signal.

## fair_price.rs
- [ ] Уже venue-agnostic. Без изменений.
- [ ] Возможно вынести модель параметров в RuntimeConfig (UPDOWN_DELTA_SENSITIVITY etc.) — отдельной задачей

## models/trade.rs (Signal)
- [ ] `Signal` + `venue: VenueId` (default Polymarket для совместимости)

## Tests OK
