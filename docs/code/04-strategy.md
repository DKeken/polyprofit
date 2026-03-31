# Strategy — pp-strategy/

> Signal generation + fair probability calculation.
> Ядро бота: определяет КОГДА и В КАКУЮ СТОРОНУ торговать.

---

## signal.rs — Edge Detection Loop

```rust
use pp_core::types::*;

/// Главный цикл: каждые 500ms сканирует все рынки, ищет edge.
pub async fn run(
    state: Arc<RwLock<AppState>>,
    markets: Arc<RwLock<Vec<Market>>>,
    clob: Arc<ClobClient>,
    config: &Config,
    fee_cache: Arc<RwLock<HashMap<TokenId, u32>>>,
) -> anyhow::Result<()> {
    let risk = pp_risk::RiskManager::new(&config.risk);
    let mut interval = tokio::time::interval(Duration::from_millis(500));

    loop {
        interval.tick().await;

        let signals = generate_signals(&state, &markets, &config, &risk).await;

        for signal in signals {
            pp_execution::place_order(&clob, &signal, &state, &config, &fee_cache).await;
        }
    }
}

async fn generate_signals(
    state: &Arc<RwLock<AppState>>,
    markets: &Arc<RwLock<Vec<Market>>>,
    config: &Config,
    risk: &pp_risk::RiskManager,
) -> Vec<Signal> {
    let s = state.read().await;
    let m = markets.read().await;
    let mut signals = Vec::new();

    for market in m.iter() {
        // 1. Цены доступны?
        let asset_key = format!("{:?}", market.asset).to_lowercase();
        let Some(binance) = s.prices.binance.get(&asset_key) else { continue };
        let Some(chainlink) = s.prices.chainlink.get(&asset_key) else { continue };

        // 2. Данные свежие? (< 10 секунд)
        let now_ms = Utc::now().timestamp_millis();
        if (now_ms - binance.ts).abs() > 10_000 { continue; }
        if (now_ms - chainlink.ts).abs() > 60_000 { continue; } // chainlink медленнее

        // 3. Orderbook есть?
        let Some(book) = s.orderbooks.get(&market.token_yes) else { continue };
        if book.updated.elapsed() > Duration::from_secs(30) { continue; }

        // 4. Fair probability
        let Some(fair) = fair_price::calculate(market, binance.value, chainlink.value)
            else { continue };

        // 5. Edge = |fair - market_price|
        let (side, edge, entry) = best_side(fair, book);

        // 6. Фильтры
        if edge < config.strategy.min_edge { continue; }
        if entry < config.strategy.min_prob || entry > config.strategy.max_prob { continue; }
        if (book.ask - book.bid) > config.strategy.max_spread { continue; }
        if !risk.can_trade(&s) { continue; }
        if s.positions.contains_key(&market.condition_id) { continue; }

        // 7. Heartbeat жив?
        if !pp_execution::heartbeat::is_healthy() { continue; }

        // 8. Timing filter
        if !timing_ok(market) { continue; }

        signals.push(Signal {
            market: market.clone(),
            side, edge, fair_prob: fair, entry_price: entry,
            binance: binance.value,
            chainlink: chainlink.value,
        });
    }

    // Сортировка по edge (лучшие первыми)
    signals.sort_by(|a, b| b.edge.partial_cmp(&a.edge).unwrap());
    signals
}

fn best_side(fair: f64, book: &Orderbook) -> (Side, f64, f64) {
    let yes_edge = fair - book.ask;   // купить YES дёшево
    let no_edge = (1.0 - fair) - (1.0 - book.bid); // купить NO
    if yes_edge > no_edge {
        (Side::Yes, yes_edge, book.ask)
    } else {
        (Side::No, no_edge, 1.0 - book.bid)
    }
}

/// Timing: 5-мин рынки → вход за 5-30с до закрытия.
/// Остальные → не входить < 5 мин до закрытия.
fn timing_ok(market: &Market) -> bool {
    let Some(end) = market.end_date else { return true };
    let left = (end - Utc::now()).num_seconds();
    match market.kind {
        MarketKind::FiveMin => (5..=30).contains(&left),
        _ => left > 300,
    }
}
```

---

## fair_price.rs — Расчёт вероятности

```rust
/// Центральная функция: рынок + цены → fair probability (0.0 - 1.0)
pub fn calculate(market: &Market, binance: f64, chainlink: f64) -> Option<f64> {
    match market.kind {
        MarketKind::UpDown  => Some(up_down(binance, chainlink)),
        MarketKind::FiveMin => Some(five_min(binance, chainlink)),
        MarketKind::Above   => threshold(binance, market.strike?, true),
        MarketKind::Below   => threshold(binance, market.strike?, false),
        MarketKind::Dip     => touch(binance, market.strike?, false),
        MarketKind::Reach   => touch(binance, market.strike?, true),
        MarketKind::Range   => None, // TODO: извлечь low/high из question
    }
}

/// "Bitcoin Up or Down?" — delta от Chainlink
fn up_down(binance: f64, chainlink: f64) -> f64 {
    let delta = (binance - chainlink) / chainlink * 100.0;
    if delta.abs() < 0.07 { return 0.50; }
    match delta {
        d if d >  0.50 => 0.92,
        d if d >  0.25 => 0.82,
        d if d >  0.15 => 0.72,
        d if d >  0.07 => 0.62,
        d if d < -0.50 => 0.08,
        d if d < -0.25 => 0.18,
        d if d < -0.15 => 0.28,
        d if d < -0.07 => 0.38,
        _ => 0.50,
    }
}

/// 5-мин рынки: TIE (end >= start) = UP wins → bias 0.52
fn five_min(binance: f64, chainlink: f64) -> f64 {
    let delta = (binance - chainlink) / chainlink * 100.0;
    if delta.abs() < 0.03 { return 0.52; } // tie bias
    match delta {
        d if d >  0.30 => 0.94,
        d if d >  0.15 => 0.86,
        d if d >  0.07 => 0.74,
        d if d >  0.03 => 0.62,
        d if d < -0.30 => 0.06,
        d if d < -0.15 => 0.14,
        d if d < -0.07 => 0.26,
        d if d < -0.03 => 0.38,
        _ => 0.52,
    }
}

/// "BTC above $65k?" — расстояние от текущей цены до strike
fn threshold(binance: f64, strike: f64, is_above: bool) -> Option<f64> {
    let dist = (binance - strike) / strike * 100.0;
    let raw = match dist {
        d if d >  2.0 => 0.95,
        d if d >  1.0 => 0.85,
        d if d >  0.3 => 0.70,
        d if d > -0.3 => 0.50,
        d if d > -1.0 => 0.30,
        d if d > -2.0 => 0.15,
        _ => 0.05,
    };
    Some(if is_above { raw } else { 1.0 - raw })
}

/// "BTC dip to $60k?" / "BTC reach $70k?" — вероятность касания
fn touch(binance: f64, strike: f64, is_reach: bool) -> Option<f64> {
    let dist_pct = ((strike - binance) / binance * 100.0).abs();
    let base = match dist_pct {
        d if d < 0.5 => 0.75,
        d if d < 1.0 => 0.55,
        d if d < 2.0 => 0.35,
        d if d < 5.0 => 0.15,
        _ => 0.05,
    };
    Some(if is_reach { base } else { base })
}
```

### Ключевые решения

- **Пороги из backtest** — oracle-lag-sniper (5017 трейдов, 61% win rate)
- **5-min tie bias** — Polymarket resolves TIE как UP (`end >= start`)
- **T-10s window** — 85% направления определено за 10с до закрытия
- `fair_price` — pure function, без side effects, легко тестировать
- Thresholds настраиваются через config (TODO: автотюнинг через LLM на фазе 3)
