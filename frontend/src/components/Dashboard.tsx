import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  ReferenceLine,
} from "recharts";
import { useBot, type Trade, type PnlPoint } from "../hooks/useBot";
import PriceMonitor from "./PriceMonitor";
import Controls from "./Controls";

/* ── Small sub-components ── */

function StatusDot({ alive, label }: { alive: boolean; label: string }) {
  return (
    <div className="flex items-center gap-2">
      <div
        className={`w-2 h-2 rounded-full ${alive ? "bg-emerald-400" : "bg-red-400"}`}
      />
      <span className="text-xs text-zinc-400">{label}</span>
    </div>
  );
}

function Metric({
  label,
  value,
  color,
}: {
  label: string;
  value: string | number;
  color?: string;
}) {
  return (
    <div className="bg-zinc-900 rounded-lg p-3 border border-zinc-800">
      <div className="text-xs text-zinc-500 uppercase tracking-wider mb-1">
        {label}
      </div>
      <div className={`mono text-lg font-semibold ${color ?? "text-zinc-100"}`}>
        {value}
      </div>
    </div>
  );
}

function TradeRow({ trade }: { trade: Trade }) {
  const pnl = trade.pnl ? parseFloat(trade.pnl) : null;
  const time = new Date(trade.ts).toLocaleTimeString();
  return (
    <tr className="border-b border-zinc-800/50 text-sm">
      <td className="py-2 pr-3 text-zinc-400 text-xs truncate max-w-[120px]">
        {trade.market || "—"}
      </td>
      <td className="py-2 pr-3">
        <span
          className={
            trade.side === "Yes" || trade.side === "YES"
              ? "text-emerald-400"
              : "text-red-400"
          }
        >
          {trade.side}
        </span>
      </td>
      <td className="py-2 pr-3 mono text-zinc-300">${trade.price}</td>
      <td className="py-2 pr-3 mono text-zinc-300">${trade.size}</td>
      <td className="py-2 pr-3 mono">
        {pnl !== null ? (
          <span className={pnl >= 0 ? "text-emerald-400" : "text-red-400"}>
            {pnl >= 0 ? "+" : ""}
            {trade.pnl}
          </span>
        ) : (
          <span className="text-zinc-600">—</span>
        )}
      </td>
      <td className="py-2 text-zinc-500 text-xs">{time}</td>
    </tr>
  );
}

function PnlChart({ data }: { data: PnlPoint[] }) {
  if (data.length < 2) {
    return (
      <div className="bg-zinc-900 rounded-lg border border-zinc-800 p-4 mb-6">
        <h2 className="text-sm text-zinc-400 uppercase tracking-wider mb-3">
          Equity Curve
        </h2>
        <div className="text-zinc-600 text-sm py-8 text-center">
          Waiting for data…
        </div>
      </div>
    );
  }

  const latest = data[data.length - 1].pnl;
  const color = latest >= 0 ? "#34d399" : "#f87171";
  const gradientId = latest >= 0 ? "pnlGreen" : "pnlRed";

  return (
    <div className="bg-zinc-900 rounded-lg border border-zinc-800 p-4 mb-6">
      <h2 className="text-sm text-zinc-400 uppercase tracking-wider mb-3">
        Equity Curve
      </h2>
      <ResponsiveContainer width="100%" height={160}>
        <AreaChart
          data={data}
          margin={{ top: 4, right: 4, bottom: 0, left: 4 }}
        >
          <defs>
            <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={color} stopOpacity={0.3} />
              <stop offset="100%" stopColor={color} stopOpacity={0} />
            </linearGradient>
          </defs>
          <XAxis
            dataKey="time"
            tick={{ fontSize: 10, fill: "#71717a" }}
            axisLine={false}
            tickLine={false}
            interval="preserveStartEnd"
          />
          <YAxis
            tick={{ fontSize: 10, fill: "#71717a" }}
            axisLine={false}
            tickLine={false}
            width={48}
            tickFormatter={(v: number) => `$${v}`}
          />
          <Tooltip
            contentStyle={{
              background: "#18181b",
              border: "1px solid #27272a",
              borderRadius: 8,
              fontSize: 12,
            }}
            labelStyle={{ color: "#a1a1aa" }}
            formatter={
              ((v: unknown) => [
                `$${Number(v ?? 0).toFixed(2)}`,
                "P&L",
              ]) as never
            }
          />
          <ReferenceLine y={0} stroke="#3f3f46" strokeDasharray="3 3" />
          <Area
            type="monotone"
            dataKey="pnl"
            stroke={color}
            strokeWidth={2}
            fill={`url(#${gradientId})`}
            dot={false}
            isAnimationActive={false}
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}

/* ── Main Dashboard ── */

export default function Dashboard() {
  const { tick, connected, pnlHistory, pause, resume, kill } = useBot();

  const pnlVal = parseFloat(tick.daily_pnl);
  const pnlColor =
    pnlVal > 0
      ? "text-emerald-400"
      : pnlVal < 0
        ? "text-red-400"
        : "text-zinc-100";
  const pnlPrefix = pnlVal > 0 ? "+" : "";
  const winPct = (tick.win_rate * 100).toFixed(0);

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100 p-4 md:p-8">
      <div className="max-w-4xl mx-auto">
        {/* ── 1. Header: Balance + P&L + Status ── */}
        <div className="flex items-center justify-between mb-2">
          <div>
            <h1 className="text-xl font-semibold tracking-tight">polyprofit</h1>
            <div className="flex items-center gap-4 mt-1">
              <StatusDot
                alive={connected}
                label={connected ? "WS" : "Disconnected"}
              />
              <StatusDot alive={tick.heartbeat_alive} label="Heartbeat" />
              <StatusDot
                alive={!tick.paused}
                label={tick.paused ? "Paused" : "Running"}
              />
            </div>
          </div>
          <div className="text-right">
            <div className="mono text-3xl font-bold text-zinc-100">
              ${tick.balance}
            </div>
            <div className={`mono text-lg font-semibold ${pnlColor}`}>
              {pnlPrefix}${tick.daily_pnl} today
            </div>
          </div>
        </div>

        {/* ── 2. Win Rate Bar ── */}
        <div className="mb-6">
          <div className="flex justify-between text-xs text-zinc-500 mb-1">
            <span>Win Rate ({tick.total_trades} trades)</span>
            <span className="mono">{winPct}%</span>
          </div>
          <div className="h-1.5 bg-zinc-800 rounded-full">
            <div
              className="h-full bg-emerald-500 rounded-full transition-all duration-500"
              style={{ width: `${Math.min(tick.win_rate * 100, 100)}%` }}
            />
          </div>
        </div>

        {/* ── 3. Price Monitor ── */}
        <PriceMonitor prices={tick.prices} />

        {/* ── 4. Metrics Grid ── */}
        <div className="grid grid-cols-3 md:grid-cols-6 gap-3 mb-6">
          <Metric label="Positions" value={tick.positions} />
          <Metric label="Orders" value={tick.orders} />
          <Metric label="Markets" value={tick.markets} />
          <Metric label="Signals" value={tick.signals} />
          <Metric label="Fills" value={tick.fills} color="text-emerald-400" />
          <Metric
            label="Adverse"
            value={tick.adverse}
            color={tick.adverse > 0 ? "text-red-400" : undefined}
          />
        </div>

        {/* ── 5. Equity Curve ── */}
        <PnlChart data={pnlHistory} />

        {/* ── 6. Recent Trades ── */}
        <div className="bg-zinc-900 rounded-lg border border-zinc-800 p-4">
          <h2 className="text-sm text-zinc-400 uppercase tracking-wider mb-3">
            Recent Trades
          </h2>
          {tick.trades.length === 0 ? (
            <div className="text-zinc-600 text-sm py-8 text-center">
              No trades yet
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left">
                <thead>
                  <tr className="text-xs text-zinc-500 uppercase border-b border-zinc-800">
                    <th className="pb-2 pr-3">Market</th>
                    <th className="pb-2 pr-3">Side</th>
                    <th className="pb-2 pr-3">Price</th>
                    <th className="pb-2 pr-3">Size</th>
                    <th className="pb-2 pr-3">P&L</th>
                    <th className="pb-2">Time</th>
                  </tr>
                </thead>
                <tbody>
                  {tick.trades.map((t, i) => (
                    <TradeRow key={i} trade={t} />
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* ── 7. Controls Footer ── */}
        <Controls
          paused={tick.paused}
          mode={tick.mode}
          onPause={pause}
          onResume={resume}
          onKill={kill}
        />

        {/* Footer stats */}
        <div className="text-center text-xs text-zinc-600 mt-4">
          Placed: {tick.orders_placed} · Cancelled: {tick.orders_cancelled} ·
          Reconnects: {tick.reconnects}
        </div>
      </div>
    </div>
  );
}
