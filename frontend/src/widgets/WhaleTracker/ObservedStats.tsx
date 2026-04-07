import { memo, useMemo } from "react";
import type { ChartPoint } from "./types";
import { buyLabel } from "./types";
import { fmtUsd } from "../../shared/lib/format";
import { Panel, Stat } from "../../shared/ui";

interface ObservedStatsProps {
  chartData: ChartPoint[];
  totalTrades: number;
}

export const ObservedStats = memo(function ObservedStats({
  chartData,
  totalTrades,
}: ObservedStatsProps) {
  const stats = useMemo(() => {
    if (chartData.length === 0) return null;

    const buyCount = chartData.filter((d) => buyLabel(d.side)).length;
    const sellCount = chartData.length - buyCount;
    const totalAmount = chartData.reduce((acc, d) => acc + d.amount, 0);
    const avgTrade = totalAmount / chartData.length;
    const largest = Math.max(...chartData.map((d) => d.amount));
    const netExposure = chartData.reduce((acc, d) => acc + d.pnl, 0);

    return { buyCount, sellCount, avgTrade, largest, netExposure };
  }, [chartData]);

  if (!stats) return null;

  return (
    <Panel className="shrink-0 border-zinc-800/60 bg-zinc-900/40 p-4 mb-2">
      <h3 className="text-xs font-mono font-semibold text-zinc-300 uppercase tracking-widest mb-3">
        Observed Stats
      </h3>
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
        <Stat label="Total Trades" value={String(totalTrades)} />
        <Stat label="Buy Count" value={String(stats.buyCount)} />
        <Stat label="Sell Count" value={String(stats.sellCount)} />
        <Stat label="Avg Trade" value={`$${fmtUsd(stats.avgTrade, 0)}`} />
        <Stat label="Largest" value={`$${fmtUsd(stats.largest, 0)}`} />
        <Stat
          label="Net Exposure"
          value={`${stats.netExposure >= 0 ? "+" : ""}$${fmtUsd(Math.abs(stats.netExposure), 0)}`}
          highlight={stats.netExposure > 0}
        />
      </div>
    </Panel>
  );
});
