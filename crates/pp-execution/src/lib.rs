pub mod orders;
pub mod heartbeat;
pub mod maker_loop;
pub mod fee_cache;
pub mod redeem;

use polymarket_client_sdk::auth::state::Authenticated;
use polymarket_client_sdk::auth::Normal;
use polymarket_client_sdk::clob::Client as ClobClient;

/// Authenticated CLOB client type alias.
/// Created via `Client::new(...).authentication_builder(&signer).authenticate().await`.
pub type AuthClient = ClobClient<Authenticated<Normal>>;
