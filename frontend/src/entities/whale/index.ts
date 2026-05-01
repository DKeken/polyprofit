/**
 * Whale entity — re-exports the shared/api row types in a namespaced layer
 * so widgets can pull from `entities/whale` without binding to API plumbing.
 */
export type {
  WhaleRow as Whale,
  WhaleEventRow as WhaleEvent,
  WhaleHistoryResponse,
} from "../../shared/api";

import type { WhaleRow } from "../../shared/api";

export function whaleProfit(w: WhaleRow): number {
  return Number(w.profit) || 0;
}

export function whaleIsActive(w: WhaleRow, withinSecs = 60 * 60 * 24 * 30): boolean {
  const last = new Date(w.last_seen).getTime();
  return Date.now() - last < withinSecs * 1000;
}
