//! Polygon RPC helpers for on-chain balance lookups.
//!
//! Used by both the HTTP `wallet_info` admin endpoint and the
//! `pp-venue-polymarket` adapter's `Venue::balances()` implementation.

use anyhow::{anyhow, Result};

pub const POLYGON_RPC: &str = "https://polygon.drpc.org";
/// USDC.e on Polygon (bridged) — used by Polymarket as collateral — 6 decimals.
pub const USDC_E_ADDRESS: &str = "0x2791Bca1f2de4661ED88A30C99A7a9449Aa84174";
/// Native USDC on Polygon — 6 decimals.
pub const USDC_NATIVE_ADDRESS: &str = "0x3c499c542cEF5E3811e1192ce70d8cC03d5c3359";

/// Fetch native MATIC (POL) balance in whole-token units via `eth_getBalance`.
pub async fn fetch_matic_balance(address: &str) -> Result<f64> {
    let body = serde_json::json!({
        "jsonrpc": "2.0",
        "method": "eth_getBalance",
        "params": [address, "latest"],
        "id": 1
    });
    let resp: serde_json::Value = reqwest::Client::new()
        .post(POLYGON_RPC)
        .json(&body)
        .send()
        .await?
        .json()
        .await?;

    let hex = resp["result"]
        .as_str()
        .ok_or_else(|| anyhow!("no result in eth_getBalance response"))?;
    let wei = u128::from_str_radix(hex.trim_start_matches("0x"), 16)?;
    Ok(wei as f64 / 1e18)
}

/// Fetch an ERC-20 balance in whole-token units via `balanceOf`.
pub async fn fetch_erc20_balance(token: &str, wallet: &str, decimals: u32) -> Result<f64> {
    let addr_clean = wallet.trim_start_matches("0x");
    let data = format!("0x70a08231{:0>64}", addr_clean);

    let body = serde_json::json!({
        "jsonrpc": "2.0",
        "method": "eth_call",
        "params": [{ "to": token, "data": data }, "latest"],
        "id": 1
    });
    let resp: serde_json::Value = reqwest::Client::new()
        .post(POLYGON_RPC)
        .json(&body)
        .send()
        .await?
        .json()
        .await?;

    let hex = resp["result"]
        .as_str()
        .ok_or_else(|| anyhow!("no result in eth_call response"))?;
    let raw = u128::from_str_radix(hex.trim_start_matches("0x"), 16).unwrap_or(0);
    Ok(raw as f64 / 10f64.powi(decimals as i32))
}

/// Combined USDC balance (USDC.e + native USDC). Failures from either side
/// degrade gracefully to `0.0` for that leg so a single RPC blip doesn't hide
/// the other token.
pub async fn fetch_usdc_balance(address: &str) -> Result<f64> {
    let (bridged, native) = tokio::join!(
        fetch_erc20_balance(USDC_E_ADDRESS, address, 6),
        fetch_erc20_balance(USDC_NATIVE_ADDRESS, address, 6),
    );
    Ok(bridged.unwrap_or(0.0) + native.unwrap_or(0.0))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn balanceof_calldata_shape() {
        // hand-encode the same calldata as in fetch_erc20_balance and assert layout
        let wallet = "0xabCDEF0000000000000000000000000000000001";
        let addr = wallet.trim_start_matches("0x");
        let data = format!("0x70a08231{:0>64}", addr);
        assert!(data.starts_with("0x70a08231"));
        assert_eq!(data.len(), 2 + 8 + 64);
    }

    #[test]
    fn constants_are_polygon_addresses() {
        assert_eq!(USDC_E_ADDRESS.len(), 42);
        assert_eq!(USDC_NATIVE_ADDRESS.len(), 42);
        assert!(POLYGON_RPC.starts_with("https://"));
    }
}
