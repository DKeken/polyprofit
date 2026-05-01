/**
 * Trade entity — domain model + helpers for trade rows.
 * Pure: no React, no fetch. Lives below features/widgets.
 */
export type { TradeInfo as Trade } from "@server-bindings/TradeInfo";

import type { TradeInfo } from "@server-bindings/TradeInfo";

export function tradePnl(t: TradeInfo): number {
  return t.pnl ? Number(t.pnl) : 0;
}

export function tradeIsWin(t: TradeInfo): boolean {
  return tradePnl(t) > 0;
}

export function tradeIsLoss(t: TradeInfo): boolean {
  return tradePnl(t) < 0;
}

export function tradeIsResolved(t: TradeInfo): boolean {
  return t.pnl !== null && t.pnl !== undefined;
}
