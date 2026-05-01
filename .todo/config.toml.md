# config.toml — schema update

## Добавить секцию venues
```toml
[[venues]]
id = "polymarket"
enabled = true
host = "https://clob.polymarket.com"
gamma_host = "https://gamma-api.polymarket.com"
data_host = "https://data-api.polymarket.com"
chain_id = 137

[[venues]]
id = "hyperliquid"
enabled = false
host = "https://api.hyperliquid.xyz"

[[venues]]
id = "kalshi"
enabled = false
host = "https://api.elections.kalshi.com/trade-api/v2"
```

- [ ] Дефолтная конфигурация: только polymarket enabled (legacy-совместимость)
- [ ] Validate: ровно одна venue с enabled=true minimum
- [ ] `[strategy]` `assets` остался — Polymarket-specific. Generalize в будущем.
