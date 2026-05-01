/**
 * Position entity — domain model + helpers.
 */
export type { PositionInfo as Position } from "@server-bindings/PositionInfo";

import type { PositionInfo } from "@server-bindings/PositionInfo";

export function positionAgeSecs(p: PositionInfo): number {
  return p.age_secs;
}

export function positionEntrySize(p: PositionInfo): number {
  return Number(p.size) || 0;
}

export function positionEntryPrice(p: PositionInfo): number {
  return Number(p.entry_price) || 0;
}
