//! Cross-venue balance representation.

use rust_decimal::Decimal;
use serde::{Deserialize, Serialize};

use crate::VenueId;

/// One token balance line on a venue (collateral, native gas, outcome shares).
#[derive(Debug, Clone, Serialize, Deserialize, ts_rs::TS)]
#[ts(export)]
pub struct TokenBalance {
    pub venue: VenueId,
    pub token: String,
    #[ts(as = "String")]
    pub amount: Decimal,
    /// USD-denominated value if the venue exposes a price oracle.
    #[serde(skip_serializing_if = "Option::is_none")]
    #[ts(as = "Option<String>")]
    pub usd_value: Option<Decimal>,
}
