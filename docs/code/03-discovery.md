# Discovery — pp-discovery/

> Gamma API → поиск крипто-рынков → классификация → MarketRegistry.
> Обновляется каждые 60 секунд.

---

## markets.rs

```rust
use pp_core::types::*;

const GAMMA_API: &str = "https://gamma-api.polymarket.com";

pub type MarketRegistry = Vec<Market>;

/// Начальное обнаружение + парсинг всех крипто-рынков
pub async fn discover(config: &Config) -> anyhow::Result<MarketRegistry> {
    let client = reqwest::Client::new();
    let mut markets = Vec::new();

    for asset in &config.strategy.assets {
        let tag = match asset {
            Asset::Btc => "bitcoin",
            Asset::Eth => "ethereum",
            Asset::Sol => "solana",
            Asset::Xrp => "xrp",
        };

        let resp: Vec<GammaMarket> = client
            .get(format!("{GAMMA_API}/markets"))
            .query(&[
                ("tag", tag),
                ("active", "true"),
                ("closed", "false"),
                ("limit", "100"),
            ])
            .send().await?
            .json().await?;

        for gm in resp {
            if let Some(m) = parse_market(gm, *asset) {
                markets.push(m);
            }
        }
    }

    tracing::info!("Discovered {} crypto markets", markets.len());
    Ok(markets)
}

/// Фоновый цикл обновления каждые N секунд
pub async fn refresh_loop(
    registry: Arc<RwLock<MarketRegistry>>,
    config: &Config,
) -> anyhow::Result<()> {
    let interval = Duration::from_secs(config.strategy.market_refresh_secs);
    loop {
        tokio::time::sleep(interval).await;
        match discover(config).await {
            Ok(fresh) => {
                let mut r = registry.write().await;
                *r = fresh;
            }
            Err(e) => tracing::error!("Market refresh failed: {e}"),
        }
    }
}

// ── Parsing & Classification ──

fn parse_market(gm: GammaMarket, asset: Asset) -> Option<Market> {
    let q = gm.question.to_lowercase();
    let kind = classify(&q)?;
    let strike = extract_strike(&q);

    // Нужны оба токена
    let tokens = gm.tokens?;
    if tokens.len() < 2 { return None; }

    Some(Market {
        condition_id: ConditionId(gm.condition_id),
        question: gm.question,
        token_yes: TokenId(tokens[0].token_id.clone()),
        token_no: TokenId(tokens[1].token_id.clone()),
        asset,
        kind,
        strike,
        end_date: gm.end_date_iso.and_then(|s| s.parse().ok()),
        tick_size: gm.minimum_tick_size.parse().unwrap_or("0.01".parse().unwrap()),
        neg_risk: gm.neg_risk.unwrap_or(false),
    })
}

/// Классификация по тексту вопроса.
/// Порядок важен: FiveMin проверяется первым (содержит "up" как UpDown).
fn classify(q: &str) -> Option<MarketKind> {
    if q.contains("5 minute") || q.contains("5-minute") {
        Some(MarketKind::FiveMin)
    } else if q.contains("up or down") {
        Some(MarketKind::UpDown)
    } else if q.contains("dip") {
        Some(MarketKind::Dip)
    } else if q.contains("reach") || q.contains("hit") {
        Some(MarketKind::Reach)
    } else if q.contains("between") {
        Some(MarketKind::Range)
    } else if q.contains("above") {
        Some(MarketKind::Above)
    } else if q.contains("below") {
        Some(MarketKind::Below)
    } else {
        None // не крипто-рынок или неизвестный тип
    }
}

/// Извлечение strike price: "$65,000" → 65000.0
fn extract_strike(q: &str) -> Option<f64> {
    // regex: найти $XX,XXX или $XX,XXX.XX
    let re = regex::Regex::new(r"\$([0-9,]+\.?\d*)").ok()?;
    let caps = re.captures(q)?;
    let num_str = caps[1].replace(',', "");
    num_str.parse().ok()
}

// ── Gamma API response types ──

#[derive(Deserialize)]
struct GammaMarket {
    condition_id: String,
    question: String,
    tokens: Option<Vec<GammaToken>>,
    end_date_iso: Option<String>,
    minimum_tick_size: String,
    neg_risk: Option<bool>,
}

#[derive(Deserialize)]
struct GammaToken {
    token_id: String,
}
```

### LLM-заметка для будущего агента

- `classify()` — regex-based, работает для 95% рынков
- Если Polymarket изменит формат вопросов → classify сломается
- **Фаза 3:** заменить на LLM classifier (OpenRouter, дешёвая модель)
- `extract_strike()` — простой regex, хрупкий. LLM парсит лучше.
