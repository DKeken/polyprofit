use std::collections::HashMap;
use serde::{Deserialize, Serialize};

// ── Auth ──
#[derive(Deserialize)]
pub struct AuthRequest {
    pub private_key: String,
    pub api_key: String,
    pub api_secret: String,
    pub api_passphrase: String,
}

#[derive(Serialize)]
pub struct AuthResponse {
    pub success: bool,
    pub message: String,
}

// ── Admin ──
#[derive(Serialize)]
pub struct StatusResponse {
    pub authenticated: bool,
    pub paused: bool,
    pub heartbeat_alive: bool,
    pub daily_pnl: String,
    pub active_positions: usize,
    pub active_orders: usize,
    pub active_markets: usize,
    pub signals_generated: u64,
    pub orders_placed: u64,
    pub orders_filled: u64,
    pub adverse_fills: u64,
    pub ws_reconnects: u64,
}

#[derive(Serialize)]
pub struct BasicResponse {
    pub status: String,
}

#[derive(Serialize)]
pub struct KillResponse {
    pub status: String,
    pub orders_queued_for_cancel: usize,
}

// ── Trading ──
#[derive(Serialize)]
pub struct PositionDto {
    pub condition_id: String,
    pub side: String,
    pub size: String,
    pub entry_price: String,
    pub opened_at: String,
}

#[derive(Serialize)]
pub struct PositionsResponse {
    pub positions: Vec<PositionDto>,
}

#[derive(Serialize)]
pub struct TradeDto {
    pub condition_id: String,
    pub side: String,
    pub price: String,
    pub size: String,
    pub pnl: Option<String>,
    pub is_adverse: bool,
    pub timestamp: String,
}

#[derive(Serialize)]
pub struct TradesResponse {
    pub trades: Vec<TradeDto>,
}

#[derive(Serialize)]
pub struct MarketDto {
    pub condition_id: String,
    pub asset: String,
    pub kind: String,
    pub question: String,
    pub strike: Option<String>,
    pub end_time: String,
    pub active: bool,
}

#[derive(Serialize)]
pub struct MarketsResponse {
    pub markets: Vec<MarketDto>,
}

#[derive(Serialize)]
pub struct DbStatsResponse {
    pub enabled: bool,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub trade_count: Option<usize>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub has_saved_config: Option<bool>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub has_balance_checkpoint: Option<bool>,
}

#[derive(Serialize)]
pub struct PnlPointDto {
    pub time: String,
    pub pnl: String,
}

#[derive(Serialize)]
pub struct PnlHistoryResponse {
    pub points: Vec<PnlPointDto>,
}

#[derive(Serialize)]
pub struct Analytics {
    pub total_trades: usize,
    pub winning_trades: usize,
    pub losing_trades: usize,
    pub pending_trades: usize,
    pub win_rate: f64,
    pub total_pnl: String,
    pub best_trade_pnl: Option<String>,
    pub worst_trade_pnl: Option<String>,
    pub avg_trade_pnl: Option<String>,
    pub avg_win: Option<String>,
    pub avg_loss: Option<String>,
    pub profit_factor: Option<f64>,
    pub by_asset: HashMap<String, AssetStats>,
}

#[derive(Serialize)]
pub struct AssetStats {
    pub trades: usize,
    pub wins: usize,
    pub losses: usize,
    pub total_pnl: String,
}

// ── Config ──
#[derive(Deserialize)]
pub struct ConfigUpdate {
    #[serde(default)]
    pub min_edge: Option<String>,
    #[serde(default)]
    pub min_prob: Option<String>,
    #[serde(default)]
    pub max_prob: Option<String>,
    #[serde(default)]
    pub max_spread: Option<String>,
    #[serde(default)]
    pub order_strategy: Option<String>,
    #[serde(default)]
    pub market_refresh_secs: Option<u64>,
    #[serde(default)]
    pub daily_loss_limit: Option<String>,
    #[serde(default)]
    pub daily_profit_cap: Option<String>,
    #[serde(default)]
    pub max_position_pct: Option<String>,
    #[serde(default)]
    pub max_concurrent: Option<usize>,
    #[serde(default)]
    pub drawdown_limit: Option<String>,
    #[serde(default)]
    pub adverse_fill_pause: Option<u32>,
    #[serde(default)]
    pub assets: Option<Vec<String>>,
    #[serde(default)]
    pub asset_definitions: Option<Vec<crate::api::dto::AssetDefUpdate>>,
}

// ── Whales ──
#[derive(Serialize)]
pub struct WhalesResponse {
    pub whales: Vec<WhaleRow>,
    pub total: usize,
}

#[derive(Serialize)]
pub struct WhaleRow {
    pub address: String,
    pub display_name: Option<String>,
    pub profit: String,
    pub roi: f64,
    pub win_rate: f64,
    pub volume: String,
    pub markets_traded: u64,
    pub last_seen: String,
    pub followed: bool,
    pub archived: bool,
}

#[derive(Serialize)]
pub struct WhaleActivityResponse {
    pub events: Vec<WhaleEventRow>,
}

#[derive(Serialize)]
pub struct WhaleEventRow {
    pub address: String,
    pub condition_id: String,
    pub side: String,
    pub amount: String,
    pub price: String,
    pub timestamp: String,
    pub question: Option<String>,
    pub platform: String,
}

#[derive(Deserialize)]
pub struct LookupRequest {
    pub address: String,
}

#[derive(Deserialize)]
pub struct TrackRequest {
    pub address: String,
    pub display_name: Option<String>,
}

#[derive(Deserialize)]
pub struct BulkActionRequest {
    pub addresses: Vec<String>,
    /// One of: "archive", "unarchive", "follow", "unfollow", "delete"
    pub action: String,
}

#[derive(Serialize)]
pub struct BulkActionResponse {
    pub affected: usize,
    pub action: String,
}

#[derive(Serialize)]
pub struct WhaleHistoryResponse {
    pub address: String,
    pub trades: Vec<WhaleEventRow>,
}

#[derive(Deserialize)]
pub struct AssetDefUpdate {
    pub symbol: String,
    pub binance_symbol: String,
    pub keywords: Vec<String>,
}

/// Whale auto-scan metadata returned by GET /api/whales/scan-status
#[derive(Serialize)]
pub struct ScanStatusResponse {
    /// Unix epoch seconds of last completed scan (0 = never)
    pub last_scan: i64,
    /// Unix epoch seconds of next scheduled scan
    pub next_scan: i64,
    /// Scan interval in seconds
    pub interval_secs: u64,
}
