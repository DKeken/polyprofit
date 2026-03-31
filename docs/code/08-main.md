# Main — src/main.rs

> Оркестратор: инициализация, wiring всех crates, tokio::try_join!.
> Единственный бинарник — все crates собираются здесь.

---

```rust
use pp_core::{config::Config, types::*};
use std::sync::Arc;
use tokio::sync::RwLock;

#[tokio::main]
async fn main() -> anyhow::Result<()> {
    // 1. Structured logging (JSON в production, pretty в dev)
    tracing_subscriber::fmt()
        .with_env_filter("polyprofit=debug,pp_=debug")
        .json()
        .init();

    // 2. Config: файл → env vars override
    let config: Config = {
        let text = tokio::fs::read_to_string("config.toml").await?;
        let mut cfg: Config = toml::from_str(&text)?;
        // Private key ТОЛЬКО из env (никогда из файла)
        cfg.private_key = std::env::var("POLYMARKET_PRIVATE_KEY")
            .map_err(|_| anyhow::anyhow!("POLYMARKET_PRIVATE_KEY not set"))?;
        cfg
    };

    tracing::info!("Mode: {:?}, assets: {:?}", config.mode, config.strategy.assets);

    // 3. Shared state
    let state: Arc<RwLock<AppState>> = Arc::new(RwLock::new(AppState::default()));

    // 4. SDK client + auth
    let signer = alloy_signer_local::LocalSigner::from_str(&config.private_key)?
        .with_chain_id(Some(config.chain_id));

    let clob = polymarket_client_sdk::ClobClient::new(
        "https://clob.polymarket.com",
        Default::default(),
    )?
        .authentication_builder(&signer)
        .signature_type(SignatureType::PolyProxy)
        .authenticate()
        .await?;
    let clob = Arc::new(clob);

    // 5. Market discovery
    let markets = pp_discovery::discover(&config).await?;
    let markets = Arc::new(RwLock::new(markets));

    // 6. Fee cache
    let fee_cache: Arc<RwLock<HashMap<TokenId, u32>>> = Arc::new(RwLock::new(HashMap::new()));

    // 7. Запуск всех задач параллельно (fail-fast: одна упала → все стоп)
    tokio::try_join!(
        // Data feeds
        pp_feeds::rtds::run(state.clone()),
        pp_feeds::orderbook::run(state.clone(), markets.clone()),

        // ⚠️ HEARTBEAT — без него все ордера отменяются через 10-15с
        pp_execution::heartbeat::run(clob.clone()),

        // Strategy loop (каждые 500ms)
        pp_strategy::signal::run(
            state.clone(), markets.clone(), clob.clone(),
            &config, fee_cache.clone(),
        ),

        // ⚠️ Cancel/replace loop (каждые 200ms)
        pp_execution::maker_loop::run(state.clone(), clob.clone(), &config),

        // Background tasks
        pp_discovery::refresh_loop(markets.clone(), &config),
        pp_execution::redeem::run(clob.clone(), state.clone()),
        pp_execution::fee_cache::refresh_loop(fee_cache.clone(), markets.clone()),

        // Dashboard (Axum serves React + WS)
        pp_server::api::run(state.clone(), markets.clone(), &config),
    )?;

    Ok(())
}
```

### Порядок запуска задач

```
1. heartbeat       — ПЕРВЫМ (без него ордера не живут)
2. rtds + orderbook — данные должны течь до стратегии
3. signal loop      — начинает торговлю когда данные есть
4. maker_loop       — обновляет ордера при изменении цен
5. background       — discovery, redeem, fee cache
6. server           — дашборд последним (не критичен)
```

### config.toml — пример

```toml
mode = "Demo"        # "Demo" | "Live"
chain_id = 137       # Polygon

[strategy]
min_edge = 0.05      # 5% минимальный edge
min_prob = 0.15
max_prob = 0.85
max_spread = 0.06
order_strategy = "Passive"   # Passive | Balanced | Aggressive
market_refresh_secs = 60
assets = ["Btc", "Eth", "Sol", "Xrp"]

[risk]
daily_loss_limit = -100
daily_profit_cap = 100000
max_position_pct = 0.05
max_concurrent = 50
drawdown_limit = 0.20
adverse_fill_pause = 3

[server]
port = 3000
frontend_dist = "frontend/dist"
```
