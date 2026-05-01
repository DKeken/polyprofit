/**
 * Market entity — domain model + helpers.
 */
export type { MarketKind } from "@core-bindings/MarketKind";
export type { MarketInfo } from "../../shared/api";

import type { MarketInfo } from "../../shared/api";

export function marketEndsInSecs(m: MarketInfo): number {
  return Math.max(0, Math.floor((new Date(m.end_time).getTime() - Date.now()) / 1000));
}

export function marketIsExpired(m: MarketInfo): boolean {
  return new Date(m.end_time).getTime() <= Date.now();
}

export function marketsByAsset(markets: MarketInfo[]): Map<string, MarketInfo[]> {
  const groups = new Map<string, MarketInfo[]>();
  for (const m of markets) {
    const list = groups.get(m.asset) ?? [];
    list.push(m);
    groups.set(m.asset, list);
  }
  return groups;
}
