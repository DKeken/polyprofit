import { useState, useEffect, useCallback } from "react";
import { api, type AnalyticsResponse, type AssetStats } from "../api";

/* ── Helpers ── */

function formatPnl(val: string | null | undefined): string {
  if (!val) return "—";
  const n = parseFloat(val);
  if (Number.isNaN(n)) return "—";
  const prefix = n > 0 ? "+" : "";
  return `${prefix}$${n.toFixed(2)}`;
}

function pnlColor(val: string | null | undefined): string {
  if (!val) return "text-zinc-500";
  const n = parseFloat(val);
  if (n > 0) return "text-emerald-400";
  if (n < 0) return "text-red-400";
  return "text-zinc-300";
}

/* ── Stat Card ── */

function StatCard({
  label,
  value,
  sub,
  color,
  large,
}: {
  label: string;
  value: string;
  sub?: string;
  color?: string;
  large?: boolean;
}) {
  return (
    <div className="bg-zinc-900 rounded-xl border border-zinc-800 p-4 card-glow animate-fade-in">
      <div className="text-[11px] text-zinc-500 uppercase tracking-wider font-medium mb-2">
        {label}
      </div>
      <div
        className={`mono font-semibold ${color ?? "text-zinc-100"} ${
          large ? "text-2xl" : "text-lg"
        }`}
      >
        {value}
      </div>
      {sub && <div className="text-[11px] text-zinc-600 mt-1">{sub}</div>}
    </div>
  );
}

/* ── Asset Breakdown Row ── */

function AssetRow({
  asset,
  stats,
}: {
  asset: string;
  stats: AssetStats;
}) {
  const pnl = parseFloat(stats.total_pnl);
  const wr =
    stats.wins + stats.losses > 0
      ? ((stats.wins / (stats.wins + stats.losses)) * 100).toFixed(0)
      : "—";

  return (
    <tr className="border-b border-zinc-800/50 text-sm hover:bg-zinc-800/30 transition-colors">
      <td className="py-3 pr-4">
        <span className="font-medium text-zinc-200">{asset}</span>
      </td>
      <td className="py-3 pr-4 mono text-zinc-400">{stats.trades}</td>
      <td className="py-3 pr-4 mono text-emerald-400">{stats.wins}</td>
      <td className="py-3 pr-4 mono text-red-400">{stats.losses}</td>
      <td className="py-3 pr-4 mono text-zinc-300">{wr}%</td>
      <td className={`py-3 mono ${pnl >= 0 ? "text-emerald-400" : "text-red-400"}`}>
        {formatPnl(stats.total_pnl)}
      </td>
    </tr>
  );
}

/* ── Win/Loss donut ── */

function WinLossRing({
  wins,
  losses,
  pending,
}: {
  wins: number;
  losses: number;
  pending: number;
}) {
  const total = wins + losses + pending;
  if (total === 0) {
    return (
      <div className="flex items-center justify-center h-32 text-zinc-600 text-sm">
        No trades yet
      </div>
    );
  }

  const winPct = (wins / total) * 100;
  const lossPct = (losses / total) * 100;
  // pending fills the rest

  const r = 42;
  const c = 2 * Math.PI * r;
  const winLen = (winPct / 100) * c;
  const lossLen = (lossPct / 100) * c;

  return (
    <div className="flex items-center justify-center gap-6">
      <svg width="100" height="100" viewBox="0 0 100 100">
        <circle cx="50" cy="50" r={r} fill="none" stroke="#27272a" strokeWidth="8" />
        <circle
          cx="50"
          cy="50"
          r={r}
          fill="none"
          stroke="#34d399"
          strokeWidth="8"
          strokeDasharray={`${winLen} ${c}`}
          strokeDashoffset="0"
          transform="rotate(-90 50 50)"
          strokeLinecap="round"
        />
        <circle
          cx="50"
          cy="50"
          r={r}
          fill="none"
          stroke="#f87171"
          strokeWidth="8"
          strokeDasharray={`${lossLen} ${c}`}
          strokeDashoffset={`${-winLen}`}
          transform="rotate(-90 50 50)"
          strokeLinecap="round"
        />
        <text
          x="50"
          y="46"
          textAnchor="middle"
          className="mono"
          fill="#f4f4f5"
          fontSize="16"
          fontWeight="600"
        >
          {total}
        </text>
        <text
          x="50"
          y="60"
          textAnchor="middle"
          fill="#71717a"
          fontSize="9"
        >
          trades
        </text>
      </svg>

      <div className="space-y-2 text-xs">
        <div className="flex items-center gap-2">
          <div className="w-2.5 h-2.5 rounded-full bg-emerald-400" />
          <span className="text-zinc-400">Won</span>
          <span className="mono text-zinc-200 ml-auto">{wins}</span>
        </div>
        <div className="flex items-center gap-2">
          <div className="w-2.5 h-2.5 rounded-full bg-red-400" />
          <span className="text-zinc-400">Lost</span>
          <span className="mono text-zinc-200 ml-auto">{losses}</span>
        </div>
        {pending > 0 && (
          <div className="flex items-center gap-2">
            <div className="w-2.5 h-2.5 rounded-full bg-zinc-600" />
            <span className="text-zinc-400">Open</span>
            <span className="mono text-zinc-200 ml-auto">{pending}</span>
          </div>
        )}
      </div>
    </div>
  );
}

/* ── Main Component ── */

export default function Analytics() {
  const [data, setData] = useState<AnalyticsResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchData = useCallback(async () => {
    try {
      const res = await api.analytics();
      setData(res);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load analytics");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
    const id = setInterval(fetchData, 10_000);
    return () => clearInterval(id);
  }, [fetchData]);

  if (loading) {
    return (
      <div className="space-y-4 animate-fade-in">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {Array.from({ length: 8 }).map((_, i) => (
            <div
              key={i}
              className="bg-zinc-900 rounded-xl border border-zinc-800 p-4 h-24 shimmer"
            />
          ))}
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="bg-zinc-900 rounded-xl border border-zinc-800 p-8 text-center animate-fade-in">
        <div className="text-red-400 text-sm mb-2">{error}</div>
        <button
          onClick={fetchData}
          className="text-xs text-zinc-400 hover:text-zinc-200 transition-colors"
        >
          Try again
        </button>
      </div>
    );
  }

  if (!data) return null;

  const assetEntries = Object.entries(data.by_asset).sort(
    (a, b) => parseFloat(b[1].total_pnl) - parseFloat(a[1].total_pnl),
  );

  const exportCsv = async () => {
    try {
      const csv = await api.exportTradesCsv();
      const blob = new Blob([csv], { type: "text/csv" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = "polyprofit_trades.csv";
      a.click();
      URL.revokeObjectURL(url);
    } catch {
      /* ignore */
    }
  };

  return (
    <div className="space-y-4 animate-slide-up">
      {/* ── Hero Stats ── */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <StatCard
          label="Total P&L"
          value={formatPnl(data.total_pnl)}
          color={pnlColor(data.total_pnl)}
          large
        />
        <StatCard
          label="Win Rate"
          value={`${(data.win_rate * 100).toFixed(1)}%`}
          sub={`${data.winning_trades}W / ${data.losing_trades}L`}
          color={
            data.win_rate >= 0.5 ? "text-emerald-400" : "text-red-400"
          }
          large
        />
        <StatCard
          label="Profit Factor"
          value={
            data.profit_factor !== null
              ? data.profit_factor.toFixed(2)
              : "—"
          }
          sub={data.profit_factor !== null && data.profit_factor >= 1.0 ? "Profitable" : data.profit_factor !== null ? "Losing" : undefined}
          color={
            data.profit_factor !== null && data.profit_factor >= 1.0
              ? "text-emerald-400"
              : data.profit_factor !== null
                ? "text-red-400"
                : "text-zinc-500"
          }
          large
        />
        <StatCard
          label="Total Trades"
          value={String(data.total_trades)}
          sub={data.pending_trades > 0 ? `${data.pending_trades} pending` : undefined}
          large
        />
      </div>

      {/* ── Detail Cards Row ── */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <StatCard
          label="Best Trade"
          value={formatPnl(data.best_trade_pnl)}
          color="text-emerald-400"
        />
        <StatCard
          label="Worst Trade"
          value={formatPnl(data.worst_trade_pnl)}
          color="text-red-400"
        />
        <StatCard
          label="Avg Trade"
          value={formatPnl(data.avg_trade_pnl)}
          color={pnlColor(data.avg_trade_pnl)}
        />
        <StatCard
          label="Avg Win / Avg Loss"
          value={`${formatPnl(data.avg_win)} / ${formatPnl(data.avg_loss)}`}
          color="text-zinc-300"
        />
      </div>

      {/* ── Win/Loss Ring + By-Asset Table ── */}
      <div className="grid grid-cols-1 lg:grid-cols-[280px_1fr] gap-4">
        {/* Ring chart */}
        <div className="bg-zinc-900 rounded-xl border border-zinc-800 p-4 card-glow">
          <h3 className="text-[11px] text-zinc-500 uppercase tracking-wider font-medium mb-4">
            Trade Distribution
          </h3>
          <WinLossRing
            wins={data.winning_trades}
            losses={data.losing_trades}
            pending={data.pending_trades}
          />
        </div>

        {/* By-asset table */}
        <div className="bg-zinc-900 rounded-xl border border-zinc-800 p-4 card-glow">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-[11px] text-zinc-500 uppercase tracking-wider font-medium">
              Performance by Asset
            </h3>
            <button
              onClick={exportCsv}
              className="text-[11px] px-2.5 py-1 rounded-md border border-zinc-700 text-zinc-400 hover:text-zinc-200 hover:border-zinc-500 transition-colors"
            >
              Export CSV
            </button>
          </div>

          {assetEntries.length === 0 ? (
            <div className="text-zinc-600 text-sm py-8 text-center">
              No trade data by asset yet
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left">
                <thead>
                  <tr className="text-[11px] text-zinc-500 uppercase border-b border-zinc-800">
                    <th className="pb-2 pr-4">Asset</th>
                    <th className="pb-2 pr-4">Trades</th>
                    <th className="pb-2 pr-4">Wins</th>
                    <th className="pb-2 pr-4">Losses</th>
                    <th className="pb-2 pr-4">Win %</th>
                    <th className="pb-2">P&L</th>
                  </tr>
                </thead>
                <tbody>
                  {assetEntries.map(([asset, stats]) => (
                    <AssetRow key={asset} asset={asset} stats={stats} />
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
