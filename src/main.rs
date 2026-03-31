use std::sync::Arc;

use anyhow::{Context, Result};
use tracing::info;
use tracing_subscriber::EnvFilter;

use alloy::signers::Signer as _;
use alloy::signers::local::PrivateKeySigner;
use polymarket_client_sdk::clob::{Client as ClobClient, Config as ClobConfig};
use polymarket_client_sdk::POLYGON;

use pp_core::{AppState, Config, Mode};
use pp_execution::fee_cache;

#[tokio::main]
async fn main() -> Result<()> {
    tracing_subscriber::fmt()
        .with_env_filter(
            EnvFilter::try_from_default_env().unwrap_or_else(|_| EnvFilter::new("info")),
        )
        .json()
        .init();

    info!("polyprofit starting...");

    let config = Arc::new(Config::load("config.toml")?);
    info!(mode = ?config.mode, "Config loaded");

    let state = AppState::new(config.mode);
    state.set_starting_balance(config.risk.starting_balance);
    let fee_cache = fee_cache::new_fee_cache();

    // ── SDK authentication (Live only) ──
    // Single signer creation: used for auth, then kept for order signing.
    let (clob_client, signer_for_orders): (Option<Arc<pp_execution::AuthClient>>, Option<PrivateKeySigner>) = if config.mode == Mode::Live {
        let private_key = std::env::var("POLYMARKET_PRIVATE_KEY")
            .context("POLYMARKET_PRIVATE_KEY must be set for Live mode")?;

        let signer: PrivateKeySigner = private_key.parse()
            .context("Invalid POLYMARKET_PRIVATE_KEY")?;
        let signer = signer.with_chain_id(Some(POLYGON));

        info!(address = %signer.address(), "Signer loaded");

        let mut client = ClobClient::new("https://clob.polymarket.com", ClobConfig::default())?
            .authentication_builder(&signer)
            .authenticate()
            .await
            .context("CLOB authentication failed")?;

        info!("CLOB client authenticated");

        ClobClient::start_heartbeats(&mut client)?;
        info!("SDK auto-heartbeat started (interval: 5s)");

        // signer is still valid after auth (auth_builder takes &signer)
        (Some(Arc::new(client)), Some(signer))
    } else {
        info!("Demo mode — SDK disabled");
        (None, None)
    };

    let (signal_tx, mut signal_rx) = tokio::sync::mpsc::channel(256);

    let assets = config.strategy.assets.clone();
    let assets_feed = assets.clone();
    let assets_discovery = assets.clone();
    let refresh_secs = config.strategy.market_refresh_secs;
    let mode = config.mode;
    let order_strategy = config.strategy.order_strategy;
    let server_config = config.clone();
    let signal_config = config.clone();

    let state_feeds = state.clone();
    let state_ob = state.clone();
    let state_discovery = state.clone();
    let state_signal = state.clone();
    let state_heartbeat = state.clone();
    let state_maker = state.clone();
    let state_redeem = state.clone();
    let state_server = state.clone();
    let state_executor = state.clone();
    let state_fees = state.clone();

    let clob_heartbeat = clob_client.clone();
    let clob_maker = clob_client.clone();
    let clob_redeem = clob_client.clone();
    let clob_executor = clob_client.clone();
    let clob_fees = clob_client.clone();

    info!("Discovering markets...");
    let count = pp_discovery::discover(&state, &assets).await?;
    info!(count, "Initial markets discovered");

    tokio::try_join!(
        // 1. RTDS price feeds
        async move {
            pp_feeds::rtds::run_rtds_feed(state_feeds, assets_feed).await
        },

        // 2. CLOB orderbook feed
        async move {
            pp_feeds::orderbook::run_orderbook_feed(state_ob).await
        },

        // 3. Heartbeat monitor
        async move {
            match clob_heartbeat {
                Some(c) => pp_execution::heartbeat::heartbeat_monitor(c, state_heartbeat).await,
                None => pp_execution::heartbeat::heartbeat_demo(state_heartbeat).await,
            }
        },

        // 4. Signal generation
        async move {
            let risk = pp_risk::RiskManager::new(&signal_config);
            pp_strategy::signal::signal_loop(state_signal, &signal_config, &risk, signal_tx).await
        },

        // 5. Signal executor
        async move {
            while let Some(signal) = signal_rx.recv().await {
                let result = match mode {
                    Mode::Demo => {
                        pp_execution::orders::execute_demo(&state_executor, &signal).await
                    }
                    Mode::Live => {
                        // Invariant: Live mode guarantees client & signer are Some
                        // (set in the same if-branch above). Bail if violated.
                        let client = match clob_executor.as_deref() {
                            Some(c) => c,
                            None => { tracing::error!("BUG: Live mode but no CLOB client"); break; }
                        };
                        let signer = match signer_for_orders.as_ref() {
                            Some(s) => s,
                            None => { tracing::error!("BUG: Live mode but no signer"); break; }
                        };
                        pp_execution::orders::execute_live(
                            &state_executor, &signal, order_strategy, client, signer,
                        ).await
                    }
                };
                if let Err(e) = result {
                    tracing::warn!(error = %e, "Order execution failed");
                }
            }
            Ok::<(), anyhow::Error>(())
        },

        // 6. Maker cancel/replace loop
        async move {
            pp_execution::maker_loop::maker_loop(state_maker, clob_maker).await
        },

        // 7. Market discovery refresh
        async move {
            pp_discovery::refresh_loop(state_discovery, assets_discovery, refresh_secs).await
        },

        // 8. Auto-redeem resolved markets
        async move {
            pp_execution::redeem::redeem_loop(state_redeem, clob_redeem).await
        },

        // 9. Axum server
        async move {
            pp_server::run_server(state_server, &server_config).await
        },

        // 10. Fee rate cache refresh
        async move {
            fee_cache::fee_refresh_loop(fee_cache, state_fees, clob_fees).await
        },
    )?;

    Ok(())
}
