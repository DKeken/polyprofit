import { useState, useEffect, useCallback, useMemo } from "react";
import { api, type MarketInfo } from "../api";
import { Panel, Input } from "../shared/ui";
import { Search, RefreshCw } from "lucide-react";
import { formatDuration } from "../shared/lib/format";
import { formatDuration } from "../shared/lib/format";

/* ── Color palette — cycles for any number of assets ── */
const PALETTE = [
  "text-orange-400",
  "text-blue-400",
  "text-purple-400",
  "text-cyan-400",
  "text-pink-400",
  "text-emerald-400",
  "text-yellow-400",
  "text-rose-400",
  "text-indigo-400",
  "text-teal-400",
];

function assetColor(_asset: string, idx: number): string {
  return PALETTE[idx % PALETTE.length];
}

const KIND_BADGE: Record<string, string> = {
  UpDown: "bg-emerald-500/10 text-emerald-400 border-emerald-800/50",
  FiveMin: "bg-sky-500/10 text-sky-400 border-sky-800/50",
  Above: "bg-amber-500/10 text-amber-400 border-amber-800/50",
  Below: "bg-rose-500/10 text-rose-400 border-rose-800/50",
  Dip: "bg-violet-500/10 text-violet-400 border-violet-800/50",
  Reach: "bg-teal-500/10 text-teal-400 border-teal-800/50",
  Range: "bg-indigo-500/10 text-indigo-400 border-indigo-800/50",
};

const KINDS = [
  "All",
  "UpDown",
  "FiveMin",
  "Above",
  "Below",
  "Dip",
  "Reach",
  "Range",
] as const;

/* ── Helpers ── */
function formatEndsIn(endTime: string): string {
  const diff = Math.floor((new Date(endTime).getTime() - Date.now()) / 1000);
  if (diff <= 0) return "ended";
  return formatDuration(diff);
}

function Chip({
  label,
  active,
  onClick,
  color,
}: {
  label: string;
  active: boolean;
  onClick: () => void;
  color?: string;
}) {
  return (
    <button
      onClick={onClick}
      className={`px-2 py-1 rounded text-[10px] font-mono font-medium transition-colors border ${
        active
          ? color ?? "bg-emerald-500/15 text-emerald-400 border-emerald-700/50"
          : "bg-zinc-800/60 text-zinc-500 border-zinc-700/50 hover:text-zinc-300 hover:border-zinc-600"
      }`}
    >
      {label}
    </button>
  );
}

export default function Markets() {
  const [markets, setMarkets] = useState<MarketInfo[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [assetFilter, setAssetFilter] = useState("All");
  const [kindFilter, setKindFilter] = useState("All");
  const [search, setSearch] = useState("");

  const fetchMarkets = useCallback(async () => {
    try {
      const res = await api.getMarkets();
      setMarkets(res.markets);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to fetch markets");
    } finally {
      setLoading(false);
    }
  }, []);

  const handleRefresh = useCallback(async () => {
    setRefreshing(true);
    try {
      await api.refreshMarkets();
      await fetchMarkets();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Refresh failed");
    } finally {
      setRefreshing(false);
    }
  }, [fetchMarkets]);

  useEffect(() => {
    fetchMarkets();
    const id = setInterval(fetchMarkets, 30_000);
    return () => clearInterval(id);
  }, [fetchMarkets]);

  const uniqueAssets = useMemo(() => {
    const set = new Set(markets.map((m) => m.asset));
    return ["All", ...Array.from(set).sort()];
  }, [markets]);

  const assetColorMap = useMemo(() => {
    const map: Record<string, string> = {};
    uniqueAssets.forEach((a, i) => {
      if (a !== "All") map[a] = assetColor(a, i - 1);
    });
    return map;
  }, [uniqueAssets]);

  useEffect(() => {
    if (assetFilter !== "All" && !uniqueAssets.includes(assetFilter)) {
      setAssetFilter("All");
    }
  }, [uniqueAssets, assetFilter]);

  const filtered = markets
    .filter((m) => {
      if (assetFilter !== "All" && m.asset !== assetFilter) return false;
      if (kindFilter !== "All" && m.kind !== kindFilter) return false;
      if (search && !m.question.toLowerCase().includes(search.toLowerCase()))
        return false;
      return true;
    })
    .sort(
      (a, b) => new Date(a.end_time).getTime() - new Date(b.end_time).getTime(),
    );

  return (
    <div className="flex flex-col h-full min-h-0 gap-3 p-4">
      {/* Header */}
      <div className="flex items-center justify-between gap-3 shrink-0">
        <div className="flex-1 min-w-0">
          <h2 className="text-sm font-mono font-semibold text-zinc-200 uppercase tracking-widest">
            Markets
          </h2>
          <div className="text-[10px] font-mono text-zinc-500 mt-0.5">
            {filtered.length} active markets
          </div>
        </div>
        <div className="flex items-center gap-1.5 shrink-0">
          <button
            onClick={handleRefresh}
            disabled={refreshing || loading}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-emerald-700/50 bg-emerald-500/10 text-emerald-400 text-[10px] font-mono hover:bg-emerald-500/20 hover:border-emerald-600/60 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            title="Refresh markets"
          >
            <RefreshCw className={`w-3 h-3 ${refreshing ? "animate-spin" : ""}`} /> Refresh
          </button>
        </div>
      </div>

      {error && (
        <div className="text-[11px] font-mono text-red-400 bg-red-950/30 border border-red-900/40 rounded px-3 py-2 shrink-0">
          {error}
        </div>
      )}

      {/* Filters row */}
      <div className="flex flex-col gap-3 shrink-0 bg-zinc-900/60 border border-zinc-800/60 rounded-xl p-3">
        <div className="flex items-center gap-2">
          <Search className="w-4 h-4 text-zinc-500 flex-none" />
          <div className="flex-1">
            <Input
              placeholder="Search markets..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
        </div>
        
        <div className="flex flex-wrap items-center gap-4">
          <div className="flex items-center gap-2">
            <span className="text-[10px] font-mono text-zinc-600 uppercase">Asset:</span>
            <div className="flex flex-wrap gap-1.5">
              {uniqueAssets.map((a) => (
                <Chip
                  key={a}
                  label={a === "All" ? "All" : a}
                  active={assetFilter === a}
                  onClick={() => setAssetFilter(a)}
                />
              ))}
            </div>
          </div>

          <div className="flex items-center gap-2">
             <span className="text-[10px] font-mono text-zinc-600 uppercase">Kind:</span>
             <div className="flex flex-wrap gap-1.5">
              {KINDS.map((k) => (
                <Chip
                  key={k}
                  label={k === "All" ? "All" : k}
                  active={kindFilter === k}
                  onClick={() => setKindFilter(k)}
                  color={
                    kindFilter === k && k !== "All" ? KIND_BADGE[k] : undefined
                  }
                />
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* Content wrapper */}
      <Panel className="flex-1 min-h-0">
        {loading ? (
          <div className="p-4 space-y-2">
            {Array.from({ length: 10 }).map((_, i) => (
              <div key={i} className="h-8 rounded bg-zinc-800/50 animate-pulse" />
            ))}
          </div>
        ) : filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center p-8 text-center h-full">
             <Search className="w-8 h-8 text-zinc-700 mb-3" />
             <p className="text-[11px] font-mono text-zinc-500">No markets match the current filter.</p>
          </div>
        ) : (
          <div className="overflow-auto min-h-0 relative h-full">
            <table className="w-full text-left border-collapse">
              <thead className="sticky top-0 bg-zinc-800/90 backdrop-blur z-10">
                <tr className="text-[10px] font-mono text-zinc-500 uppercase tracking-widest border-b border-zinc-700/50">
                  <th className="py-2.5 px-4 font-normal">Asset</th>
                  <th className="py-2.5 px-4 font-normal">Kind</th>
                  <th className="py-2.5 px-4 font-normal">Question</th>
                  <th className="py-2.5 px-4 font-normal text-right">Strike</th>
                  <th className="py-2.5 px-4 font-normal text-right">Ends In</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-800/50">
                {filtered.map((m) => (
                  <tr
                    key={m.condition_id}
                    className="group hover:bg-zinc-800/30 transition-colors"
                  >
                    <td
                      className={`py-2 px-4 whitespace-nowrap text-[10px] font-mono font-medium ${assetColorMap[m.asset] ?? "text-zinc-300"}`}
                    >
                      {m.asset}
                    </td>
                    <td className="py-2 px-4 whitespace-nowrap">
                      <span
                        className={`px-1.5 py-0.5 rounded text-[9px] font-mono font-medium border ${
                          KIND_BADGE[m.kind] ??
                          "bg-zinc-800 flex-none text-zinc-400 border-zinc-700"
                        }`}
                      >
                        {m.kind}
                      </span>
                    </td>
                    <td className="py-2 px-4 text-[11px] font-sans text-zinc-300 max-w-sm truncate leading-snug group-hover:text-zinc-200 transition-colors">
                      {m.question}
                    </td>
                    <td className="py-2 px-4 text-[10px] font-mono text-zinc-400 text-right whitespace-nowrap">
                      {m.strike ?? "—"}
                    </td>
                    <td className="py-2 px-4 text-[10px] font-mono text-zinc-500 text-right whitespace-nowrap">
                      {formatEndsIn(m.end_time)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Panel>
    </div>
  );
}
