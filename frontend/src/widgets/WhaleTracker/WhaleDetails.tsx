import { memo, useMemo, useEffect, useState, useCallback } from "react";
import type { WhaleRow, WhaleEventRow } from "./types";
import { buildChartData } from "./types";
import type { WhaleHistoryResponse } from "../../shared/api";
import { whaleApi } from "../../shared/api";
import { fmtUsd, fmtPnl, shortenAddress, pnlColor } from "../../shared/lib/format";
import { Panel, Stat, Badge } from "../../shared/ui";
import { ArrowLeft } from "lucide-react";
import { TradeChart } from "./TradeChart";
import { RecentTradesTable } from "./RecentTradesTable";
import { ObservedStats } from "./ObservedStats";

interface WhaleDetailsProps {
  address: string;
  whales: WhaleRow[];
  activity: WhaleEventRow[];
  onBack?: () => void;
}

/**
 * Whale detail view — memoized by address to prevent
 * re-renders from parent state changes (countdown, search, etc.)
 */
export default memo(
  function WhaleDetails({
    address,
    whales,
    activity,
    onBack,
  }: WhaleDetailsProps) {
    const [history, setHistory] = useState<WhaleEventRow[]>([]);
    const [histLoading, setHistLoading] = useState(true);
    const [histError, setHistError] = useState<string | null>(null);

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
        setHistError(
          e instanceof Error ? e.message : "Failed to load history",
        );
      } finally {
        setHistLoading(false);
      }
    }, [address]);

    useEffect(() => {
      loadHistory();
    }, [loadHistory]);

    // Merge live activity with historical, deduplicate
    const allTrades = useMemo(() => {
      const live = activity.filter((a) => a.address === address);
      const seen = new Set(
        live.map((t) => `${t.condition_id}|${t.timestamp}`),
      );
      const filtered = history.filter(
        (t) => !seen.has(`${t.condition_id}|${t.timestamp}`),
      );
      return [...live, ...filtered];
    }, [activity, history, address]);

    const chartData = useMemo(() => buildChartData(allTrades), [allTrades]);

    if (!whale) {
      return (
        <div className="flex flex-col items-center justify-center flex-1 min-h-0 text-zinc-500 font-mono text-sm gap-3">
          {onBack && (
            <button
              onClick={onBack}
              className="text-zinc-400 hover:text-zinc-200 p-2 mb-4"
            >
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
                  <span className="truncate">
                    {whale.display_name ?? shortenAddress(address)}
                  </span>
                  {whale.followed && <Badge color="violet">FOLLOWING</Badge>}
                  {whale.archived && <Badge color="zinc">ARCHIVED</Badge>}
                </h2>
                <p className="text-[10px] font-mono text-zinc-600 mt-1 truncate">
                  {address}
                </p>
              </div>
            </div>
            <div className="text-right shrink-0">
              <div className="text-[10px] font-mono text-zinc-500 uppercase tracking-widest mb-0.5">
                Total Profit
              </div>
              <div
                className={`text-2xl font-mono font-bold tabular-nums ${pnlColor(profit)}`}
              >
                {fmtPnl(profit, 0)}
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
            <Stat
              label="ROI"
              value={`${(whale.roi * 100).toFixed(1)}%`}
            />
            <Stat label="Volume" value={`$${fmtUsd(vol, 0)}`} />
            <Stat
              label="Markets"
              value={String(whale.markets_traded)}
            />
          </div>
        </Panel>

        {/* ── Trade Chart ── */}
        <TradeChart
          chartData={chartData}
          histLoading={histLoading}
          histError={histError}
          onRetry={loadHistory}
          totalTrades={allTrades.length}
        />

        {/* ── Recent Trades ── */}
        <RecentTradesTable trades={allTrades} />

        {/* ── Summary Stats ── */}
        <ObservedStats
          chartData={chartData}
          totalTrades={allTrades.length}
        />
      </div>
    );
  },
  // Custom comparator: only re-render when address changes or whales/activity refs change
  (prev, next) =>
    prev.address === next.address &&
    prev.whales === next.whales &&
    prev.activity === next.activity,
);
