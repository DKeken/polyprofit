import { useBot } from "../hooks/useBot";
import { Panel, ResizeDivider } from "../shared/ui";
import EquityCurve from "./EquityCurve";
import ExecutionLog from "./ExecutionLog";
import TradeFeed from "./TradeFeed";

import { useSplitResize } from "../shared/hooks/useSplitResize";

/* ── Main Dashboard ── */

export default function Dashboard() {
  const { tick, connected, pnlHistory, logEntries } = useBot();
  const { leftPct, containerRef, onMouseDown } = useSplitResize("dashboard-split-pct", 35);

  return (
    <div className="flex-1 flex flex-col min-h-0 overflow-hidden" ref={containerRef}>
      {/* ── Two-column layout ── */}
      <div className="flex-1 flex min-h-0">
        {/* ── Left: Trade Feed ── */}
        <div style={{ width: `${leftPct}%` }} className="shrink-0 flex flex-col min-h-0">
          <TradeFeed
            trades={tick.trades}
            positions={tick.open_positions}
            totalTrades={tick.total_trades}
            tick={tick}
          />
        </div>

        {/* ── Divider ── */}
        <ResizeDivider onMouseDown={onMouseDown} />

        {/* ── Right: Metrics + Chart + Log ── */}
        <div className="flex-1 flex flex-col min-h-0 min-w-0 pr-0.5 gap-3 p-4 overflow-y-auto">
          {/* ── Metrics Panel ── */}
          <Panel className="shrink-0 p-4 border-zinc-800/60 bg-zinc-900/40">
             <MetricsStrip tick={tick} />
             <div className="h-px bg-zinc-800/60 my-3" />
             <SubMetrics tick={tick} />
          </Panel>

          {/* ── Equity Curve Panel ── */}
          <Panel className="flex-1 min-h-[300px] border-zinc-800/60 bg-zinc-900/40">
             <EquityCurve data={pnlHistory} />
          </Panel>

          {/* ── Execution Log Panel ── */}
          <Panel className="h-[300px] shrink-0 border-zinc-800/60 bg-zinc-900/40">
             <ExecutionLog entries={logEntries} connected={connected} />
          </Panel>
        </div>
      </div>
    </div>
  );
}

/* ── Inline Metrics Strip ── */

import { useAppStore } from "../shared/store/useAppStore";
import { buildTranslator } from "../shared/lib/i18n";
import { fmtUsd, pnlColor, pnlSign } from "../shared/lib/format";

function MetricsStrip({ tick }: { tick: ReturnType<typeof useBot>["tick"] }) {
  const { language } = useAppStore();
  const t = buildTranslator(language);

  const balance = parseFloat(tick.balance) || 0;
  const pnl = parseFloat(tick.total_pnl) || 0;
  const dailyPnl = parseFloat(tick.daily_pnl) || 0;
  const winRate = (tick.win_rate * 100).toFixed(1);

  return (
    <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
      {/* Balance */}
      <div>
        <div className="text-[10px] font-mono uppercase tracking-widest text-zinc-500 mb-0.5">
          Balance
        </div>
        <div className="text-xl font-bold font-mono text-zinc-100 flex items-baseline gap-2">
          ${fmtUsd(balance)}
          {pnl !== 0 && (
            <span className={`text-[10px] font-mono font-medium ${pnlColor(pnl)}`}>
              {pnlSign(pnl)}{pnl.toFixed(2)}
            </span>
          )}
        </div>
      </div>

      {/* Total P&L */}
      <div>
        <div className="text-[10px] font-mono uppercase tracking-widest text-zinc-500 mb-0.5">
          {t("totalPnl")}
        </div>
        <div className={`text-xl font-bold font-mono ${pnlColor(pnl)}`}>
          {pnlSign(pnl)}${fmtUsd(Math.abs(pnl))}
        </div>
        <div className={`text-[10px] font-mono ${dailyPnl >= 0 ? "text-emerald-500/70" : "text-red-400/70"}`}>
          Today: {pnlSign(dailyPnl)}${dailyPnl.toFixed(2)}
        </div>
      </div>

      {/* Orders / Fills */}
      <div>
        <div className="text-[10px] font-mono uppercase tracking-widest text-zinc-500 mb-0.5">
          Orders
        </div>
        <div className="text-xl font-bold font-mono text-cyan-400">
          {tick.orders ?? 0}
        </div>
        <div className="text-[10px] font-mono text-zinc-500">
          {tick.fills ?? 0} fills &middot; {tick.adverse ?? 0} adverse
        </div>
      </div>

      {/* Daily P&L */}
      <div>
        <div className="text-[10px] font-mono uppercase tracking-widest text-zinc-500 mb-0.5">
          Daily P&L
        </div>
        <div className={`text-xl font-bold font-mono ${pnlColor(dailyPnl)}`}>
          {pnlSign(dailyPnl)}${fmtUsd(Math.abs(dailyPnl))}
        </div>
      </div>

      {/* Win Rate */}
      <div>
        <div className="text-[10px] font-mono uppercase tracking-widest text-zinc-500 mb-0.5">
          {t("winRate")}
        </div>
        <div className={`text-xl font-bold font-mono ${
            tick.win_rate >= 0.6 ? "text-emerald-400" : tick.win_rate >= 0.4 ? "text-amber-400" : "text-red-400"
        }`}>
          {winRate}%
        </div>
        <div className="text-[10px] font-mono text-zinc-500">
          {tick.total_trades} {t("totalTrades")}
        </div>
      </div>
    </div>
  );
}

/* ── Sub-metrics bar ── */

function SubMetrics({ tick }: { tick: ReturnType<typeof useBot>["tick"] }) {
  const prices = tick.prices ?? {};
  const firstAsset = Object.keys(prices)[0];
  const firstPrice = firstAsset ? parseFloat(prices[firstAsset].binance) : null;

  const items = [
    firstAsset && firstPrice !== null && !isNaN(firstPrice)
      ? `${firstAsset}/USD $${firstPrice.toLocaleString(undefined, { maximumFractionDigits: 0 })}`
      : null,
    `orders: ${tick.orders ?? 0}`,
    `fill: ${(tick.fills ?? 0).toLocaleString()}`,
    `mkts: ${tick.markets ?? 0}`,
    `signals: ${tick.signals ?? 0}`,
    `drawdown: ${(tick.drawdown_pct * 100).toFixed(1)}%`,
  ].filter(Boolean);

  return (
    <div className="flex items-center gap-3 text-[10px] font-mono text-zinc-500 overflow-x-auto">
      {items.map((item, i) => (
        <span key={i} className="whitespace-nowrap flex items-center gap-2">
          {i > 0 && <span className="text-zinc-700">|</span>}
          <span>{item}</span>
        </span>
      ))}
      <span className="text-zinc-700 ml-auto">|</span>
      <div className="flex items-end gap-px h-3 ml-2">
         {/* Mini Pixel Chart for decoration */}
         {[40, 70, 45, 90, 60, 30, 80, 100, 50, 70].map((v, i) => (
            <div key={i} className="w-[3px] bg-emerald-500/40 rounded-sm" style={{ height: `${v}%` }} />
         ))}
      </div>
    </div>
  );
}
