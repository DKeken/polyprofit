# Risk — pp-risk/

> Kill switches, position sizing, drawdown protection.
> Единственный модуль который может ОСТАНОВИТЬ торговлю.

---

## manager.rs

```rust
use pp_core::types::*;
use std::sync::atomic::{AtomicBool, AtomicU32, AtomicU64, Ordering};

pub struct RiskManager {
    daily_loss: Decimal,         // -$100
    daily_cap: Decimal,          // +$100_000
    max_pos_pct: f64,            // 0.05 (5% баланса на трейд)
    max_concurrent: usize,       // 50
    drawdown_limit: f64,         // 0.20 (20%)
    adverse_pause: u32,          // 3 подряд → пауза

    consecutive_adverse: AtomicU32,
    peak_balance: AtomicU64,     // центы (для atomic)
    paused: AtomicBool,
}

impl RiskManager {
    pub fn new(cfg: &RiskConfig) -> Self {
        Self {
            daily_loss: cfg.daily_loss_limit,
            daily_cap: cfg.daily_profit_cap,
            max_pos_pct: cfg.max_position_pct,
            max_concurrent: cfg.max_concurrent,
            drawdown_limit: cfg.drawdown_limit,
            adverse_pause: cfg.adverse_fill_pause,
            consecutive_adverse: AtomicU32::new(0),
            peak_balance: AtomicU64::new(0),
            paused: AtomicBool::new(false),
        }
    }

    /// Можно ли торговать? Проверяет ВСЕ лимиты.
    pub fn can_trade(&self, state: &AppState) -> bool {
        // Kill switch
        if self.paused.load(Ordering::Relaxed) { return false; }

        // Daily P&L limits
        if state.daily_pnl < self.daily_loss { return false; }
        if state.daily_pnl > self.daily_cap { return false; }

        // Max concurrent positions
        if state.positions.len() >= self.max_concurrent { return false; }

        // Adverse fill streak → pause
        if self.consecutive_adverse.load(Ordering::Relaxed) >= self.adverse_pause {
            return false;
        }

        // Drawdown protection
        let current_cents = (state.balance.to_f64().unwrap_or(0.0) * 100.0) as u64;
        let peak = self.peak_balance
            .fetch_max(current_cents, Ordering::Relaxed)
            .max(current_cents);
        if peak > 0 {
            let dd = (peak - current_cents) as f64 / peak as f64;
            if dd > self.drawdown_limit { return false; }
        }

        true
    }

    /// Kelly-inspired sizing: больше edge → больше позиция
    pub fn position_size(&self, edge: f64, balance: Decimal, min_edge: f64) -> Decimal {
        let bal = balance.to_f64().unwrap_or(0.0);
        let base = bal * self.max_pos_pct;
        let mult = (edge / min_edge).clamp(1.0, 3.0);
        let size = (base * mult).min(bal * 0.15).max(5.0); // min $5, max 15%
        Decimal::from_f64_retain(size).unwrap_or(Decimal::ZERO)
    }

    pub fn good_fill(&self)    { self.consecutive_adverse.store(0, Ordering::Relaxed); }
    pub fn adverse_fill(&self) { self.consecutive_adverse.fetch_add(1, Ordering::Relaxed); }
    pub fn pause(&self)        { self.paused.store(true, Ordering::Relaxed); }
    pub fn resume(&self)       { self.paused.store(false, Ordering::Relaxed); }
    pub fn is_paused(&self) -> bool { self.paused.load(Ordering::Relaxed) }
}
```

### Логика Kill Switches

```
Daily loss > $100      → STOP (автоматически)
Daily profit > $100k   → STOP (защита от бага)
Drawdown > 20%         → STOP
3 adverse fills подряд → PAUSE (resume через API)
Heartbeat dead         → НЕ ТОРГУЕМ (в signal.rs)
Manual PAUSE           → через dashboard /api/control/pause
```

### Что такое adverse fill?

Когда наш maker ордер заполняется **после** того как цена уже ушла в другую сторону. Это значит кто-то использовал нашу стейлую котировку. 3 подряд → стратегия сломана → пауза.
