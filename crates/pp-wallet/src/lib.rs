//! Wallet abstraction layer.
//!
//! Separates key management from order execution, making it possible to swap
//! signing backends (local key, hardware wallet, KMS) without touching
//! trading logic in pp-execution.
//!
//! ## Supported backends
//! | Variant | Description |
//! |---------|-------------|
//! | `LocalWallet` | Private key from env var `POLYMARKET_PRIVATE_KEY` |
//!
//! ## Future backends (implement `WalletBackend`)
//! - `LedgerWallet` — hardware signing via HID
//! - `KmsWallet` — AWS/GCP KMS for server-side key management
//! - `MultiSigWallet` — threshold signatures for institutional use

use alloy::primitives::Address;
use alloy::signers::local::PrivateKeySigner;
use anyhow::{Result, bail};
use tracing::info;

pub mod polygon;

// ── Trait ──────────────────────────────────────────────────────────────────

/// Implemented by all wallet signing backends.
/// Callers only need the address; actual signing is done through the SDK
/// integration in pp-execution which accepts a `PrivateKeySigner` directly.
pub trait WalletBackend: Send + Sync + std::fmt::Debug {
    fn address(&self) -> Address;
}

// ── LocalWallet ────────────────────────────────────────────────────────────

/// Wallet backed by a plaintext private key (from env var or raw hex).
/// Intended for development and small automated deployments.
#[derive(Clone)]
pub struct LocalWallet {
    signer: PrivateKeySigner,
}

impl std::fmt::Debug for LocalWallet {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        f.debug_struct("LocalWallet")
            .field("address", &self.signer.address())
            .finish()
    }
}

impl LocalWallet {
    /// Parse a hex private key string (with or without `0x` prefix).
    /// Chain ID is set by the Polymarket SDK when building signed orders.
    pub fn from_hex(raw: &str) -> Result<Self> {
        let signer: PrivateKeySigner = raw.trim().parse().map_err(|_| {
            anyhow::anyhow!("POLYMARKET_PRIVATE_KEY is not a valid hex private key")
        })?;
        Ok(Self { signer })
    }

    /// Load from `POLYMARKET_PRIVATE_KEY` env var.
    /// Returns `Ok(None)` if the var is not set.
    /// Returns `Err` if the var is set to an invalid value.
    pub fn from_env() -> Result<Option<Self>> {
        static CACHED_WALLET: std::sync::OnceLock<Option<LocalWallet>> = std::sync::OnceLock::new();

        if let Some(cached) = CACHED_WALLET.get() {
            return Ok(cached.clone());
        }

        let raw = match std::env::var("POLYMARKET_PRIVATE_KEY").ok() {
            Some(v) => v,
            None => {
                let _ = CACHED_WALLET.set(None);
                return Ok(None);
            }
        };
        // A UUID-shaped value is a CLOB API key, not an EVM private key — skip silently.
        if is_uuid(raw.trim()) {
            let _ = CACHED_WALLET.set(None);
            return Ok(None);
        }
        if raw.trim().is_empty() {
            bail!("POLYMARKET_PRIVATE_KEY is set but empty");
        }
        let wallet = Self::from_hex(&raw)?;
        info!(address = %wallet.address(), "LocalWallet loaded from env");
        
        let _ = CACHED_WALLET.set(Some(wallet.clone()));
        Ok(Some(wallet))
    }

    /// Access the inner signer for Polymarket SDK calls that require it directly.
    pub fn inner_signer(&self) -> &PrivateKeySigner {
        &self.signer
    }
}

impl WalletBackend for LocalWallet {
    fn address(&self) -> Address {
        self.signer.address()
    }
}

// ── WalletSigner (unified enum) ────────────────────────────────────────────

/// Unified signer — wraps all supported wallet backends.
///
/// Add new backends here; calling code stays unchanged because it uses
/// `WalletBackend` methods or calls `inner_signer()` for SDK integration.
#[derive(Debug, Clone)]
pub enum WalletSigner {
    Local(LocalWallet),
}

impl WalletSigner {
    /// Load a `LocalWallet` from `POLYMARKET_PRIVATE_KEY` env var.
    pub fn from_env() -> Result<Option<Self>> {
        Ok(LocalWallet::from_env()?.map(Self::Local))
    }

    /// Access the underlying `PrivateKeySigner` for SDK calls (e.g. order signing).
    pub fn inner_signer(&self) -> &PrivateKeySigner {
        match self {
            Self::Local(w) => w.inner_signer(),
        }
    }
}

/// Returns true if `s` looks like a UUID (API key), not a hex private key.
fn is_uuid(s: &str) -> bool {
    let p: Vec<&str> = s.split('-').collect();
    matches!(p.as_slice(), [a, b, c, d, e]
        if a.len() == 8 && b.len() == 4 && c.len() == 4 && d.len() == 4 && e.len() == 12
        && [*a, *b, *c, *d, *e].iter().all(|seg| seg.chars().all(|c| c.is_ascii_hexdigit())))
}

impl WalletBackend for WalletSigner {
    fn address(&self) -> Address {
        match self {
            Self::Local(w) => w.address(),
        }
    }
}
