use std::sync::Arc;

use anyhow::{Context, Result};
use tracing::{info, warn};
use tracing_subscriber::EnvFilter;

use alloy::signers::local::PrivateKeySigner;
use polymarket_client_sdk::auth::Credentials;
use uuid::Uuid;

use pp_core::{AppState, Asset, Config};
use pp_execution::fee_cache;

fn credential_bundle_from_legacy_env() -> Result<Option<Credentials>> {
    let api_key = std::env::var("POLYMARKET_API_KEY")
        .ok()
        .or_else(|| std::env::var("POLYMARKET_PRIVATE_KEY").ok());
    let secret = std::env::var("POLYMARKET_SECRET").ok();
    let passphrase = std::env::var("POLYMARKET_PASSPHRASE").ok();

    match (api_key, secret, passphrase) {
        (None, None, None) => Ok(None),
        (Some(key), Some(secret), Some(passphrase)) => {
            let key = Uuid::parse_str(key.trim())
                .context("Polymarket API key must be a valid UUID")?;
            Ok(Some(Credentials::new(key, secret, passphrase)))
        }
        (Some(_), None, None) => Ok(None),
        _ => Err(anyhow::anyhow!(
            "POLYMARKET_API_KEY / POLYMARKET_PRIVATE_KEY, POLYMARKET_SECRET, and POLYMARKET_PASSPHRASE must either all be set together or be absent"
        )),
    }
}

fn wallet_signer_from_env() -> Result<Option<PrivateKeySigner>> {
    let Some(raw) = std::env::var("POLYMARKET_PRIVATE_KEY").ok() else {
        return Ok(None);
    };

    if Uuid::parse_str(raw.trim()).is_ok() {
        return Ok(None);
    }

    let signer: PrivateKeySigner = raw
        .parse()
        .map_err(|err| anyhow::anyhow!("Invalid POLYMARKET_PRIVATE_KEY: {err}"))?;
    Ok(Some(signer))
}

async fn authenticate_runtime() -> Result<pp_execution::LiveTradingContext> {
    let credentials = credential_bundle_from_legacy_env()?;
    let signer = match wallet_signer_from_env()? {
        Some(signer) => pp_execution::AutoSigner::local(signer),
        None => {
            if credentials.is_some() {
                anyhow::bail!(
                    "Polymarket API key/secret/passphrase authenticate L2 requests, but order placement still requires a wallet signer for EIP-712 order signing. Gasless trading does not remove this signing requirement. Set POLYMARKET_PRIVATE_KEY to a real EVM wallet key, and keep the API credentials in POLYMARKET_API_KEY/POLYMARKET_SECRET/POLYMARKET_PASSPHRASE if you want to reuse them."
                );
            }
            anyhow::bail!("POLYMARKET_PRIVATE_KEY must be set to a real EVM wallet private key (0x...) for trading runtime startup");
        }
    };

    info!(address = %signer.address(), "Signer loaded");

    if credentials.is_some() {
        info!("Using existing Polymarket API credentials from environment");
    }

    let client = signer.authenticate_client(credentials).await?;

    info!("CLOB client authenticated");
    info!("SDK auto-heartbeat started (interval: 5s)");

    Ok(pp_execution::LiveTradingContext::new(client, signer))
}

fn spawn_signal_loop(
    tasks: &mut tokio::task::JoinSet<Result<()>>,
    state: Arc<AppState>,
    config: Arc<Config>,
    signal_tx: tokio::sync::mpsc::Sender<pp_core::Signal>,
) {
    tasks.spawn(async move {
        let risk = pp_risk::RiskManager::new(&config);
        pp_strategy::signal::signal_loop(state, &config, &risk, signal_tx).await
    });
}

fn spawn_execution_loop(
    tasks: &mut tokio::task::JoinSet<Result<()>>,
    state: Arc<AppState>,
    client: Arc<pp_execution::AuthClient>,
    signer: pp_execution::AutoSigner,
    mut signal_rx: tokio::sync::mpsc::Receiver<pp_core::Signal>,
) {
    tasks.spawn(async move {
        while let Some(signal) = signal_rx.recv().await {
            let order_strategy = state.runtime_config.read().order_strategy;
            let result = pp_execution::orders::execute(
                &state,
                &signal,
                order_strategy,
                client.as_ref(),
                &signer,
            )
            .await;
            if let Err(e) = result {
                tracing::warn!(error = %e, "Order execution failed");
            }
        }
        Ok::<(), anyhow::Error>(())
    });
}

fn spawn_authenticated_loops(
    tasks: &mut tokio::task::JoinSet<Result<()>>,
    state: Arc<AppState>,
    client: Arc<pp_execution::AuthClient>,
    fee_cache: fee_cache::FeeCache,
) {
    let clob_hb = client.clone();
    let s = state.clone();
    tasks.spawn(async move { pp_execution::heartbeat::heartbeat_monitor(clob_hb, s).await });

    let clob_mk = client.clone();
    let s = state.clone();
    tasks.spawn(async move { pp_execution::maker_loop::maker_loop(s, clob_mk).await });

    let clob_rd = client.clone();
    let s = state.clone();
    tasks.spawn(async move { pp_execution::redeem::redeem_loop(s, clob_rd).await });

    let clob_fe = client.clone();
    let s = state;
    tasks.spawn(async move { fee_cache::fee_refresh_loop(fee_cache, s, clob_fe).await });
}

fn spawn_public_loops(
    tasks: &mut tokio::task::JoinSet<Result<()>>,
    state: Arc<AppState>,
    assets: Vec<Asset>,
    config: Arc<Config>,
) {
    let s = state.clone();
    let a = assets.clone();
    tasks.spawn(async move { pp_feeds::rtds::run_rtds_feed(s, a).await });

    let s = state.clone();
    tasks.spawn(async move { pp_feeds::orderbook::run_orderbook_feed(s).await });

    let s = state.clone();
    let a = assets;
    tasks.spawn(async move { pp_discovery::refresh_loop(s, a).await });

    let srv_cfg = config;
    let s = state.clone();
    tasks.spawn(async move { pp_server::run_server(s, &srv_cfg).await });

    let s = state;
    tasks.spawn(async move { pp_core::db::checkpoint_loop(s, 30).await });
}

async fn maybe_discover_markets(state: &Arc<AppState>, assets: &[Asset]) {
    info!("Discovering markets...");
    match pp_discovery::discover(state, assets).await {
        Ok(count) => info!(count, "Initial markets discovered"),
        Err(error) => warn!(error = %error, "Initial market discovery failed; continuing runtime"),
    }
}


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
    info!(chain_id = config.chain_id, "Config loaded");

    // ── Open embedded database ──
    let db_path = std::env::var("POLYPROFIT_DB_PATH").unwrap_or_else(|_| "polyprofit.db".to_string());
    let db = pp_core::BotDb::open(&db_path)?;
    info!(db_path = %db_path, "Database opened");

    let state = AppState::new_with_db(db);
    state.set_starting_balance(config.risk.starting_balance);

    // Load asset registry + restore persisted state from DB
    state.load_asset_registry(&config.asset_definitions);
    restore_persisted_state(&state, &config);

    let fee_cache = fee_cache::new_fee_cache();

    // ── Runtime authentication ──
    let live = authenticate_runtime().await?;
    let clob = Arc::new(live.client);
    let signer = live.signer;

    let (signal_tx, signal_rx) = tokio::sync::mpsc::channel(256);

    let assets: Vec<Asset> = config.strategy.assets.iter().map(|s| Asset::new(s)).collect();
    maybe_discover_markets(&state, &assets).await;

    info!("Runtime started with execution capability");

    // ── Shutdown signal listener ──
    let shutdown_signal = wait_for_shutdown_signal();

    // ── Task spawning ──
    // Each task gets its own Arc clone of shared state.
    // The shutdown token inside AppState is checked by each loop.
    let mut tasks = tokio::task::JoinSet::new();

    spawn_public_loops(&mut tasks, state.clone(), assets.clone(), config.clone());
    spawn_signal_loop(&mut tasks, state.clone(), config.clone(), signal_tx);
    spawn_execution_loop(&mut tasks, state.clone(), clob.clone(), signer, signal_rx);
    spawn_authenticated_loops(&mut tasks, state.clone(), clob, fee_cache.clone());

    state.heartbeat_alive.store(true, std::sync::atomic::Ordering::Relaxed);
    state.paused.store(false, std::sync::atomic::Ordering::Relaxed);


    tokio::select! {
        _ = shutdown_signal => {
            info!("Shutdown signal received, stopping all tasks...");
        }
        result = tasks.join_next() => {
            match result {
                Some(Ok(Ok(()))) => {
                    warn!("A background task exited early; initiating shutdown");
                }
                Some(Ok(Err(e))) => {
                    state.shutdown.cancel();
                    drain_tasks(&mut tasks).await;
                    return Err(e.context("background task failed"));
                }
                Some(Err(e)) => {
                    state.shutdown.cancel();
                    drain_tasks(&mut tasks).await;
                    return Err(anyhow::anyhow!("background task panicked: {e}"));
                }
                None => {
                    info!("All background tasks exited");
                }
            }
        }
    }

    state.shutdown.cancel();
    drain_tasks(&mut tasks).await;

    info!("polyprofit shutting down");
    Ok(())
}

async fn wait_for_shutdown_signal() {
    let ctrl_c = tokio::signal::ctrl_c();
    #[cfg(unix)]
    {
        use tokio::signal::unix::{signal, SignalKind};
        let mut sigterm = signal(SignalKind::terminate()).expect("SIGTERM handler");
        tokio::select! {
            _ = ctrl_c => {},
            _ = sigterm.recv() => {},
        }
    }
    #[cfg(not(unix))]
    {
        let _ = ctrl_c.await;
    }
}

async fn drain_tasks(tasks: &mut tokio::task::JoinSet<Result<()>>) {
    let drain = async {
        while let Some(result) = tasks.join_next().await {
            match result {
                Ok(Ok(())) => {}
                Ok(Err(e)) => warn!(error = %e, "Background task exited during shutdown"),
                Err(e) => warn!("Background task join error during shutdown: {e}"),
            }
        }
    };

    if tokio::time::timeout(std::time::Duration::from_secs(5), drain)
        .await
        .is_err()
    {
        warn!("Timed out waiting for background tasks to shut down; aborting remaining tasks");
        tasks.abort_all();
        while tasks.join_next().await.is_some() {}
    }
}

// ── Helpers ──────────────────────────────────────────────────────────────────

/// Restore all persisted state from the DB: runtime config, trade history,
/// balance checkpoint, and daily PnL reset logic.
fn restore_persisted_state(state: &Arc<AppState>, config: &Config) {
    // 1. Restore saved runtime config (or use initial from config.toml)
    {
        let saved_config = state.db.as_ref().and_then(|db| db.load_config().ok().flatten());
        let mut rc = state.runtime_config.write();
        if let Some(mut saved) = saved_config {
            info!("Restored runtime config from database");
            // If saved config has no asset_definitions (old DB format), seed from config.toml
            if saved.asset_definitions.is_empty() {
                info!("Seeding asset_definitions from config.toml into restored config");
                saved.asset_definitions = config.asset_definitions.iter().map(|d| {
                    pp_core::AssetMeta {
                        symbol: d.symbol.to_uppercase(),
                        binance_symbol: d.binance_symbol.clone(),
                        keywords: d.keywords.iter().map(|k| k.to_lowercase()).collect(),
                    }
                }).collect();
            }
            *rc = saved;
        } else {
            *rc = config.to_runtime_config();
        }
    }

    // Rebuild asset registry from RuntimeConfig so DB-persisted definitions take precedence
    state.rebuild_asset_registry();

    // 2. Restore balance checkpoint
    if let Some(ref db) = state.db {
        if let Ok(Some((pnl, peak))) = db.load_balance_checkpoint() {
            state.daily_pnl.store(pnl, std::sync::atomic::Ordering::Relaxed);
            state.peak_balance.store(peak, std::sync::atomic::Ordering::Relaxed);
            info!(daily_pnl_cents = pnl, peak_cents = peak, "Balance checkpoint restored");
        }
    }

    // 3. Restore trade history
    if let Some(ref db) = state.db {
        if let Ok(trades) = db.load_trades() {
            if !trades.is_empty() {
                info!(count = trades.len(), "Trade history restored from database");
                let mut tl = state.trades.write();
                *tl = trades;
            }
        }
    }

    // 4. Daily PnL reset (new day since last run)
    if let Some(ref db) = state.db {
        let today = chrono::Utc::now().format("%Y-%m-%d").to_string();
        let saved_date = db.load_trading_date().unwrap_or(None);
        if saved_date.as_deref() != Some(today.as_str()) {
            let current = state.current_balance_cents();
            state.daily_pnl.store(0, std::sync::atomic::Ordering::Relaxed);
            state.starting_balance.store(current, std::sync::atomic::Ordering::Relaxed);
            state.peak_balance.store(current, std::sync::atomic::Ordering::Relaxed);
            let _ = db.save_trading_date(&today);
            info!(balance_cents = current, "New trading day — daily PnL reset");
        }
    }
}

