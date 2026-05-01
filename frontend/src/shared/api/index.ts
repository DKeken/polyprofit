/**
 * Shared API layer — re-exports the typed client and adds whale endpoints.
 * All fetch() calls live here; components never call fetch() directly.
 */
export * from "./client";
export * from "./useBot";

// ── Whale types ──────────────────────────────────────────────────────────────

export interface WhaleRow {
  address: string;
  display_name: string | null;
  profit: string;
  roi: number;
  win_rate: number;
  volume: string;
  markets_traded: number;
  last_seen: string;
  followed: boolean;
  archived: boolean;
}

export interface WhalesResponse {
  whales: WhaleRow[];
  total: number;
}

export interface WhaleEventRow {
  address: string;
  condition_id: string;
  side: string;
  amount: string;
  price: string;
  timestamp: string;
  question: string | null;
  platform: string;
}

export interface WhaleActivityResponse {
  events: WhaleEventRow[];
}

export interface WhaleHistoryResponse {
  address: string;
  trades: WhaleEventRow[];
}

export interface BulkActionResponse {
  affected: number;
  action: string;
}

// ── HTTP helpers ──────────────────────────────────────────────────────────────

const BASE = "";

async function get<T>(path: string): Promise<T> {
  const res = await fetch(`${BASE}${path}`);
  if (!res.ok) throw new Error(`GET ${path}: ${res.status}`);
  return res.json() as Promise<T>;
}

async function post<T>(path: string, body: unknown): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error((err as { error?: string }).error ?? res.statusText);
  }
  return res.json() as Promise<T>;
}

async function del<T>(path: string): Promise<T> {
  const res = await fetch(`${BASE}${path}`, { method: "DELETE" });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error((err as { error?: string }).error ?? res.statusText);
  }
  return res.json() as Promise<T>;
}

// ── Whale API ──────────────────────────────────────────────────────────────────

export interface LookupResult {
  whale: WhaleRow | null;
  error?: string;
}

export const whaleApi = {
  listWhales: () => get<WhalesResponse>("/api/whales"),
  activity: () => get<WhaleActivityResponse>("/api/whales/activity"),
  history: (address: string) =>
    get<WhaleHistoryResponse>(`/api/whales/${encodeURIComponent(address)}/history`),
  lookup: (address: string) =>
    post<{ whale: WhaleRow }>("/api/whales/lookup", { address }),
  track: (address: string, display_name?: string) =>
    post<{ tracked: boolean; address: string }>("/api/whales/track", {
      address,
      ...(display_name ? { display_name } : {}),
    }),
  toggleFollow: (address: string) =>
    post<{ address: string; followed: boolean }>(
      `/api/whales/${encodeURIComponent(address)}/follow`,
      {},
    ),
  untrack: (address: string) =>
    del<{ removed: boolean; address: string }>(
      `/api/whales/${encodeURIComponent(address)}`,
    ),
  poll: () => post<{ ok: boolean; tracked: number }>("/api/whales/poll", {}),
  bulk: (addresses: string[], action: string) =>
    post<BulkActionResponse>("/api/whales/bulk", { addresses, action }),
  scanStatus: () => get<ScanStatus>("/api/whales/scan-status"),
} as const;

// ── Scan status type ───────────────────────────────────────────────────────────
export interface ScanStatus {
  /** Unix epoch seconds of last completed scan (0 = never) */
  last_scan: number;
  /** Unix epoch seconds of when next scan will run */
  next_scan: number;
  /** Scan interval in seconds */
  interval_secs: number;
}
