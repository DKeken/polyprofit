//! Internal redb table definitions. One key-value table per logical store.

use redb::TableDefinition;

/// Trades: u64 auto-increment key → JSON-encoded TradeLog
pub(crate) const TRADES_T: TableDefinition<u64, &str> = TableDefinition::new("trades");

/// State: string key → string value.
/// Keys: `daily_pnl`, `peak_balance`, `trading_date`.
pub(crate) const STATE_T: TableDefinition<&str, &str> = TableDefinition::new("state");

/// Config: single key `runtime` → JSON-encoded RuntimeConfig
pub(crate) const CONFIG_T: TableDefinition<&str, &str> = TableDefinition::new("config");

/// Whales: address → JSON-encoded WhaleProfile
pub(crate) const WHALES_T: TableDefinition<&str, &str> = TableDefinition::new("whales");

/// Equity curve: unix_ts → cumulative pnl (cents)
pub(crate) const EQUITY_CURVE_T: TableDefinition<u64, i64> = TableDefinition::new("equity_curve");
