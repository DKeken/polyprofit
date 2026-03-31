# 🛡️ Risks — Риск-менеджмент и защита

> Что может пойти не так и как защититься. Kill switches, лимиты, edge cases.

---

## Категории рисков

| Риск                                        | Вероятность              | Импакт                  | Защита                                   |
| ------------------------------------------- | ------------------------ | ----------------------- | ---------------------------------------- |
| Losing streak (20+ подряд)                  | Средняя                  | $100-500                | Daily loss limit                         |
| WebSocket disconnect                        | Высокая                  | Пропуск сигналов        | Auto-reconnect + zombie detection        |
| API rate limit                              | Средняя                  | Reject ордеров          | Batch orders (15 за раз)                 |
| Adverse fill (price moved)                  | Средняя                  | Убыток на сделке        | Post-only orders                         |
| **Adverse selection (после 500ms removal)** | **Высокая**              | **Убыточные fills**     | **Cancel/replace < 200ms**               |
| **Heartbeat failure**                       | **Высокая**              | **ВСЕ ордера отменены** | **Auto-heartbeat + мониторинг**          |
| Oracle update ускорится                     | Низкая                   | Стратегия умрёт         | Мониторить oracle_lag_ms                 |
| Polymarket изменит fees                     | ~~Низкая~~ **Произошло** | Уменьшит edge           | Авто-пересчёт + query fee-rate endpoint  |
| Polymarket заблокирует аккаунт              | Очень низкая             | Потеря баланса          | Не нарушать ToS, несколько wallets       |
| Сервер упадёт                               | Средняя                  | Открытые позиции        | State persistence + auto-redeem          |
| Chainlink Data Streams даунтайм             | Низкая                   | Нет сигналов            | Fallback на RTDS relay                   |
| **feeRateBps mismatch**                     | **Средняя**              | **Ордер отклонён**      | **Всегда query fee-rate перед подписью** |

---

## Kill Switches

> Реализация: [code/06-risk.md](./code/06-risk.md)

| Switch              | Порог                          | Действие                     |
| ------------------- | ------------------------------ | ---------------------------- |
| Daily loss limit    | -$100 (фаза 2), -$500 (фаза 4) | Auto-pause, resume 00:00 UTC |
| Drawdown от peak    | >20%                           | Auto-pause                   |
| Adverse fill streak | 3 подряд                       | Pause 5 мин                  |
| Heartbeat dead      | 3 неудачных подряд             | Не торгуем (в signal loop)   |
| Manual              | Dashboard / Telegram           | `/pause`, `/resume`          |

---

## ⚠️ Риски после февраля 2026

### Adverse Selection (500ms delay удалён)

> Реализация: [code/05-execution.md → maker_loop.rs](./code/05-execution.md#maker_looprs--cancelreplace--200ms)

Taker ордера исполняются мгновенно → стейлый maker ордер = убыток.

- Cancel/replace loop **< 200ms** обязателен
- Алерт если средний latency > 150ms → уменьшить активные ордера
- VPS (Dublin/London) обязателен для фазы 3+

### Heartbeat Failure

> Реализация: [code/05-execution.md → heartbeat.rs](./code/05-execution.md#heartbeatrs--обязательный-heartbeat) · API: [api.md](./api.md#heartbeat-api-критично--январь-2026)

Без heartbeat каждые 10с → **ВСЕ** ордера отменяются. Отправляем каждые 8с (2с буфер). 3 неудачи подряд → Telegram алерт.

---

## Защита от конкретных сценариев

> Реализация zombie detection / reconnect: [code/02-feeds.md](./code/02-feeds.md) · Stale data фильтры: [code/04-strategy.md](./code/04-strategy.md)

| Сценарий            | Проблема                          | Защита                                |
| ------------------- | --------------------------------- | ------------------------------------- |
| **Zombie WS**       | ping/pong OK, данные не идут      | `last_real_data` > 30с → reconnect    |
| **Crash recovery**  | Открытые позиции при рестарте     | `state.json` каждые 30с + auto-redeem |
| **Stale orderbook** | Данные > 30с                      | Skip рынок в signal loop              |
| **Stale Binance**   | Цена > 10с                        | Skip рынок                            |
| **Oracle lag ↓**    | Лаг < 5с = стратегия неэффективна | Алерт + мониторинг тренда             |

---

## Position Sizing

> Реализация: [code/06-risk.md → position_size()](./code/06-risk.md)

Kelly-inspired: `base = balance × 5%`, `mult = (edge / min_edge).clamp(1, 3)`, min $5, max 15%.

| Balance | Edge 10% | Edge 20% | Edge 30%+ |
| ------- | -------- | -------- | --------- |
| $100    | $5       | $10      | $15       |
| $500    | $25      | $50      | $75       |
| $2,000  | $100     | $200     | $300      |
| $10,000 | $500     | $1,000   | $1,500    |

Фаза 5: full Kelly criterion с half-Kelly для безопасности.

---

## Что НЕ делать

1. **Не торговать всем балансом** — max 15% на одну позицию
2. **Не торговать без stop-loss** — daily loss limit обязателен
3. **Не торговать в последние 5 минут** до resolution — слишком рискованно
4. **Не игнорировать adverse fills** — 3 подряд = пауза
5. **Не запускать live без demo** — минимум 50 demo сделок
6. **Не торговать на домашнем WiFi в production** — VPS обязателен (фаза 4+)
7. **Не хранить private key в коде** — только .env, только на сервере
8. **Не торговать один актив** — диверсификация BTC+ETH+SOL+XRP

---

## Мониторинг (метрики для дашборда)

| Метрика               | Healthy | Warning      | Critical |
| --------------------- | ------- | ------------ | -------- |
| Oracle lag (ms)       | >15,000 | 5,000-15,000 | <5,000   |
| Win rate (rolling 50) | >58%    | 50-58%       | <50%     |
| Daily P&L             | >$0     | -$50 to $0   | <-$50    |
| WS reconnects/hour    | 0-2     | 3-5          | >5       |
| Adverse fills/hour    | 0-1     | 2-3          | >3       |
| Order reject rate     | <5%     | 5-15%        | >15%     |
| RTDS data age (ms)    | <1,000  | 1,000-5,000  | >5,000   |

Отображать в React dashboard с цветовой индикацией (зелёный/жёлтый/красный).
