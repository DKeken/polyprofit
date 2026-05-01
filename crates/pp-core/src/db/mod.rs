//! Embedded persistence via **redb** — a zero-config, single-file, ACID B+-tree DB.
//!
//! Each submodule owns one logical table:
//!   - `trades`  — full trade log, keyed by auto-increment u64
//!   - `state`   — daily_pnl, peak_balance and trading-date checkpoints
//!   - `config`  — last runtime config snapshot (survives restart)
//!   - `whales`  — tracked whale profiles
//!   - `equity`  — equity curve points for the dashboard
//!
//! All writes are transactional (crash-safe).

mod tables;
mod trades;
mod state;
mod config;
mod whales;
mod equity;
mod checkpoint;

use std::path::Path;

use anyhow::{Result, bail};
use redb::{Database, DatabaseError};
use tracing::{info, warn};

use tables::{CONFIG_T, EQUITY_CURVE_T, STATE_T, TRADES_T, WHALES_T};

pub use checkpoint::checkpoint_loop;

/// Wrapper around `redb::Database` for bot persistence.
pub struct BotDb {
    db: Database,
}

impl std::fmt::Debug for BotDb {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        f.debug_struct("BotDb").field("open", &true).finish()
    }
}

impl BotDb {
    /// Open (or create) the database file. Retries for up to 5 seconds if the
    /// file is locked by a previous process.
    pub fn open(path: impl AsRef<Path>) -> Result<Self> {
        let path = path.as_ref();
        let db = Self::open_with_retry(path)?;

        // Ensure tables exist (no-op if already created)
        let txn = db.begin_write()?;
        {
            let _ = txn.open_table(TRADES_T)?;
            let _ = txn.open_table(STATE_T)?;
            let _ = txn.open_table(CONFIG_T)?;
            let _ = txn.open_table(WHALES_T)?;
            let _ = txn.open_table(EQUITY_CURVE_T)?;
        }
        txn.commit()?;

        info!(path = %path.display(), "Database opened");
        Ok(Self { db })
    }

    fn open_with_retry(path: &Path) -> Result<Database> {
        const MAX_WAIT_MS: u64 = 5_000;
        const STEP_MS: u64 = 200;
        let mut waited = 0u64;
        loop {
            match Database::create(path) {
                Ok(db) => return Ok(db),
                Err(DatabaseError::DatabaseAlreadyOpen) if waited < MAX_WAIT_MS => {
                    warn!(
                        waited_ms = waited,
                        "DB locked by previous process, retrying in {}ms…", STEP_MS
                    );
                    std::thread::sleep(std::time::Duration::from_millis(STEP_MS));
                    waited += STEP_MS;
                }
                Err(e) => bail!("Failed to open DB at {:?}: {e}", path),
            }
        }
    }

    pub(crate) fn raw(&self) -> &Database {
        &self.db
    }
}

#[cfg(test)]
pub(crate) fn temp_db() -> BotDb {
    use std::sync::atomic::{AtomicU64, Ordering};
    static COUNTER: AtomicU64 = AtomicU64::new(0);
    let id = COUNTER.fetch_add(1, Ordering::Relaxed);
    let dir = std::env::temp_dir().join(format!(
        "polyprofit_test_{}_{}_{}",
        std::process::id(),
        id,
        std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .unwrap()
            .as_nanos()
    ));
    let path = dir.join("test.db");
    std::fs::create_dir_all(&dir).unwrap();
    BotDb::open(&path).unwrap()
}

