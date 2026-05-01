use chrono::Utc;
use rust_decimal_macros::dec;

use crate::types::{ConditionId, Side, TradeLog};
use super::super::temp_db;

#[test]
fn insert_and_load() {
    let db = temp_db();
    let trade = TradeLog {
        condition_id: ConditionId("cond_1".into()),
        side: Side::Yes,
        price: dec!(0.55),
        size: dec!(10.00),
        pnl: Some(dec!(4.50)),
        is_adverse: false,
        timestamp: Utc::now(),
    };
    assert_eq!(db.insert_trade(&trade).unwrap(), 0);
    assert_eq!(db.insert_trade(&trade).unwrap(), 1);
    assert_eq!(db.trade_count().unwrap(), 2);
    let loaded = db.load_trades().unwrap();
    assert_eq!(loaded.len(), 2);
    assert_eq!(loaded[0].price, dec!(0.55));
    assert_eq!(loaded[0].pnl, Some(dec!(4.50)));
}
