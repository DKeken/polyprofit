/**
 * Typed API client — auto-generated types come from Rust via ts-rs.
 *
 * All endpoints defined once. Components never write raw fetch() calls.
 * The base URL resolves to "" (same origin) in production and through
 * Vite's dev proxy during development.
 */

import type { ConfigSnapshot } from "@server-bindings/ConfigSnapshot";
import type { DataPeriod } from "./shared/store/useAppStore";

// ── Response types for mutating endpoints ──

export interface PauseResponse {
  status: "paused";
}

export interface ResumeResponse {
  status: "resumed";
}

export interface KillResponse {
  status: "killed";
  orders_cancelled: number;
}

export interface ConfigUpdateResponse {
  status: "updated";
  changes: string[];
  config: ConfigSnapshot;
}

export interface ConfigErrorResponse {
  error: string;
}

export class ApiError extends Error {
  status: number;

  constructor(message: string, status: number) {
    super(message);
    this.name = "ApiError";
    this.status = status;
  }
}

export interface PnlHistoryPoint {
  time: string;
  pnl: string;
}

export interface PnlHistoryResponse {
  points: PnlHistoryPoint[];
}

export interface MarketInfo {
  condition_id: string;
  asset: string;
  kind: string;
  question: string;
  strike: string | null;
  end_time: string;
  active: boolean;
}

export interface MarketsResponse {
  markets: MarketInfo[];
}

export interface RefreshMarketsResponse {
  count: number;
}

// ── Analytics ──

export interface AssetStats {
  trades: number;
  wins: number;
  losses: number;
  total_pnl: string;
}

export interface AnalyticsResponse {
  total_trades: number;
  winning_trades: number;
  losing_trades: number;
  pending_trades: number;
  win_rate: number;
  total_pnl: string;
  best_trade_pnl: string | null;
  worst_trade_pnl: string | null;
  avg_trade_pnl: string | null;
  avg_win: string | null;
  avg_loss: string | null;
  profit_factor: number | null;
  by_asset: Record<string, AssetStats>;
}

// ── DB Stats ──

export interface DbStatsResponse {
  enabled: boolean;
  trade_count?: number;
  has_saved_config?: boolean;
  has_balance_checkpoint?: boolean;
}

// ── Trades Export ──

export interface TradesExportResponse {
  trades: Array<{
    condition_id: string;
    side: string;
    price: string;
    size: string;
    pnl: string | null;
    is_adverse: boolean;
    timestamp: string;
  }>;
}

// ── Internal helpers ──

const BASE = "";

type HttpMethod = "GET" | "POST" | "PUT" | "DELETE";

async function parseJsonResponse<T>(
  res: Response,
): Promise<T | ConfigErrorResponse | null> {
  try {
    return (await res.json()) as T | ConfigErrorResponse;
  } catch {
    return null;
  }
}

function responseErrorMessage(
  method: string,
  path: string,
  status: number,
  payload: unknown,
): string {
  return typeof payload === "object" && payload !== null && "error" in payload
    ? String(payload.error)
    : `${method} ${path}: ${status}`;
}

async function request<T>(
  method: HttpMethod,
  path: string,
  body?: unknown,
): Promise<T> {
  const init: RequestInit = { method };
  if (body !== undefined) {
    init.headers = { "Content-Type": "application/json" };
    init.body = JSON.stringify(body);
  }
  const res = await fetch(`${BASE}${path}`, init);
  const payload = await parseJsonResponse<T>(res);
  if (!res.ok) {
    throw new ApiError(
      responseErrorMessage(method, path, res.status, payload),
      res.status,
    );
  }
  return payload as T;
}

const get = <T>(path: string) => request<T>("GET", path);
const post = <T>(path: string) => request<T>("POST", path);
const postJson = <T>(path: string, body: unknown) => request<T>("POST", path, body);
const put = <T>(path: string, body: unknown) => request<T>("PUT", path, body);

// ── Status ──

export interface StatusResponse {
  authenticated: boolean;
  wallet_address: string | null;
  paused: boolean;
  heartbeat_alive: boolean;
  daily_pnl: string;
  active_positions: number;
  active_orders: number;
  active_markets: number;
  signals_generated: number;
  orders_placed: number;
  orders_filled: number;
  adverse_fills: number;
  ws_reconnects: number;
}

export interface WalletInfoResponse {
  address: string;
  matic_balance: string;
  usdc_balance: string;
}

// ── Public API ──

export const api = {
  /** Get system status (auth state, metrics) */
  getStatus: () => get<StatusResponse>("/api/status"),

  /** Get on-chain wallet info (address, MATIC, USDC balances) */
  getWalletInfo: () => get<WalletInfoResponse>("/api/wallet"),

  /** Pause the bot */
  pause: () => post<PauseResponse>("/api/pause"),

  /** Resume the bot */
  resume: () => post<ResumeResponse>("/api/resume"),

  /** Emergency kill switch — cancels all orders and pauses */
  kill: () => post<KillResponse>("/api/kill"),

  /** Partial config update. Only send changed fields. */
  updateConfig: (updates: Record<string, unknown>) =>
    put<ConfigUpdateResponse>("/api/config", updates),

  /** Load PnL history from persisted trades (for equity curve on page load) */
  pnlHistory: (period?: DataPeriod) => {
    const q = period ? `?period=${period}` : "";
    return get<PnlHistoryResponse>(`/api/pnl-history${q}`);
  },

  /** Fetch active markets */
  getMarkets: () => get<MarketsResponse>("/api/markets"),

  /** Trigger immediate market re-discovery from Polymarket */
  refreshMarkets: () => post<RefreshMarketsResponse>("/api/markets/refresh"),

  /** Full analytics: win rate, profit factor, by-asset breakdown */
  analytics: (period?: DataPeriod) => {
    const q = period ? `?period=${period}` : "";
    return get<AnalyticsResponse>(`/api/analytics${q}`);
  },

  /** Fetch recent trades (last 50) */
  getTrades: () => get<TradesExportResponse>("/api/trades"),

  /** Database statistics */
  dbStats: () => get<DbStatsResponse>("/api/db/stats"),

  /** Export trades as CSV download */
  exportTradesCsv: () =>
    fetch(`${BASE}/api/trades/export`).then((r) => r.text()),

  /** Save Polymarket credentials — triggers backend restart */
  setCredentials: (creds: {
    private_key: string;
    api_key: string;
    api_secret: string;
    api_passphrase: string;
  }) => postJson<{ success: boolean; message: string }>("/api/auth", creds),
} as const;
