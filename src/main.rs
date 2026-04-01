use std::sync::Arc;

use anyhow::{Context, Result};
use tracing::info;
use tracing_subscriber::EnvFilter;

use alloy::signers::Signer as _;
use alloy::signers::local::PrivateKeySigner;
use polymarket_client_sdk::clob::{Client as ClobClient, Config as ClobConfig};
use polymarket_client_sdk::POLYGON;

use pp_core::{AppState, Config, Mode, Asset};
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

    // ── Open embedded database ──
    let db = pp_core::BotDb::open("polyprofit.db")?;

    let state = AppState::new_with_db(config.mode, db);
    state.set_starting_balance(config.risk.starting_balance);

    // Load asset registry + restore persisted state from DB
    state.load_asset_registry(&config.asset_definitions);
    restore_persisted_state(&state, &config);

    let fee_cache = fee_cache::new_fee_cache();

    // ── SDK authentication (Live only) ──
    let (clob_client, signer_for_orders) = authenticate_sdk(&config).await?;

    let (signal_tx, mut signal_rx) = tokio::sync::mpsc::channel(256);

    let assets: Vec<Asset> = config.strategy.assets.iter().map(|s| Asset::new(s)).collect();
    let mode = config.mode;

    info!("Discovering markets...");
    let count = pp_discovery::discover(&state, &assets).await?;
    info!(count, "Initial markets discovered");

    // ── Spawn SIGINT/SIGTERM listener ──
    let shutdown = state.shutdown.clone();
    tokio::spawn(async move {
        let ctrl_c = tokio::signal::ctrl_c();
        #[cfg(unix)]
        {
            use tokio::signal::unix::{SignalKind, signal};
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
        info!("Shutdown signal received, stopping all tasks...");
        shutdown.cancel();
        // Force exit after 2s — ensures DB lock is released before cargo-watch restarts
        tokio::time::sleep(std::time::Duration::from_secs(2)).await;
        std::process::exit(0);
    });

    // ── Task spawning ──
    // Each task gets its own Arc clone of shared state.
    // The shutdown token inside AppState is checked by each loop.

    let s = state.clone();
    let a = assets.clone();
    let h_rtds = tokio::spawn(async move {
        pp_feeds::rtds::run_rtds_feed(s, a).await
    });

    let s = state.clone();
    let h_ob = tokio::spawn(async move {
        pp_feeds::orderbook::run_orderbook_feed(s).await
    });

    let clob_hb = clob_client.clone();
    let s = state.clone();
    let h_heartbeat = tokio::spawn(async move {
        match clob_hb {
            Some(c) => pp_execution::heartbeat::heartbeat_monitor(c, s).await,
            None => pp_execution::heartbeat::heartbeat_demo(s).await,
        }
    });

    let sig_cfg = config.clone();
    let s = state.clone();
    let h_signal = tokio::spawn(async move {
        let risk = pp_risk::RiskManager::new(&sig_cfg);
        pp_strategy::signal::signal_loop(s, &sig_cfg, &risk, signal_tx).await
    });

    let clob_exec = clob_client.clone();
    let s = state.clone();
    let h_executor = tokio::spawn(async move {
        while let Some(signal) = signal_rx.recv().await {
            let order_strategy = s.runtime_config.read().order_strategy;

            let result = match mode {
                Mode::Demo => {
                    pp_execution::orders::execute_demo(&s, &signal).await
                }
                Mode::Live => {
                    let client = match clob_exec.as_deref() {
                        Some(c) => c,
                        None => { tracing::error!("BUG: Live mode but no CLOB client"); break; }
                    };
                    let signer = match signer_for_orders.as_ref() {
                        Some(s) => s,
                        None => { tracing::error!("BUG: Live mode but no signer"); break; }
                    };
                    pp_execution::orders::execute_live(
                        &s, &signal, order_strategy, client, signer,
                    ).await
                }
            };
            if let Err(e) = result {
                tracing::warn!(error = %e, "Order execution failed");
            }
        }
        Ok::<(), anyhow::Error>(())
    });

    let clob_mk = clob_client.clone();
    let s = state.clone();
    let h_maker = tokio::spawn(async move {
        pp_execution::maker_loop::maker_loop(s, clob_mk).await
    });

    let s = state.clone();
    let a = assets.clone();
    let h_discovery = tokio::spawn(async move {
        pp_discovery::refresh_loop(s, a).await
    });

    let clob_rd = clob_client.clone();
    let s = state.clone();
    let h_redeem = tokio::spawn(async move {
        pp_execution::redeem::redeem_loop(s, clob_rd).await
    });

    let srv_cfg = config.clone();
    let s = state.clone();
    let h_server = tokio::spawn(async move {
        pp_server::run_server(s, &srv_cfg).await
    });

    let clob_fe = clob_client.clone();
    let s = state.clone();
    let h_fees = tokio::spawn(async move {
        fee_cache::fee_refresh_loop(fee_cache, s, clob_fe).await
    });

    let s = state.clone();
    let h_checkpoint = tokio::spawn(async move {
        pp_core::db::checkpoint_loop(s, 30).await
    });

    // Wait for any task to complete (or shutdown signal triggers clean exit via checkpoint_loop)
    tokio::select! {
        r = h_rtds => { r??; }
        r = h_ob => { r??; }
        r = h_heartbeat => { r??; }
        r = h_signal => { r??; }
        r = h_executor => { r??; }
        r = h_maker => { r??; }
        r = h_discovery => { r??; }
        r = h_redeem => { r??; }
        r = h_server => { r??; }
        r = h_fees => { r??; }
        r = h_checkpoint => { r??; }
    }

    info!("polyprofit shutting down");
    Ok(())
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

/// Authenticate with Polymarket CLOB SDK in Live mode.
/// Returns (None, None) in Demo mode.
async fn authenticate_sdk(
    config: &Config,
) -> Result<(Option<Arc<pp_execution::AuthClient>>, Option<PrivateKeySigner>)> {
    if config.mode != Mode::Live {
        info!("Demo mode — SDK disabled");
        return Ok((None, None));
    }

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

    Ok((Some(Arc::new(client)), Some(signer)))
}
