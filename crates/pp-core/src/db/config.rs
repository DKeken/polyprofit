//! Runtime config persistence.

use anyhow::{Context, Result};
use tracing::debug;

use crate::models::config::RuntimeConfig;

use super::{BotDb, CONFIG_T};

impl BotDb {
    pub fn save_config(&self, config: &RuntimeConfig) -> Result<()> {
        let json = serde_json::to_string(config)?;
        let txn = self.raw().begin_write()?;
        {
            let mut table = txn.open_table(CONFIG_T)?;
            table.insert("runtime", json.as_str())?;
        }
        txn.commit()?;
        debug!("Runtime config persisted");
        Ok(())
    }

    pub fn load_config(&self) -> Result<Option<RuntimeConfig>> {
        let txn = self.raw().begin_read()?;
        let table = txn.open_table(CONFIG_T)?;
        match table.get("runtime")? {
            Some(val) => {
                let cfg: RuntimeConfig = serde_json::from_str(val.value())
                    .context("Failed to deserialize saved RuntimeConfig")?;
                Ok(Some(cfg))
            }
            None => Ok(None),
        }
    }
}

#[cfg(test)]
#[path = "config_tests.rs"]
mod config_tests;
