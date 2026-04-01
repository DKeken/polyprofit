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

const KIND_BG: Record<string, string> = {
  UpDown: "bg-emerald-500/5",
  FiveMin: "bg-sky-500/5",
  Above: "bg-amber-500/5",
  Below: "bg-rose-500/5",
  Dip: "bg-violet-500/5",
  Reach: "bg-teal-500/5",
  Range: "bg-indigo-500/5",
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
    <div className="bg-zinc-900 rounded-lg border border-zinc-800 p-4">
      {/* Header */}
      <div className="flex items-center justify-between mb-3">
        <h2 className="text-sm text-zinc-400 uppercase tracking-wider">
          Markets
        </h2>
        <div className="flex items-center gap-3">
          <span className="text-xs text-zinc-600">
            {filtered.length} / {markets.length} markets
          </span>
          <button
            onClick={handleRefresh}
            disabled={refreshing}
            className="text-xs px-2 py-1 rounded border border-zinc-700 text-zinc-400 hover:text-zinc-200 hover:border-zinc-500 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
          >
            {refreshing ? "Fetching…" : "↻ Refresh"}
          </button>
        </div>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-2 mb-3">
        <select
          value={assetFilter}
          onChange={(e) => setAssetFilter(e.target.value)}
          className="bg-zinc-800 border border-zinc-700 rounded px-2 py-1 text-xs text-zinc-300 outline-none focus:border-zinc-600"
        >
          {uniqueAssets.map((a) => (
            <option key={a} value={a}>
              {a === "All" ? "All Assets" : a}
            </option>
          ))}
        </select>

        <select
          value={kindFilter}
          onChange={(e) => setKindFilter(e.target.value)}
          className="bg-zinc-800 border border-zinc-700 rounded px-2 py-1 text-xs text-zinc-300 outline-none focus:border-zinc-600"
        >
          {KINDS.map((k) => (
            <option key={k} value={k}>
              {k === "All" ? "All Kinds" : k}
            </option>
          ))}
        </select>

        <input
          type="text"
          placeholder="Search question…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="bg-zinc-800 border border-zinc-700 rounded px-2 py-1 text-xs text-zinc-300 placeholder-zinc-600 outline-none focus:border-zinc-600 flex-1 min-w-[140px]"
        />
      </div>

      {/* Content */}
      {loading ? (
        <div className="text-zinc-600 text-sm py-8 text-center">
          Loading markets…
        </div>
      ) : error ? (
        <div className="text-red-400 text-sm py-8 text-center">{error}</div>
      ) : filtered.length === 0 ? (
        <div className="text-zinc-600 text-sm py-8 text-center">
          No markets match filters
        </div>
      ) : (
        <div className="overflow-x-auto max-h-[520px] overflow-y-auto">
          <table className="w-full text-left">
            <thead className="sticky top-0 bg-zinc-900">
              <tr className="text-xs text-zinc-500 uppercase border-b border-zinc-800">
                <th className="pb-2 pr-3">Asset</th>
                <th className="pb-2 pr-3">Kind</th>
                <th className="pb-2 pr-3">Question</th>
                <th className="pb-2 pr-3">Strike</th>
                <th className="pb-2 pr-3">Ends In</th>
                <th className="pb-2">Status</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((m) => (
                <tr
                  key={m.condition_id}
                  className={`border-b border-zinc-800/50 text-sm hover:bg-zinc-800/30 transition-colors ${KIND_BG[m.kind] ?? ""}`}
                >
                  <td
                    className={`py-2 pr-3 font-medium ${assetColorMap[m.asset] ?? "text-zinc-300"}`}
                  >
                    {m.asset}
                  </td>
                  <td className="py-2 pr-3 text-zinc-400">{m.kind}</td>
                  <td className="py-2 pr-3 text-zinc-300 max-w-[320px] truncate">
                    {m.question}
                  </td>
                  <td className="py-2 pr-3 mono text-zinc-400">
                    {m.strike ?? "—"}
                  </td>
                  <td className="py-2 pr-3 text-zinc-400 text-xs">
                    {formatEndsIn(m.end_time)}
                  </td>
                  <td className="py-2">
                    {m.active ? (
                      <span className="text-emerald-400 text-xs">Active</span>
                    ) : (
                      <span className="text-zinc-600 text-xs">Inactive</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
