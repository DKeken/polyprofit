# pp-execution — refactor

## lib.rs
- [ ] Замена импортов: `polymarket_client_sdk` → `polymarket_sdk` (rename via Cargo)
- [ ] AutoSigner: убрать catch_unwind hack для start_heartbeats — новый SDK имеет feature flag `heartbeats` который сам шлёт. Просто `Client::new(host, Config::default()).heartbeats(true)` если поддерживается, либо через builder
- [ ] `authenticate_client` adapt: новый API
  ```
  let client = Client::new(host, Config::default())?
      .authentication_builder(&signer)
      .authenticate()
      .await?;
  ```
- [ ] Убрать `Credentials` legacy если не нужен — проверить что новый SDK сам обрабатывает API key derivation
- [ ] Type alias: `pub type PolymarketClient = polymarket_sdk::clob::Client<polymarket_sdk::auth::state::Authenticated<...>>`. Переименовать `AuthClient` → `PolymarketClient`. (или скрыть за trait Venue — если делаем Venue первым).

## orders.rs
- [ ] `sdk_side(side)` ВСЕГДА Buy → удалить функцию, инлайнить `SdkSide::Buy` (комментарий: token_id selects outcome)
- [ ] `client.limit_order().token_id(token_u256)…` — token_id в новом SDK принимает строку или U256. Проверить сигнатуру.
- [ ] `Amount::usdc(...)` остался
- [ ] `client.post_order(signed)` — ответ структура та же (`response.success`, `response.order_id`, `response.error_msg`)
- [ ] Тесты остались валидны

## maker_loop.rs
- [ ] `client.cancel_orders(&ids)` / `cancel_order(&id)` — оба остались
- [ ] Без изменений основной логики

## redeem.rs
- [ ] `CancelMarketOrderRequest::builder().market(market_b256).build()` — проверить новое имя в SDK (возможно `MarketCancelRequest` или путь сменился)
- [ ] `client.cancel_market_orders(&req)` — проверить
- [ ] Gamma resolution fetch — заменить raw reqwest на `polymarket_sdk::gamma::Client` для type safety (опционально). Минимум — оставить reqwest но обновить URL/параметры если изменились (ничего не изменилось)

## heartbeat.rs
- [ ] `client.heartbeats_active()` — проверить что метод остался; если нет — удалить файл (новый SDK heartbeat фичей сам мониторит)
- [ ] Если остался — оставить как есть

## fee_cache.rs
- [ ] `client.fee_rate_bps(token_u256)` — проверить наличие в новом SDK; в V2 fee структура поменялась (см `feeRateBps` поле теперь только V1; V2 builder_code основной)
- [ ] Если метод убран — pivot: запрашивать через REST `/markets/{condition_id}` маркет-лвл fee
- [ ] response.base_fee → возможно другое поле имя

## ВАЖНО
- В новом SDK type для clob::Client параметризован Authenticated<Auth> где Auth — Normal или Builder
- Если делаем Venue trait — pp-execution становится трансляцией Signal → Venue::place_order
