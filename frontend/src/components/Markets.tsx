import { useState, useEffect, useCallback, useMemo } from "react";
import { api, type MarketInfo } from "../api";

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
  const diff = new Date(endTime).getTime() - Date.now();
  if (diff <= 0) return "ended";
  const totalMin = Math.floor(diff / 60_000);
  if (totalMin < 1) return "<1m";
  if (totalMin < 60) return `${totalMin}m`;
  const h = Math.floor(totalMin / 60);
  const m = totalMin % 60;
  if (h < 24) return `${h}h ${m}m`;
  const d = Math.floor(h / 24);
  return `${d}d ${h % 24}h`;
}

/* ── Filter Chip ── */

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
      className={`px-2.5 py-1 rounded-md text-[11px] font-medium transition-all duration-200 border ${
        active
          ? (color ??
            "bg-emerald-500/15 text-emerald-400 border-emerald-700/50")
          : "bg-zinc-800/60 text-zinc-500 border-zinc-700/50 hover:text-zinc-300 hover:border-zinc-600"
      }`}
    >
      {label}
    </button>
  );
}

/* ── Component ── */

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

  // Derive unique assets from actual market data — no hardcoded list
  const uniqueAssets = useMemo(() => {
    const set = new Set(markets.map((m) => m.asset));
    return ["All", ...Array.from(set).sort()];
  }, [markets]);

  // Build asset→color mapping dynamically from discovered assets
  const assetColorMap = useMemo(() => {
    const map: Record<string, string> = {};
    uniqueAssets.forEach((a, i) => {
      if (a !== "All") map[a] = assetColor(a, i - 1);
    });
    return map;
  }, [uniqueAssets]);

  // Reset filter if the selected asset is no longer in the list
  useEffect(() => {
    if (assetFilter !== "All" && !uniqueAssets.includes(assetFilter)) {
      setAssetFilter("All");
    }
  }, [uniqueAssets, assetFilter]);

  /* ── Filter + sort ── */
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
    <div className="space-y-4 animate-slide-up p-4">
      {/* Header + Filters */}
      <div className="bg-zinc-800 rounded-xl border border-zinc-700 p-4 card-glow">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-3">
            <h2 className="text-[11px] text-zinc-500 uppercase tracking-wider font-medium">
              Markets
            </h2>
            <span className="text-[11px] text-zinc-600 mono">
              {filtered.length} / {markets.length}
            </span>
          </div>
          <button
            onClick={handleRefresh}
            disabled={refreshing}
            className="text-[11px] px-2.5 py-1 rounded-md border border-zinc-700 text-zinc-400 hover:text-zinc-200 hover:border-zinc-500 disabled:opacity-40 disabled:cursor-not-allowed transition-all duration-200"
          >
            {refreshing ? "Fetching…" : "↻ Refresh"}
          </button>
        </div>

        {/* Asset chips */}
        <div className="flex flex-wrap gap-1.5 mb-2.5">
          {uniqueAssets.map((a) => (
            <Chip
              key={a}
              label={a === "All" ? "All Assets" : a}
              active={assetFilter === a}
              onClick={() => setAssetFilter(a)}
            />
          ))}
        </div>

        {/* Kind chips */}
        <div className="flex flex-wrap gap-1.5 mb-3">
          {KINDS.map((k) => (
            <Chip
              key={k}
              label={k === "All" ? "All Types" : k}
              active={kindFilter === k}
              onClick={() => setKindFilter(k)}
              color={
                kindFilter === k && k !== "All" ? KIND_BADGE[k] : undefined
              }
            />
          ))}
        </div>

        {/* Search */}
        <input
          type="text"
          placeholder="Search markets…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="w-full bg-zinc-800/60 border border-zinc-700/60 rounded-lg px-3 py-2 text-sm text-zinc-300 placeholder-zinc-600 outline-none focus:border-zinc-500 focus:ring-1 focus:ring-emerald-500/30 transition-all"
        />
      </div>

      {/* Content */}
      <div className="bg-zinc-800 rounded-xl border border-zinc-700 card-glow">
        {loading ? (
          <div className="p-4 space-y-2">
            {Array.from({ length: 5 }).map((_, i) => (
              <div key={i} className="h-10 rounded-lg shimmer" />
            ))}
          </div>
        ) : error ? (
          <div className="text-red-400 text-sm py-12 text-center">{error}</div>
        ) : filtered.length === 0 ? (
          <div className="text-zinc-600 text-sm py-12 text-center">
            No markets match filters
          </div>
        ) : (
          <div className="overflow-x-auto max-h-[540px] overflow-y-auto">
            <table className="w-full text-left">
              <thead className="sticky top-0 bg-zinc-800 z-10">
                <tr className="text-[11px] text-zinc-500 uppercase border-b border-zinc-700">
                  <th className="py-3 px-4">Asset</th>
                  <th className="py-3 px-4">Kind</th>
                  <th className="py-3 px-4">Question</th>
                  <th className="py-3 px-4">Strike</th>
                  <th className="py-3 px-4">Ends In</th>
                  <th className="py-3 px-4">Status</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((m) => (
                  <tr
                    key={m.condition_id}
                    className="border-b border-zinc-700/30 text-sm hover:bg-zinc-800/20 transition-colors"
                  >
                    <td
                      className={`py-3 px-4 font-medium ${assetColorMap[m.asset] ?? "text-zinc-300"}`}
                    >
                      {m.asset}
                    </td>
                    <td className="py-3 px-4">
                      <span
                        className={`px-2 py-0.5 rounded text-[10px] font-medium border ${
                          KIND_BADGE[m.kind] ??
                          "bg-zinc-800 text-zinc-400 border-zinc-700"
                        }`}
                      >
                        {m.kind}
                      </span>
                    </td>
                    <td className="py-3 px-4 text-zinc-300 max-w-[320px] truncate">
                      {m.question}
                    </td>
                    <td className="py-3 px-4 mono text-zinc-400">
                      {m.strike ?? "—"}
                    </td>
                    <td className="py-3 px-4 text-zinc-400 text-xs mono">
                      {formatEndsIn(m.end_time)}
                    </td>
                    <td className="py-3 px-4">
                      {m.active ? (
                        <span className="inline-flex items-center gap-1 text-emerald-400 text-[10px]">
                          <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse-dot" />
                          Active
                        </span>
                      ) : (
                        <span className="text-zinc-600 text-[10px]">
                          Inactive
                        </span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
