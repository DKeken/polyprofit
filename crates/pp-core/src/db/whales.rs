//! Whale profile persistence.

use anyhow::Result;
use redb::ReadableTable;
use tracing::warn;

use crate::types::WhaleProfile;

use super::{BotDb, WHALES_T};

impl BotDb {
    pub fn save_whale(&self, profile: &WhaleProfile) -> Result<()> {
        let json = serde_json::to_string(profile)?;
        let txn = self.raw().begin_write()?;
        {
            let mut table = txn.open_table(WHALES_T)?;
            table.insert(profile.address.as_str(), json.as_str())?;
        }
        txn.commit()?;
        Ok(())
    }

    pub fn load_whales(&self) -> Result<Vec<WhaleProfile>> {
        let txn = self.raw().begin_read()?;
        let table = txn.open_table(WHALES_T)?;
        let mut loaded = Vec::new();
        for entry in table.iter()? {
            let (_, val) = entry?;
            match serde_json::from_str::<WhaleProfile>(val.value()) {
                Ok(w) => loaded.push(w),
                Err(e) => warn!("Skipping corrupt whale record: {e}"),
            }
        }
        Ok(loaded)
    }

    pub fn delete_whale(&self, address: &str) -> Result<()> {
        let txn = self.raw().begin_write()?;
        {
            let mut table = txn.open_table(WHALES_T)?;
            table.remove(address)?;
        }
        txn.commit()?;
        Ok(())
    }
}
