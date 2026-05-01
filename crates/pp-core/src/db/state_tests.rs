use super::super::temp_db;

#[test]
fn balance_checkpoint() {
    let db = temp_db();
    assert!(db.load_balance_checkpoint().unwrap().is_none());
    db.checkpoint_balance(1234, 5678).unwrap();
    let (pnl, peak) = db.load_balance_checkpoint().unwrap().unwrap();
    assert_eq!(pnl, 1234);
    assert_eq!(peak, 5678);
    db.checkpoint_balance(-500, 9999).unwrap();
    let (pnl, peak) = db.load_balance_checkpoint().unwrap().unwrap();
    assert_eq!(pnl, -500);
    assert_eq!(peak, 9999);
}

#[test]
fn state_kv() {
    let db = temp_db();
    assert!(db.load_state("foo").unwrap().is_none());
    db.save_state("foo", "bar").unwrap();
    assert_eq!(db.load_state("foo").unwrap().unwrap(), "bar");
    db.save_state("foo", "baz").unwrap();
    assert_eq!(db.load_state("foo").unwrap().unwrap(), "baz");
}
