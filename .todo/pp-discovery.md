# pp-discovery — refactor

## lib.rs
- [ ] Переход с raw reqwest на `polymarket_sdk::gamma::Client`:
  ```rust
  use polymarket_sdk::gamma::{Client, types::request::EventsRequest};
  let gamma = Client::default();
  let req = EventsRequest::builder().active(true).limit(500).build();
  let events = gamma.events(&req).await?;
  ```
- [ ] Альтернатива (минимальное изменение): оставить reqwest, но добавить `&closed=false` в URL (default change Apr 2026)
- [ ] Дозаписать query: `&closed=false` чтобы избежать поведения нового default
- [ ] Pagination: новые keyset endpoints `/markets/keyset` cursor-based — для больших объёмов добавить
- [ ] Generalize: `discover()` → trait `MarketDiscovery::discover(state, asset_filter) -> Vec<Market>` чтобы Venue имели свой discovery
- [ ] Сейчас discovery — Polymarket-specific. Внутри pp-venue-polymarket можно перенести.

## Cleanup
- [ ] `extract_strike` — учесть знак "$" в начале/середине → используется только индекс 1; ОК
- [ ] Tests good — оставить
