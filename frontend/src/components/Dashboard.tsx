import { useBot } from "../hooks/useBot";
import EquityCurve from "./EquityCurve";
import ExecutionLog from "./ExecutionLog";
import TradeFeed from "./TradeFeed";

/* ── Main Dashboard ── */

export default function Dashboard() {
  const { tick, connected, pnlHistory, logEntries } = useBot();

  return (
    <div className="flex-1 flex flex-col min-h-0 overflow-hidden">
      {/* ── Two-column layout ── */}
      <div className="flex-1 flex min-h-0">
        {/* ── Left: Trade Feed ── */}
        <div className="w-[480px] shrink-0 border-r border-zinc-700/60 flex flex-col min-h-0">
          <TradeFeed
            trades={tick.trades}
            positions={tick.open_positions}
            totalTrades={tick.total_trades}
            tick={tick}
          />
        </div>

        {/* ── Right: Metrics + Chart + Log ── */}
        <div className="flex-1 flex flex-col min-h-0">
          {/* ── Metrics strip ── */}
          <MetricsStrip tick={tick} />

          {/* ── Sub-metrics ── */}
          <SubMetrics tick={tick} />

          {/* ── Equity Curve ── */}
          <div className="flex-1 min-h-0 flex flex-col">
            <div className="flex-1 min-h-[200px]">
              <EquityCurve data={pnlHistory} />
            </div>

            {/* ── Execution Log ── */}
            <div className="h-[280px] shrink-0">
              <ExecutionLog entries={logEntries} connected={connected} />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

/* ── Inline Metrics Strip ── */

function MetricsStrip({ tick }: { tick: ReturnType<typeof useBot>["tick"] }) {
  const balance = parseFloat(tick.balance) || 0;
  const pnl = parseFloat(tick.total_pnl) || 0;
  const dailyPnl = parseFloat(tick.daily_pnl) || 0;
  const winRate = (tick.win_rate * 100).toFixed(1);

  return (
    <div className="border-b border-zinc-700/60 px-5 py-3 flex items-end gap-8">
      {/* Balance */}
      <div>
        <div className="text-[10px] font-mono uppercase tracking-widest text-zinc-500 mb-0.5">
          Balance
        </div>
        <div className="text-2xl font-bold font-mono text-zinc-100">
          $
          {balance.toLocaleString(undefined, {
            minimumFractionDigits: 2,
            maximumFractionDigits: 2,
          })}
        </div>
        {pnl !== 0 && (
          <div
            className={`text-[10px] font-mono ${pnl >= 0 ? "text-emerald-500/70" : "text-red-400/70"}`}
          >
            {pnl >= 0 ? "+" : ""}
            {pnl.toFixed(2)}
          </div>
        )}
      </div>

      {/* Total P&L */}
      <div>
        <div className="text-[10px] font-mono uppercase tracking-widest text-zinc-500 mb-0.5">
          Total P&L
        </div>
        <div
          className={`text-2xl font-bold font-mono ${pnl >= 0 ? "text-profit" : "text-loss"}`}
        >
          {pnl >= 0 ? "+" : ""}$
          {Math.abs(pnl).toLocaleString(undefined, {
            minimumFractionDigits: 2,
            maximumFractionDigits: 2,
          })}
        </div>
        <div
          className={`text-[10px] font-mono ${dailyPnl >= 0 ? "text-emerald-500/70" : "text-red-400/70"}`}
        >
          {dailyPnl >= 0 ? "+" : ""}${dailyPnl.toFixed(2)}
        </div>
      </div>

      {/* Orders / Fills */}
      <div>
        <div className="text-[10px] font-mono uppercase tracking-widest text-zinc-500 mb-0.5">
          Orders
        </div>
        <div className="text-2xl font-bold font-mono text-cyan">
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
        <div
          className={`text-2xl font-bold font-mono ${dailyPnl >= 0 ? "text-profit" : "text-loss"}`}
        >
          {dailyPnl >= 0 ? "+" : ""}$
          {Math.abs(dailyPnl).toLocaleString(undefined, {
            minimumFractionDigits: 2,
            maximumFractionDigits: 2,
          })}
        </div>
      </div>

      {/* Win Rate */}
      <div className="ml-auto">
        <div className="text-[10px] font-mono uppercase tracking-widest text-zinc-500 mb-0.5">
          Win Rate
        </div>
        <div
          className={`text-2xl font-bold font-mono ${
            tick.win_rate >= 0.6
              ? "text-profit"
              : tick.win_rate >= 0.4
                ? "text-amber"
                : "text-loss"
          }`}
        >
          {winRate}%
        </div>
        <div className="text-[10px] font-mono text-zinc-500">
          {tick.total_trades} trades
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
    <div className="border-b border-zinc-700/40 px-5 py-1.5 flex items-center gap-3 text-[10px] font-mono text-zinc-500 overflow-x-auto">
      {items.map((item, i) => (
        <span key={i} className="whitespace-nowrap flex items-center gap-2">
          {i > 0 && <span className="text-zinc-700">|</span>}
          <span>{item}</span>
        </span>
      ))}
    </div>
  );
}
