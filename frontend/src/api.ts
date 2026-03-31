/**
 * Typed API client — auto-generated types come from Rust via ts-rs.
 *
 * All endpoints defined once. Components never write raw fetch() calls.
 * The base URL resolves to "" (same origin) in production and through
 * Vite's dev proxy during development.
 */

import type { ConfigSnapshot } from "@server-bindings/ConfigSnapshot";

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

type ConfigResult = ConfigUpdateResponse | ConfigErrorResponse;

// ── Internal helpers ──

const BASE = "";

async function post<T>(path: string): Promise<T> {
  const res = await fetch(`${BASE}${path}`, { method: "POST" });
  if (!res.ok) throw new Error(`POST ${path}: ${res.status}`);
  return res.json() as Promise<T>;
}

async function put<T>(path: string, body: unknown): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`PUT ${path}: ${res.status}`);
  return res.json() as Promise<T>;
}

// ── Public API ──

export const api = {
  /** Pause the bot */
  pause: () => post<PauseResponse>("/api/pause"),

  /** Resume the bot */
  resume: () => post<ResumeResponse>("/api/resume"),

  /** Emergency kill switch — cancels all orders and pauses */
  kill: () => post<KillResponse>("/api/kill"),

  /** Partial config update. Only send changed fields. */
  updateConfig: (updates: Record<string, string | number>) =>
    put<ConfigResult>("/api/config", updates),
} as const;
