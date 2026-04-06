# 💰 Strategy — Максимизация профита

> Полная бизнес-стратегия. Экономика, рынки, тайминг, масштабирование.

---

## Суть стратегии

**Oracle Latency Arbitrage:** Chainlink обновляет цену с задержкой 15–55 секунд. В это окно реальная цена (Binance) уже известна, но Polymarket ещё не переоценил контракты. Покупаем правильную сторону дёшево → рынок догоняет → профит.

---

## Контекст (фев–мар 2026)

> Полная хронология: [fees.md](./fees.md) · API details: [api.md](./api.md) · Риски: [risks.md](./risks.md)

Ключевые факты, влияющие на стратегию:

- **Maker = 0% fee** навсегда + ежедневные USDC rebates → [fees.md](./fees.md#maker-rebates-program)
- **Taker fee до 1.80%** (crypto при p=0.50) → maker-first обязателен
- **500ms taker delay удалён** → cancel/replace < 200ms обязателен
- **Heartbeat каждые 10с** → без него все ордера отменяются
- **5-мин рынки** — 288/день, Chainlink Data Streams, **tie = UP wins** (bias ~51%)
- **85% направления** определено за T-10с до закрытия, но odds ещё не отражают
- Sweet spot для входа: **5-30 секунд до закрытия 5-мин рынка**

---

## 5 уровней edge (стратегии)

### Edge 1: Oracle Latency — основной (~60% прибыли)

Binance двинулась, Chainlink ещё нет, маркет-мейкеры ещё не переоценили.

| Параметр             | Значение                                                |
| -------------------- | ------------------------------------------------------- |
| Окно                 | 15–55 сек                                               |
| Win rate             | 61–73%                                                  |
| Avg return per trade | 11.8%                                                   |
| Рынки                | 5-мин, 15-мин, 1-час BTC/ETH/SOL/XRP                    |
| Сигнал               | `delta_pct = (binance - chainlink) / chainlink > 0.07%` |

### Edge 2: Multi-Market Spread (~25% прибыли)

Один ценовой сигнал BTC → множество рынков одновременно:

- "Will BTC dip to $65k?" → NO
- "Will BTC reach $68k?" → YES
- "Will BTC be above $64k?" → YES
- "BTC Up or Down?" → UP
- "Will BTC be between $64k-$66k?" → YES

**Один сигнал = 5–15 ордеров.** Разные рынки обновляются с разной скоростью → больше окон.

### Edge 3: Post-Only Maker Orders (0% fee)

| Тип ордера            | Fee при p=0.50 (crypto) | Стратегия               |
| --------------------- | ----------------------- | ----------------------- |
| Taker (FOK/FAK)       | **1.80%**               | Быстро, но дорого       |
| Maker (GTC post-only) | **0%**                  | Медленнее, но бесплатно |

**Подход:** при divergence ставь limit order чуть лучше best_bid. Другие тейкеры заполнят когда будут догонять рынок.

### Edge 4: Batch Orders (до 15 за раз)

Один API-вызов → 15 ордеров по 15 рынкам. Как бот из видео: один сигнал BTC → пачка ордеров.

### Edge 5: Fee-Free Markets

| Категория       | Peak Fee  | Тактика                              |
| --------------- | --------- | ------------------------------------ |
| **Geopolitics** | **0%**    | Рынки коррелированные с крипто       |
| Weather         | 1.25%     | Минимальная                          |
| Sports          | 0.75%     | Низкая                               |
| Economics       | 1.50%     | Macro = BTC-коррелированы            |
| **Crypto**      | **1.80%** | Основная — компенсируем maker orders |

---

## Экономика

### Сценарий 1: Taker (быстрый вход, 1.8% fee)

```
Вход: BUY YES @ $0.50, true probability ~73%
Fee: 1.8% × $0.50 = $0.009
Стоимость: $0.509

Если WIN (73%):  +$1.00 - $0.509 = +$0.491
Если LOSS (27%): -$0.509

E[profit] = 0.73 × $0.491 - 0.27 × $0.509 = +$0.221
ROI per trade = 43.4%
```

### Сценарий 2: Maker (post-only, 0% fee)

```
Вход: BUY YES @ $0.50, true probability ~73%
Fee: 0%

E[profit] = 0.73 × $0.50 - 0.27 × $0.50 = +$0.230
ROI per trade = 46.0%
```

### Сценарий 3: Слабый сигнал (edge 12%)

```
Вход: BUY YES @ $0.50, true probability ~62%
Taker fee: $0.009

E[profit] = 0.62 × $0.491 - 0.38 × $0.509 = +$0.111
ROI per trade = 21.8%
```

**Вывод:** даже слабые сигналы прибыльны. Но фокус на сильные (edge > 15%).

### Реалистичная оценка дохода

> Честный P&L анализ: [architecture.md](./architecture.md#честный-pl-анализ) · Backtest data: [integration.md](./integration.md#1-oracle-lag-sniper--главный-источник-логики)

- **$500 капитал:** ~$250-500/мес (maker-only, 4 актива)
- **$2,000 капитал:** ~$1,000-2,000/мес
- **$10,000+ капитал:** потенциально $500+/день (как в видео: $985/день)

---

## Порядок ордеров (Order Strategy)

```
Signal detected (edge > MIN_EDGE):
  │
  ├─ Если edge > 0.20 (сильный):
  │   → POST-ONLY GTC (maker, 0% fee)
  │   → Ждать 3 секунды
  │   → Если не исполнен → cancel, fallback FAK (taker, 1.8%)
  │
  ├─ Если edge 0.15–0.20 (средний):
  │   → POST-ONLY GTC (maker, 0% fee)
  │   → Если reject → skip (не стоит taker fee)
  │
  └─ Если edge 0.10–0.15 (слабый):
      → POST-ONLY GTC only
      → Если reject → skip
```

---

## Выбор рынков

### Приоритет рынков (по прибыльности)

1. **15-мин Up/Down** — самый ликвидный, самое стабильное окно
2. **1-час Up/Down** — больше времени, больше edge
3. **5-мин Up/Down** — быстрый, но узкое окно
4. **Above/Below $X** — множество одновременных рынков
5. **Dip to / Reach $X** — touch contracts, менее ликвидные
6. **Range** — сложная оценка, низкий приоритет

### Активы (по win rate из бэктеста)

1. **ETH** — 62.7% WR, лучший avg return 14.8%
2. **BTC** — 61.5% WR, самый ликвидный
3. **XRP** — 61.4% WR, хороший return 11.6%
4. **SOL** — 60.1% WR, наименее стабильный

---

## Масштабирование (Roadmap)

### Фаза 1: Dry run / verification ($0, 1-2 дня)

- Прогнать `make verify` и поднять runtime без panic
- Проверить signal timing, win rate в логах
- Убедиться что WS стабильны

### Фаза 2: Micro-real ($100, 3-5 дней)

- $5/trade, только BTC 15-мин Up/Down
- Post-only maker orders only
- Daily loss limit: $50
- Цель: 50+ сделок, проверить реальный win rate

### Фаза 3: Scale ($500, 1-2 недели)

- $10-20/trade
- Добавить ETH, SOL, XRP
- Добавить Above/Dip/Reach рынки
- Daily loss limit: $150

### Фаза 4: Full ($2,000+, ongoing)

- $20-50/trade
- Все типы рынков + multi-market batch
- Агрессивная стратегия (taker fallback при strong signals)
- Daily loss limit: $500
- Добавить Kalshi cross-arb
- Рассмотреть VPS (NY/LDN) для минимизации latency

### Фаза 5: Professional ($10,000+)

- Chainlink Direct access (не через RTDS relay)
- Colocation VPS рядом с Polymarket servers
- Position sizing по Kelly criterion
- Multiple wallet round-robin
- Maker rebates income (отдельный доход от 20% taker fees)

---

## Тайминг

### Когда торговать

| Период                             | Волатильность | Качество сигналов |
| ---------------------------------- | ------------- | ----------------- |
| **US Market Open (9:30-11:00 ET)** | Высокая       | Отличное          |
| **Overlap US+EU (8:00-12:00 ET)**  | Высокая       | Хорошее           |
| **FOMC/CPI announcements**         | Экстремальная | Отличное          |
| Ночь (Азия)                        | Средняя       | Среднее           |
| Выходные                           | Низкая        | Плохое            |

### Когда НЕ торговать

- Низкая волатильность (BTC ±0.1% за час) → мало сигналов, low edge
- Рынки с <$10k volume/24h → плохая ликвидность
- Последние 5 минут до resolution → слишком рискованно

---

## Конкуренция

### Кто ещё торгует?

- **PolyCryptoBot** — платный SaaS ($? на whop.com), 5-мин BTC
- **Частные боты** — как в видео ($985/день, Rust)
- **MM боты** — маркет-мейкеры, быстро подтягивают цены

### Как выигрывать?

1. **Rust** — быстрее Python ботов (большинство конкурентов на Python)
2. **Multi-market** — один сигнал → 15 рынков (больше edge windows)
3. **Maker orders** — 0% fee vs taker 1.8% = структурное преимущество
4. **VPS** — latency 5-10ms vs 100-200ms домашний WiFi
5. **Signal quality** — не торговать слабые сигналы, only strong edge
