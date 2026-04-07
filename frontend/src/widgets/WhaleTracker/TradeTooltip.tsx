import { memo } from "react";
import type { ChartPoint } from "./types";
import { buyLabel } from "./types";
import { fmtUsd } from "../../shared/lib/format";

interface TradeTooltipProps {
  active?: boolean;
  payload?: ReadonlyArray<{ payload: ChartPoint }>;
}

/**
 * Memoized chart tooltip — stable ref prevents Recharts from
 * re-mounting the entire chart when parent state changes.
 */
export const TradeTooltip = memo(function TradeTooltip({
  active,
  payload,
}: TradeTooltipProps) {
  if (!active || !payload?.length) return null;
  const d = payload[0].payload;
  const isBuy = buyLabel(d.side);
  return (
    <div className="bg-zinc-900/95 border border-zinc-700/70 rounded-lg shadow-2xl p-3 text-[11px] font-mono min-w-[180px]">
      <div className="text-zinc-500 mb-1.5 border-b border-zinc-800 pb-1">
        {d.time}
      </div>
      <div
        className={`font-bold text-base mb-1 ${isBuy ? "text-emerald-400" : "text-rose-400"}`}
      >
        {d.side.split(" ")[0]}{" "}
        {d.side.includes(" ")
          ? `(${d.side.split(" ").slice(1).join(" ")})`
          : ""}
        : ${fmtUsd(d.amount, 2)}
      </div>
      <div className="text-zinc-400 text-[10px] leading-tight mt-1.5 max-w-[220px]">
        {d.question ?? "—"}
      </div>
      {d.price > 0 && (
        <div className="text-zinc-500 text-[10px] mt-1">
          Price: {(d.price * 100).toFixed(1)}¢
        </div>
      )}
    </div>
  );
});
