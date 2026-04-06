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

    // 2. Config
    let config: Config = {
        let text = tokio::fs::read_to_string("config.toml").await?;
        toml::from_str(&text)?
    };

    tracing::info!("Assets: {:?}", config.strategy.assets);

    // 3. Shared state
    let state: Arc<RwLock<AppState>> = Arc::new(RwLock::new(AppState::default()));

    // 4. Runtime auth + signer bootstrap
    // POLYMARKET_PRIVATE_KEY читается только из env и должен быть реальным EVM wallet key.
    // Optional L2 API credentials (API key / secret / passphrase) могут быть переиспользованы,
    // но order placement всё равно требует signer для EIP-712 подписи.
    let live = authenticate_runtime().await?;
    let clob = Arc::new(live.client);
    let signer = live.signer;

    // Auto-signing boundary живёт в execution layer:
    // main.rs больше не вызывает clob.sign(...) напрямую и не тащит concrete signer
    // через весь runtime.
    let _ = signer;

    // 5. Market discovery
    let markets = pp_discovery::discover(&config).await?;
    let markets = Arc::new(RwLock::new(markets));

    // 6. Fee cache
    let fee_cache: Arc<RwLock<HashMap<TokenId, u32>>> = Arc::new(RwLock::new(HashMap::new()));

    // 7. Запуск задач
    // В реальном runtime signal loop отправляет Signal в execution loop,
    // а execution loop уже вызывает pp_execution::orders::execute(..., &signer).
    // То есть подпись ордеров происходит внутри execution boundary, а не в main.rs.
    spawn_public_loops(&mut tasks, state.clone(), assets.clone(), config.clone());
    spawn_signal_loop(&mut tasks, state.clone(), config.clone(), signal_tx);
    spawn_execution_loop(&mut tasks, state.clone(), clob.clone(), signer, signal_rx);
    spawn_authenticated_loops(&mut tasks, state.clone(), clob, fee_cache.clone());

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
