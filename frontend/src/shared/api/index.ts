/**
 * Shared API layer — re-exports the typed client and adds whale endpoints.
 * All fetch() calls live here; components never call fetch() directly.
 */
export * from "../../api";

// ── Whale endpoints ──

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

export interface LookupResult {
  whale: WhaleRow | null;
  error?: string;
}

export const whaleApi = {
  listWhales: () => get<WhalesResponse>("/api/whales"),
  activity: () => get<WhaleActivityResponse>("/api/whales/activity"),
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
} as const;
