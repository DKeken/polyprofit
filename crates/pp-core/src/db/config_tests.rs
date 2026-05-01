use crate::models::config::RuntimeConfig;
use super::super::temp_db;

#[test]
fn save_load() {
    let db = temp_db();
    assert!(db.load_config().unwrap().is_none());
    let cfg = RuntimeConfig::default();
    db.save_config(&cfg).unwrap();
    let loaded = db.load_config().unwrap().unwrap();
    assert_eq!(loaded.min_edge, cfg.min_edge);
    assert_eq!(loaded.max_concurrent, cfg.max_concurrent);
}
