import { useMemo, useEffect, useState, useCallback } from "react";
import type { WhaleRow, WhaleEventRow } from "../../shared/hooks/useWhales";
import type { WhaleHistoryResponse } from "../../shared/api";
import { whaleApi } from "../../shared/api";
import { fmtUsd, shortenAddress, pnlColor } from "../../shared/lib/format";
import { Panel, Stat, Badge } from "../../shared/ui";
import { ArrowLeft } from "lucide-react";
import {
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  BarChart,
  Bar,
  Cell,
  CartesianGrid,
  LineChart,
  Line,
  ReferenceLine,
  Legend,
} from "recharts";

interface WhaleDetailsProps {
  address: string;
  whales: WhaleRow[];
  activity: WhaleEventRow[];
  onBack?: () => void;
}

type ChartMode = "bar" | "cumulative";

// ── Helpers ────────────────────────────────────────────────────────────────

function buyLabel(side: string) {
  const s = side.toUpperCase();
  return s.startsWith("BUY");
}

function formatTime(iso: string) {
  const d = new Date(iso);
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric" }) + " " +
    d.toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit", hour12: false });
}

// ── Tooltip ────────────────────────────────────────────────────────────────

function TradeTooltip({ active, payload }: { active?: boolean; payload?: ReadonlyArray<{ payload: ChartPoint }> }) {
  if (!active || !payload?.length) return null;
  const d = payload[0].payload;
  const isBuy = buyLabel(d.side);
  return (
    <div className="bg-zinc-900/95 border border-zinc-700/70 rounded-lg shadow-2xl p-3 text-[11px] font-mono min-w-[180px]">
      <div className="text-zinc-500 mb-1.5 border-b border-zinc-800 pb-1">{d.time}</div>
      <div className={`font-bold text-base mb-1 ${isBuy ? "text-emerald-400" : "text-rose-400"}`}>
        {d.side.split(" ")[0]} {d.side.includes(" ") ? `(${d.side.split(" ").slice(1).join(" ")})` : ""}: ${fmtUsd(d.amount, 2)}
      </div>
      <div className="text-zinc-400 text-[10px] leading-tight mt-1.5 max-w-[220px]">{d.question ?? "—"}</div>
      {d.price > 0 && (
        <div className="text-zinc-500 text-[10px] mt-1">Price: {(d.price * 100).toFixed(1)}¢</div>
      )}
    </div>
  );
}

interface ChartPoint {
  time: string;
  amount: number;
  price: number;
  side: string;
  question: string | null;
  cumulative: number;
  pnl: number; // approximation: positive for BUY, negative for SELL (size)
}

function buildChartData(trades: WhaleEventRow[]): ChartPoint[] {
  // Oldest first for chart
  const sorted = [...trades].sort(
    (a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime(),
  );
  let cumulative = 0;
  return sorted.map((ev) => {
    const amount = parseFloat(ev.amount) || 0;
    const price = parseFloat(ev.price) || 0;
    const isBuy = buyLabel(ev.side);
    const pnl = isBuy ? amount : -amount;
    cumulative += pnl;
    return {
      time: formatTime(ev.timestamp),
      amount,
      price,
      side: ev.side,
      question: ev.question,
      cumulative,
      pnl,
    };
  });
}

// ── Custom Legend ───────────────────────────────────────────────────────────

function ChartLegend() {
  return (
    <div className="flex gap-4 items-center justify-end text-[10px] font-mono text-zinc-500 shrink-0 pr-1">
      <span className="flex items-center gap-1">
        <span className="inline-block w-2 h-2 rounded-sm bg-emerald-400/80" /> BUY
      </span>
      <span className="flex items-center gap-1">
        <span className="inline-block w-2 h-2 rounded-sm bg-rose-400/80" /> SELL
      </span>
    </div>
  );
}

// ── Main Component ──────────────────────────────────────────────────────────

export default function WhaleDetails({
  address,
  whales,
  activity,
  onBack,
}: WhaleDetailsProps) {
  const [history, setHistory] = useState<WhaleEventRow[]>([]);
  const [histLoading, setHistLoading] = useState(true);
  const [histError, setHistError] = useState<string | null>(null);
  const [chartMode, setChartMode] = useState<ChartMode>("bar");
  const [showAll, setShowAll] = useState(false);

  const whale = useMemo(
    () => whales.find((w) => w.address === address),
    [whales, address],
  );

  // Fetch historical trades when address changes
  const loadHistory = useCallback(async () => {
    setHistLoading(true);
    setHistError(null);
    try {
      const res: WhaleHistoryResponse = await whaleApi.history(address);
      setHistory(res.trades);
    } catch (e) {
      setHistError(e instanceof Error ? e.message : "Failed to load history");
    } finally {
      setHistLoading(false);
    }
  }, [address]);

  useEffect(() => {
    loadHistory();
  }, [loadHistory]);

  // Merge live activity (most recent) with historical (older), deduplicate by condition_id+timestamp
  const allTrades = useMemo(() => {
    const live = activity.filter((a) => a.address === address);
    const seen = new Set(live.map((t) => `${t.condition_id}|${t.timestamp}`));
    const filtered = history.filter(
      (t) => !seen.has(`${t.condition_id}|${t.timestamp}`),
    );
    return [...live, ...filtered];
  }, [activity, history, address]);

  const chartData = useMemo(() => buildChartData(allTrades), [allTrades]);

  // Show last 30 trades by default; user can expand
  const visibleData = useMemo(
    () => (showAll ? chartData : chartData.slice(-30)),
    [chartData, showAll],
  );

  // Recent trades table (newest first)
  const recentTrades = useMemo(
    () => [...allTrades].sort(
      (a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime(),
    ).slice(0, 15),
    [allTrades],
  );

  if (!whale) {
    return (
      <div className="flex flex-col items-center justify-center flex-1 min-h-0 text-zinc-500 font-mono text-sm gap-3">
        {onBack && (
          <button onClick={onBack} className="text-zinc-400 hover:text-zinc-200 p-2 mb-4">
            <ArrowLeft className="w-5 h-5" />
          </button>
        )}
        <div className="text-2xl text-zinc-400 opacity-50">✕</div>
        <div>Whale not found or not tracked.</div>
        <div className="text-xs text-zinc-600">{address}</div>
      </div>
    );
  }

  const profit = parseFloat(whale.profit) || 0;
  const vol = parseFloat(whale.volume) || 0;
  const totalPnlFromChart = chartData.reduce((acc, d) => acc + d.pnl, 0);

  return (
    <div className="flex flex-col flex-1 min-h-0 min-w-0 gap-3 overflow-y-auto pr-0.5">
      {/* ── Header ── */}
      <Panel className="shrink-0 border-zinc-800/60 bg-zinc-900/40 p-4">
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0 flex items-start gap-3">
            {onBack && (
              <button
                onClick={onBack}
                className="mt-0.5 p-1 -ml-2 rounded-md text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800/50 transition-colors"
                title="Go back"
              >
                <ArrowLeft className="w-4 h-4" />
              </button>
            )}
            <div>
              <h2 className="text-lg font-mono font-bold text-zinc-100 flex items-center gap-2 flex-wrap">
                <span className="truncate">{whale.display_name ?? shortenAddress(address)}</span>
                {whale.followed && <Badge color="violet">FOLLOWING</Badge>}
                {whale.archived && <Badge color="zinc">ARCHIVED</Badge>}
              </h2>
              <p className="text-[10px] font-mono text-zinc-600 mt-1 truncate">{address}</p>
            </div>
          </div>
          <div className="text-right shrink-0">
            <div className="text-[10px] font-mono text-zinc-500 uppercase tracking-widest mb-0.5">
              Total Profit
            </div>
            <div className={`text-2xl font-mono font-bold tabular-nums ${pnlColor(profit)}`}>
              {profit >= 0 ? "+" : ""}${fmtUsd(profit, 0)}
            </div>
          </div>
        </div>

        <div className="h-px bg-zinc-800/60 my-3" />

        {/* Stats row */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <Stat
            label="Win Rate"
            value={`${(whale.win_rate * 100).toFixed(1)}%`}
            highlight={whale.win_rate >= 0.65}
          />
          <Stat label="ROI" value={`${(whale.roi * 100).toFixed(1)}%`} />
          <Stat label="Volume" value={`$${fmtUsd(vol, 0)}`} />
          <Stat label="Markets" value={String(whale.markets_traded)} />
        </div>
      </Panel>

      {/* ── Trade Chart ── */}
      <Panel className="shrink-0 border-zinc-800/60 bg-zinc-900/40 p-4 flex flex-col gap-3">
        <div className="flex items-center justify-between gap-2">
          <div>
            <h3 className="text-xs font-mono font-semibold text-zinc-300 uppercase tracking-widest">
              Trade Activity
            </h3>
            {!histLoading && (
              <p className="text-[10px] text-zinc-600 font-mono mt-0.5">
                {allTrades.length} trades total · {visibleData.length} shown
              </p>
            )}
          </div>
          <div className="flex items-center gap-2">
            <div className="flex rounded-md overflow-hidden border border-zinc-800">
              {(["bar", "cumulative"] as ChartMode[]).map((mode) => (
                <button
                  key={mode}
                  onClick={() => setChartMode(mode)}
                  className={`px-2.5 py-1 text-[10px] font-mono uppercase tracking-wide transition-colors ${
                    chartMode === mode
                      ? "bg-emerald-600 text-white"
                      : "text-zinc-500 hover:text-zinc-300 hover:bg-zinc-800"
                  }`}
                >
                  {mode === "bar" ? "Trades" : "Cumulative"}
                </button>
              ))}
            </div>
          </div>
        </div>

        {histLoading ? (
          <div className="h-48 flex items-center justify-center">
            <div className="flex gap-1.5 items-center text-zinc-600 text-xs font-mono">
              <span className="animate-spin">⟳</span> Loading history…
            </div>
          </div>
        ) : histError ? (
          <div className="h-48 flex flex-col items-center justify-center gap-2 text-xs font-mono">
            <div className="text-rose-400">⚠ {histError}</div>
            <button onClick={loadHistory} className="text-zinc-500 hover:text-zinc-300 underline text-[10px]">
              Retry
            </button>
          </div>
        ) : visibleData.length === 0 ? (
          <div className="h-48 flex flex-col items-center justify-center gap-2 border border-dashed border-zinc-800/60 rounded-lg">
            <div className="text-2xl">📊</div>
            <div className="text-xs font-mono text-zinc-600">No trades recorded yet.</div>
          </div>
        ) : (
          <>
            <ChartLegend />
            <div style={{ height: 220 }}>
              <ResponsiveContainer width="100%" height="100%">
                {chartMode === "bar" ? (
                  <BarChart data={visibleData} margin={{ top: 4, right: 4, left: 4, bottom: 0 }} barCategoryGap="30%">
                    <CartesianGrid strokeDasharray="3 3" stroke="#27272a" vertical={false} />
                    <XAxis
                      dataKey="time"
                      tick={{ fontSize: 9, fontFamily: "monospace", fill: "#52525b" }}
                      tickLine={false}
                      axisLine={false}
                      interval="preserveStartEnd"
                    />
                    <YAxis
                      tickFormatter={(val) => `$${fmtUsd(val, 0)}`}
                      tick={{ fontSize: 9, fontFamily: "monospace", fill: "#52525b" }}
                      tickLine={false}
                      axisLine={false}
                      width={56}
                    />
                    <Tooltip content={(props) => <TradeTooltip active={props.active} payload={props.payload as ReadonlyArray<{ payload: ChartPoint }>} />} cursor={{ fill: "#27272a60" }} />
                    <Bar dataKey="amount" radius={[2, 2, 0, 0]} maxBarSize={32}>
                      {visibleData.map((entry, i) => (
                        <Cell
                          key={`cell-${i}`}
                          fill={buyLabel(entry.side) ? "#34d39999" : "#fb718599"}
                          stroke={buyLabel(entry.side) ? "#34d399" : "#fb7185"}
                          strokeWidth={1}
                        />
                      ))}
                    </Bar>
                  </BarChart>
                ) : (
                  <LineChart data={visibleData} margin={{ top: 4, right: 4, left: 4, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#27272a" vertical={false} />
                    <XAxis
                      dataKey="time"
                      tick={{ fontSize: 9, fontFamily: "monospace", fill: "#52525b" }}
                      tickLine={false}
                      axisLine={false}
                      interval="preserveStartEnd"
                    />
                    <YAxis
                      tickFormatter={(val) => `$${fmtUsd(val, 0)}`}
                      tick={{ fontSize: 9, fontFamily: "monospace", fill: "#52525b" }}
                      tickLine={false}
                      axisLine={false}
                      width={56}
                    />
                    <Tooltip content={(props) => <TradeTooltip active={props.active} payload={props.payload as ReadonlyArray<{ payload: ChartPoint }>} />} />
                    <ReferenceLine y={0} stroke="#3f3f46" strokeDasharray="4 2" />
                    <Line
                      type="monotone"
                      dataKey="cumulative"
                      stroke="#a78bfa"
                      strokeWidth={2}
                      dot={false}
                      activeDot={{ r: 4, fill: "#a78bfa" }}
                    />
                    <Legend
                      content={() => (
                        <div className="text-[10px] font-mono text-violet-400 text-center mt-1">
                          Cumulative net USDC exposure (BUY − SELL)
                        </div>
                      )}
                    />
                  </LineChart>
                )}
              </ResponsiveContainer>
            </div>
            {!showAll && chartData.length > 30 && (
              <button
                onClick={() => setShowAll(true)}
                className="text-[10px] font-mono text-zinc-500 hover:text-emerald-400 transition-colors self-center"
              >
                Show all {chartData.length} trades →
              </button>
            )}
          </>
        )}
      </Panel>

      {/* ── Recent Trades Table ── */}
      {recentTrades.length > 0 && (
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
                  key={i}
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
      )}

      {/* ── Summary Stats ── */}
      {chartData.length > 0 && (
        <Panel className="shrink-0 border-zinc-800/60 bg-zinc-900/40 p-4 mb-2">
          <h3 className="text-xs font-mono font-semibold text-zinc-300 uppercase tracking-widest mb-3">
            Observed Stats
          </h3>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
            <Stat label="Total Trades" value={String(allTrades.length)} />
            <Stat
              label="Buy Count"
              value={String(chartData.filter((d) => buyLabel(d.side)).length)}
            />
            <Stat
              label="Sell Count"
              value={String(chartData.filter((d) => !buyLabel(d.side)).length)}
            />
            <Stat
              label="Avg Trade"
              value={`$${fmtUsd(
                chartData.reduce((acc, d) => acc + d.amount, 0) / (chartData.length || 1),
                0,
              )}`}
            />
            <Stat
              label="Largest"
              value={`$${fmtUsd(Math.max(...chartData.map((d) => d.amount)), 0)}`}
            />
            <Stat
              label="Net Exposure"
              value={`${totalPnlFromChart >= 0 ? "+" : ""}$${fmtUsd(Math.abs(totalPnlFromChart), 0)}`}
              highlight={totalPnlFromChart > 0}
            />
          </div>
        </Panel>
      )}
    </div>
  );
}
