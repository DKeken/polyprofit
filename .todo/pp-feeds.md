# pp-feeds — refactor

## rtds.rs
- [ ] Новый SDK даёт `polymarket_sdk::rtds::Client` с типизированным subscribe (фича `rtds`)
- [ ] Опционально: переписать на SDK rtds. Минимум: проверить что URL `wss://ws-live-data.polymarket.com` всё ещё валидный
- [ ] Generalize: trait `PriceFeed` — RtdsFeed для Polymarket, BinanceFeed как fallback
- [ ] Subscription message формат — оставить как есть, проверить что сервер не сменил

## orderbook.rs
- [ ] Вместо raw WS — `polymarket_sdk::clob::ws::Client::subscribe_orderbook(asset_ids)` — type-safe
- [ ] Сейчас URL `wss://ws-subscriptions-clob.polymarket.com/ws/market` — оставить, но если SDK предоставляет — использовать
- [ ] Generalize: trait `OrderbookFeed::subscribe(asset_ids) -> Stream<Orderbook>`
- [ ] Subscription batching (20 per msg) сохранить
- [ ] Reconnect logic с zombie detection — оставить
