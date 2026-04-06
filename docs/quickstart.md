# 🚀 Quickstart — От нуля до первой сделки

> Пошаговый чеклист. Каждый шаг — конкретное действие.

---

## Prerequisites

- [ ] Rust toolchain (`rustup`, stable latest)
- [ ] Node.js 18+ (для React фронта)
- [ ] Polymarket аккаунт с USDC (начать с $100)
- [ ] Private key от кошелька (MetaMask export или новый wallet)
- [ ] VPS рекомендован для production (DigitalOcean / Hetzner, $5-20/мес)

---

## Для текущего репозитория

Если ты уже работаешь внутри существующего `polyprofit`, **не нужно** заново создавать monorepo или инициализировать crates. В этом репозитории проект уже собран; основной operational path сейчас такой:

```bash
make verify
cargo run --release
```

Что это даёт:

- `make verify` проверяет Rust tests + frontend lint/tests/build
- `cargo run --release` запускает текущий runtime
- после старта имеет смысл сделать smoke test Dashboard и Settings flow

Ниже в документе остаются и исторические bootstrap-шаги — они полезны как reference для первоначальной сборки проекта с нуля, но не нужны для повседневной работы с текущей кодовой базой.

---

## Шаг 1: Инициализация проекта (Cargo Workspace)

> Исторический bootstrap path. Для текущего репозитория обычно пропускается.


```bash
# Создать monorepo
mkdir polyprofit && cd polyprofit
mkdir -p src crates/{pp-core,pp-feeds,pp-discovery,pp-strategy,pp-execution,pp-risk,pp-server}/src

# Инициализировать каждый crate
for crate in pp-core pp-feeds pp-discovery pp-strategy pp-execution pp-risk pp-server; do
  cargo init crates/$crate --lib
done

# Главный бинарник
echo 'fn main() { println!("polyprofit"); }' > src/main.rs
```

**Cargo.toml** (корневой) — скопировать из [architecture.md → Cargo.toml](./architecture.md#cargo-workspace).

```bash
# Frontend (React 19 + Vite 6 + Tailwind 4)
npm create vite@latest frontend -- --template react-ts
cd frontend
npm install recharts
npm install -D tailwindcss @tailwindcss/vite
```

---

## Шаг 2: Конфигурация

Два файла: `config.toml` (параметры) + `.env` (только секреты).

**.env** (НИКОГДА не коммитить):

```env
POLYMARKET_PRIVATE_KEY=0x...
# optional: reuse existing API credentials
# POLYMARKET_API_KEY=xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx
# POLYMARKET_SECRET=...
# POLYMARKET_PASSPHRASE=...
```

**config.toml** — полный пример в [code/08-main.md → config.toml](./code/08-main.md#configtoml--пример).

---

## Шаг 3: Проверить подключение

Создать минимальный тест: подключиться к RTDS и увидеть цены.

Важно: `POLYMARKET_PRIVATE_KEY` должен быть именно wallet private key. Если у вас есть готовый Polymarket API key bundle, UUID нужно класть в `POLYMARKET_API_KEY`, а не в `POLYMARKET_PRIVATE_KEY`.

Важно: auto-signing в runtime означает, что приложение автоматически вызывает настроенный signer backend при `post_order`, но requirement на EIP-712 signer никуда не исчезает. L2 API credentials (`POLYMARKET_API_KEY` / `POLYMARKET_SECRET` / `POLYMARKET_PASSPHRASE`) аутентифицируют CLOB запросы, но не заменяют wallet signer.

```rust
// src/bin/test_rtds.rs
use tokio_tungstenite::connect_async;
use futures::StreamExt;

#[tokio::main]
async fn main() -> anyhow::Result<()> {
    let (mut ws, _) = connect_async("wss://ws-live-data.polymarket.com").await?;

    // Подписка
    let sub = serde_json::json!({
        "action": "subscribe",
        "subscriptions": [{
            "topic": "crypto_prices",
            "type": "update",
            "filters": "btcusdt"
        }]
    });
    ws.send(tokio_tungstenite::tungstenite::Message::Text(
        sub.to_string()
    )).await?;

    // Читать 10 сообщений
    for _ in 0..10 {
        if let Some(Ok(msg)) = ws.next().await {
            println!("{}", msg);
        }
    }

    Ok(())
}
```

```bash
cargo run --bin test_rtds
# Должен показать BTC цены от Binance
```

---

## Шаг 4: Проверить Gamma API

```rust
// src/bin/test_gamma.rs
#[tokio::main]
async fn main() -> anyhow::Result<()> {
    let resp = reqwest::get(
        "https://gamma-api.polymarket.com/markets?active=true&closed=false&limit=5"
    ).await?.text().await?;

    let markets: Vec<serde_json::Value> = serde_json::from_str(&resp)?;
    for m in &markets {
        println!("{} | tokens: {:?}",
            m["question"],
            m["clobTokenIds"]
        );
    }
    Ok(())
}
```

```bash
cargo run --bin test_gamma
# Должен показать 5 активных рынков с token IDs
```

---

## Шаг 5: Проверить аутентификацию CLOB

```rust
// src/bin/test_auth.rs
use polymarket_client_sdk::clob::{Client, Config};
use polymarket_client_sdk::auth::LocalSigner;
use polymarket_client_sdk::POLYGON;
use std::str::FromStr;

#[tokio::main]
async fn main() -> anyhow::Result<()> {
    dotenvy::dotenv().ok();
    let pk = std::env::var("POLYMARKET_PRIVATE_KEY")?;
    let signer = LocalSigner::from_str(&pk)?.with_chain_id(Some(POLYGON));

    let client = Client::new("https://clob.polymarket.com", Config::default())?
        .authentication_builder(&signer)
        .authenticate()
        .await?;

    let ok = client.ok().await?;
    println!("CLOB connected: {ok}");

    let keys = client.api_keys().await?;
    println!("API keys: {keys:?}");

    Ok(())
}
```

```bash
cargo run --bin test_auth
# Должен показать "CLOB connected: OK" и API keys
```

---

## Шаг 5.5: Проверить Fee Rate Endpoint

```rust
// src/bin/test_fee_rate.rs
#[tokio::main]
async fn main() -> anyhow::Result<()> {
    // Получить token_id из test_gamma (шаг 4)
    let token_id = "YOUR_TOKEN_ID_FROM_STEP_4";
    let url = format!(
        "https://clob.polymarket.com/fee-rate?token_id={}",
        token_id
    );
    let resp = reqwest::get(&url).await?.text().await?;
    println!("Fee rate: {}", resp);
    // Ожидаемый ответ: {"fee_rate_bps": "150"} для крипто-рынков
    Ok(())
}
```

```bash
cargo run --bin test_fee_rate
# Должен показать feeRateBps (например 150 = 1.50%)
# НИКОГДА не хардкодить это значение — всегда запрашивать!
```

> ⚠️ **ВАЖНО:** С января 2026 ордера БЕЗ `feeRateBps` в signed payload **отклоняются** на fee-enabled рынках. SDK обрабатывает это автоматически.

---

## Шаг 6: Запуск runtime

```bash
cargo run --release
```

Для **текущего репозитория** ориентируйся не на точное совпадение исторических лог-строк, а на живой runtime:

- backend стартует без panic
- dashboard открывается
- tick/state обновляются
- heartbeat отображается как runtime liveness
- Settings flow сохраняет config и показывает backend validation errors

**Что проверить:**

- [ ] `make verify` проходит до запуска
- [ ] Dashboard открывается и показывает live tick/state
- [ ] RTDS показывает Binance и Chainlink цены
- [ ] heartbeat выглядит как operational health signal runtime'а
- [ ] Settings сохраняет изменения и показывает backend validation errors
- [ ] после reload страницы config совпадает с persisted server state
- [ ] сигналы/метрики обновляются без залипания UI
- [ ] Oracle lag 15-55 секунд (проверить в логах)

> Исторические примеры `test_rtds`, `test_gamma`, `test_auth` в этом документе полезны как low-level diagnostics/reference, но основной путь проверки текущего приложения — это `make verify` + runtime smoke test.

---

## Рекомендуемый путь проверки

1. `make verify`
2. `cargo run --release`
3. smoke test Dashboard
4. smoke test Settings/config persistence
5. только потом — отдельные low-level API diagnostics при необходимости

---

## Исторические низкоуровневые шаги

Ниже и выше по документу сохранены low-level примеры как reference для изолированной диагностики интеграций. Для текущего репозитория они вторичны по сравнению с полным runtime smoke test.

---

## Шаг 7: Фронтенд

```bash
cd frontend
npm run dev
# Открыть http://localhost:5173
# Показывает дашборд с реальными данными от Rust backend
```

---

## Шаг 8: Token Allowances (только для EOA, один раз)

> Контракты и адреса: [api.md → Token Allowances](./api.md#token-allowances-eoa-only)

Если EOA wallet — нужно одноразово approve USDC + Conditional Tokens для 3 exchange контрактов. Proxy/GnosisSafe — автоматически.

---

## Шаг 9: Первая реальная сделка

```bash
# config.toml: [risk] daily_loss_limit = -50
# .env: POLYMARKET_PRIVATE_KEY=0x...

cargo run --release
```

**Чеклист перед первым запуском с реальным исполнением:**

- [ ] `make verify` проходит
- [ ] Balance на кошельке: минимум $100 USDC
- [ ] POL на кошельке для gas (если EOA): ~0.5 POL
- [ ] Daily loss limit установлен
- [ ] Telegram уведомления настроены (опционально)

---

## Шаг 10: Масштабирование

> Подробный roadmap по фазам: [strategy.md → Масштабирование](./strategy.md#масштабирование-roadmap)

$100 (BTC only) → $500 (BTC+ETH) → $2k (все 4 актива) → $10k+ (все + Kalshi).

---

## Troubleshooting

| Проблема                       | Причина                   | Решение                                    |
| ------------------------------ | ------------------------- | ------------------------------------------ |
| "CLOB connected: unauthorized" | Неправильный private key  | Проверить .env                             |
| "No markets found"             | Gamma API даунтайм        | Подождать 5 мин                            |
| RTDS не шлёт данные            | Zombie connection         | Проверить zombie detection                 |
| "Order rejected: price"        | Tick size mismatch        | SDK должен обрабатывать auto               |
| "Order rejected: post_only"    | Ордер бы исполнился сразу | Нормально — retry или skip                 |
| Высокий reject rate (>20%)     | Конкуренция, stale prices | Уменьшить MIN_EDGE или перейти на balanced |
| Win rate < 50%                 | Слишком слабый edge       | Увеличить MIN_EDGE до 0.15                 |
