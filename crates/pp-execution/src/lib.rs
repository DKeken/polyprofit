pub mod orders;
pub mod heartbeat;
pub mod maker_loop;
pub mod fee_cache;
pub mod redeem;

use anyhow::Context;
use alloy::primitives::Address;
use alloy::signers::Signer as _;
use alloy::signers::local::PrivateKeySigner;
use polymarket_client_sdk::POLYGON;
use polymarket_client_sdk::auth::Credentials;
use polymarket_client_sdk::auth::Normal;
use polymarket_client_sdk::auth::state::Authenticated;
use polymarket_client_sdk::clob::types::{SignableOrder, SignedOrder};
use polymarket_client_sdk::clob::{Client as ClobClient, Config as ClobConfig};
/// Authenticated CLOB client type alias.
/// Created via `Client::new(...).authentication_builder(&signer).authenticate().await`.
pub type AuthClient = ClobClient<Authenticated<Normal>>;

/// Runtime-owned order signing backend.
///
/// Today we support the existing local private-key path, but the enum provides a
/// stable execution boundary for future signer backends (AWS KMS, remote signer, etc.)
/// without pretending signerless trading exists.
#[derive(Debug, Clone)]
pub enum AutoSigner {
    Local(PrivateKeySigner),
}

impl AutoSigner {
    pub fn local(signer: PrivateKeySigner) -> Self {
        Self::Local(signer.with_chain_id(Some(POLYGON)))
    }

    pub fn address(&self) -> Address {
        match self {
            Self::Local(signer) => signer.address(),
        }
    }

    pub async fn authenticate_client(&self, credentials: Option<Credentials>) -> anyhow::Result<AuthClient> {
        let mut auth = match self {
            Self::Local(signer) => {
                ClobClient::new("https://clob.polymarket.com", ClobConfig::default())?
                    .authentication_builder(signer)
            }
        };

        let has_creds = credentials.is_some();
        if let Some(credentials) = credentials {
            auth = auth.credentials(credentials);
        }

        let mut client = auth
            .authenticate()
            .await
            .context("CLOB authentication failed")?;

        if has_creds {
            ClobClient::start_heartbeats(&mut client)?;
        }
        Ok(client)
    }

    pub async fn sign_order(
        &self,
        client: &AuthClient,
        order: SignableOrder,
    ) -> anyhow::Result<SignedOrder> {
        match self {
            Self::Local(signer) => client
                .sign(signer, order)
                .await
                .context("Order signing failed"),
        }
    }
}

#[derive(Debug, Clone)]
pub struct LiveTradingContext {
    pub client: AuthClient,
    pub signer: AutoSigner,
}

impl LiveTradingContext {
    pub fn new(client: AuthClient, signer: AutoSigner) -> Self {
        Self { client, signer }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn local_auto_signer_preserves_address() {
        let raw = "0x59c6995e998f97a5a0044966f094538e41db72f727f3d6c2f3b6b9f4f6f9c1d4";
        let signer: PrivateKeySigner = raw.parse().expect("test key parses");
        let expected = signer.address();

        let auto = AutoSigner::local(signer);
        assert_eq!(auto.address(), expected);
    }
}
