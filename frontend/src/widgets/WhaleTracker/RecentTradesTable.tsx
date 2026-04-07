import { memo, useMemo } from "react";
import type { WhaleEventRow } from "./types";
import { buyLabel, formatTime } from "./types";
import { fmtUsd } from "../../shared/lib/format";
import { Panel } from "../../shared/ui";

interface RecentTradesTableProps {
  trades: WhaleEventRow[];
}

export const RecentTradesTable = memo(function RecentTradesTable({
  trades,
}: RecentTradesTableProps) {
  const recentTrades = useMemo(
    () =>
      [...trades]
        .sort(
          (a, b) =>
            new Date(b.timestamp).getTime() -
            new Date(a.timestamp).getTime(),
        )
        .slice(0, 15),
    [trades],
  );

  if (recentTrades.length === 0) return null;

  return (
    <Panel className="shrink-0 border-zinc-800/60 bg-zinc-900/40 p-4 flex flex-col gap-2">
      <h3 className="text-xs font-mono font-semibold text-zinc-300 uppercase tracking-widest">
        Recent Trades
      </h3>
      <div className="divide-y divide-zinc-800/40">
        {recentTrades.map((t, i) => {
          const isBuy = buyLabel(t.side);
          const amount = parseFloat(t.amount) || 0;
          return (
            <div
              key={`${t.condition_id}-${t.timestamp}-${i}`}
              className="py-2 flex items-start justify-between gap-2 group"
            >
              <div className="flex-1 min-w-0">
                <div className="text-[11px] font-mono text-zinc-300 truncate">
                  {t.question ?? t.condition_id.slice(0, 20) + "…"}
                </div>
                <div className="text-[10px] font-mono text-zinc-600 mt-0.5">
                  {formatTime(t.timestamp)}
                </div>
              </div>
              <div className="text-right shrink-0">
                <div
                  className={`text-[11px] font-mono font-bold ${
                    isBuy ? "text-emerald-400" : "text-rose-400"
                  }`}
                >
                  {t.side.split(" ")[0]}
                </div>
                <div className="text-[10px] font-mono text-zinc-400 tabular-nums">
                  ${fmtUsd(amount, 2)}
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </Panel>
  );
});
