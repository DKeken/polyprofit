import { useState, useEffect, useRef } from "react";
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  ReferenceLine,
} from "recharts";
import { useBot, type Trade, type PnlPoint, type PositionInfo } from "../hooks/useBot";
import PriceMonitor from "./PriceMonitor";
import Controls from "./Controls";
import Settings from "./Settings";

/* ── Small sub-components ── */

function StatusDot({ alive, label }: { alive: boolean; label: string }) {
  return (
    <div className="flex items-center gap-2">
      <div
        className={`w-2 h-2 rounded-full ${alive ? "bg-emerald-400 animate-pulse" : "bg-red-400"}`}
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
    <tr className="border-b border-zinc-800/50 text-sm hover:bg-zinc-800/30 transition-colors">
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
      <td className="py-2 pr-3">
        {trade.adverse ? (
          <span className="text-red-400 text-xs">⚠</span>
        ) : null}
      </td>
      <td className="py-2 text-zinc-500 text-xs">{time}</td>
    </tr>
  );
}

function PnlChart({ data }: { data: PnlPoint[] }) {
  if (data.length < 2) {
    return (
      <div className="bg-zinc-900 rounded-lg border border-zinc-800 p-4">
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
    <div className="bg-zinc-900 rounded-lg border border-zinc-800 p-4">
      <h2 className="text-sm text-zinc-400 uppercase tracking-wider mb-3">
        Equity Curve
      </h2>
      <ResponsiveContainer width="100%" height={180}>
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

/** Drawdown progress bar — red when approaching limit */
function DrawdownMeter({
  drawdownPct,
  drawdownLimit,
}: {
  drawdownPct: number;
  drawdownLimit: string;
}) {
  const limit = parseFloat(drawdownLimit) || 0.2;
  const pct = drawdownPct * 100;
  const limitPct = limit * 100;
  const ratio = limit > 0 ? drawdownPct / limit : 0;

  const barColor =
    ratio > 0.8
      ? "bg-red-500"
      : ratio > 0.5
        ? "bg-yellow-500"
        : "bg-emerald-500";

  return (
    <div className="bg-zinc-900 rounded-lg border border-zinc-800 p-3">
      <div className="flex justify-between text-xs text-zinc-500 mb-1">
        <span>Drawdown</span>
        <span className="mono">
          {pct.toFixed(1)}% / {limitPct.toFixed(0)}%
        </span>
      </div>
      <div className="h-1.5 bg-zinc-800 rounded-full">
        <div
          className={`h-full ${barColor} rounded-full transition-all duration-500`}
          style={{ width: `${Math.min(ratio * 100, 100)}%` }}
        />
      </div>
    </div>
  );
}

/** Format uptime seconds → human-readable */
function formatUptime(secs: number): string {
  if (secs < 60) return `${secs}s`;
  const m = Math.floor(secs / 60);
  const s = secs % 60;
  if (m < 60) return `${m}m ${s}s`;
  const h = Math.floor(m / 60);
  const rm = m % 60;
  return `${h}h ${rm}m`;
}

/** Connection quality indicator based on WS latency */
function ConnectionBadge({ connected }: { connected: boolean }) {
  if (!connected) {
    return (
      <span className="px-2 py-0.5 rounded text-[10px] font-medium bg-red-500/20 text-red-400 border border-red-800/50 animate-pulse">
        Disconnected
      </span>
    );
  }
  return (
    <span className="px-2 py-0.5 rounded text-[10px] font-medium bg-emerald-500/20 text-emerald-400 border border-emerald-800/50">
      Live
    </span>
  );
}

/** Format age seconds to human-readable duration */
function formatAge(secs: number): string {
  if (secs < 60) return `${secs}s`;
  const m = Math.floor(secs / 60);
  if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60);
  return `${h}h ${m % 60}m`;
}

function PositionRow({ pos }: { pos: PositionInfo }) {
  return (
    <tr className="border-b border-zinc-800/50 text-sm hover:bg-zinc-800/30 transition-colors">
      <td className="py-2 pr-3 text-zinc-400 text-xs truncate max-w-[160px]">
        {pos.market || pos.condition_id.slice(0, 8)}
      </td>
      <td className="py-2 pr-3">
        <span
          className={
            pos.side === "YES" ? "text-emerald-400" : "text-red-400"
          }
        >
          {pos.side}
        </span>
      </td>
      <td className="py-2 pr-3 mono text-zinc-300">${pos.entry_price}</td>
      <td className="py-2 pr-3 mono text-zinc-300">${pos.size}</td>
      <td className="py-2 text-zinc-500 text-xs">{formatAge(pos.age_secs)}</td>
    </tr>
  );
}

type Tab = "dashboard" | "positions" | "settings";

/* ── Main Dashboard ── */

export default function Dashboard() {
  const { tick, connected, pnlHistory, pause, resume, kill, updateConfig } =
    useBot();
  const [tab, setTab] = useState<Tab>("dashboard");
  const tradesRef = useRef<HTMLDivElement>(null);

  // Auto-scroll trades table when new trades arrive
  const prevTradeCount = useRef(tick.trades.length);
  useEffect(() => {
    if (tick.trades.length > prevTradeCount.current && tradesRef.current) {
      tradesRef.current.scrollTop = 0;
    }
    prevTradeCount.current = tick.trades.length;
  }, [tick.trades.length]);

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
    <div className="min-h-screen bg-zinc-950 text-zinc-100 p-3 md:p-6">
      {/* ── Header ── */}
      <div className="max-w-7xl mx-auto">
        <div className="flex items-center justify-between mb-4">
          <div>
            <div className="flex items-center gap-3">
              <h1 className="text-xl font-semibold tracking-tight">
                polyprofit
              </h1>
              <ConnectionBadge connected={connected} />
            </div>
            <div className="flex items-center gap-4 mt-1">
              <StatusDot alive={tick.heartbeat_alive} label="Heartbeat" />
              <StatusDot
                alive={!tick.paused}
                label={tick.paused ? "Paused" : "Running"}
              />
              {tick.uptime_secs > 0 && (
                <span className="text-xs text-zinc-500">
                  ⏱ {formatUptime(tick.uptime_secs)}
                </span>
              )}
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

        {/* ── Win Rate Bar ── */}
        <div className="mb-4">
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

        {/* ── Tab switcher ── */}
        <div className="flex gap-1 mb-4">
          <button
            onClick={() => setTab("dashboard")}
            className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
              tab === "dashboard"
                ? "bg-zinc-800 text-zinc-100"
                : "text-zinc-500 hover:text-zinc-300"
            }`}
          >
            Dashboard
          </button>
          <button
            onClick={() => setTab("positions")}
            className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
              tab === "positions"
                ? "bg-zinc-800 text-zinc-100"
                : "text-zinc-500 hover:text-zinc-300"
            }`}
          >
            Positions
            {tick.open_positions.length > 0 && (
              <span className="ml-1.5 px-1.5 py-0.5 rounded-full bg-emerald-500/20 text-emerald-400 text-[10px]">
                {tick.open_positions.length}
              </span>
            )}
          </button>
          <button
            onClick={() => setTab("settings")}
            className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
              tab === "settings"
                ? "bg-zinc-800 text-zinc-100"
                : "text-zinc-500 hover:text-zinc-300"
            }`}
          >
            Settings
          </button>
        </div>

        {/* ── Tab Content ── */}
        {tab === "settings" ? (
          <Settings config={tick.config} onSave={updateConfig} />
        ) : tab === "positions" ? (
          /* ── Positions View ── */
          <div className="bg-zinc-900 rounded-lg border border-zinc-800 p-4">
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-sm text-zinc-400 uppercase tracking-wider">
                Open Positions
              </h2>
              <span className="text-xs text-zinc-600">
                {tick.open_positions.length} active
              </span>
            </div>
            {tick.open_positions.length === 0 ? (
              <div className="text-zinc-600 text-sm py-8 text-center">
                No open positions
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left">
                  <thead>
                    <tr className="text-xs text-zinc-500 uppercase border-b border-zinc-800">
                      <th className="pb-2 pr-3">Market</th>
                      <th className="pb-2 pr-3">Side</th>
                      <th className="pb-2 pr-3">Entry</th>
                      <th className="pb-2 pr-3">Size</th>
                      <th className="pb-2">Age</th>
                    </tr>
                  </thead>
                  <tbody>
                    {tick.open_positions.map((p, i) => (
                      <PositionRow key={p.condition_id || i} pos={p} />
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        ) : (
          /* ── Two-column layout: Live Feed (left) | Main content (right) ── */
          <div className="grid grid-cols-1 lg:grid-cols-[320px_1fr] gap-4">
            {/* ── Left: Live Feeds ── */}
            <div className="space-y-4">
              {/* Price Monitor */}
              <PriceMonitor prices={tick.prices} />

              {/* Metrics Grid */}
              <div className="grid grid-cols-2 gap-2">
                <Metric label="Positions" value={tick.positions} />
                <Metric label="Orders" value={tick.orders} />
                <Metric label="Markets" value={tick.markets} />
                <Metric label="Signals" value={tick.signals} />
                <Metric
                  label="Fills"
                  value={tick.fills}
                  color="text-emerald-400"
                />
                <Metric
                  label="Adverse"
                  value={tick.adverse}
                  color={tick.adverse > 0 ? "text-red-400" : undefined}
                />
              </div>

              {/* Drawdown Meter */}
              <DrawdownMeter
                drawdownPct={tick.drawdown_pct}
                drawdownLimit={tick.config.drawdown_limit}
              />

              {/* Controls */}
              <Controls
                paused={tick.paused}
                mode={tick.mode}
                onPause={pause}
                onResume={resume}
                onKill={kill}
              />

              {/* Footer stats */}
              <div className="text-xs text-zinc-600 text-center space-y-0.5">
                <div>
                  Placed: {tick.orders_placed} · Cancelled:{" "}
                  {tick.orders_cancelled} · Reconnects: {tick.reconnects}
                </div>
              </div>
            </div>

            {/* ── Right: Charts + Trades ── */}
            <div className="space-y-4">
              {/* Equity Curve */}
              <PnlChart data={pnlHistory} />

              {/* Recent Trades */}
              <div className="bg-zinc-900 rounded-lg border border-zinc-800 p-4">
                <div className="flex items-center justify-between mb-3">
                  <h2 className="text-sm text-zinc-400 uppercase tracking-wider">
                    Recent Trades
                  </h2>
                  {tick.trades.length > 0 && (
                    <span className="text-xs text-zinc-600">
                      {tick.trades.length} shown
                    </span>
                  )}
                </div>
                {tick.trades.length === 0 ? (
                  <div className="text-zinc-600 text-sm py-8 text-center">
                    No trades yet
                  </div>
                ) : (
                  <div
                    ref={tradesRef}
                    className="overflow-x-auto max-h-[400px] overflow-y-auto"
                  >
                    <table className="w-full text-left">
                      <thead className="sticky top-0 bg-zinc-900">
                        <tr className="text-xs text-zinc-500 uppercase border-b border-zinc-800">
                          <th className="pb-2 pr-3">Market</th>
                          <th className="pb-2 pr-3">Side</th>
                          <th className="pb-2 pr-3">Price</th>
                          <th className="pb-2 pr-3">Size</th>
                          <th className="pb-2 pr-3">P&L</th>
                          <th className="pb-2 pr-3"></th>
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
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
