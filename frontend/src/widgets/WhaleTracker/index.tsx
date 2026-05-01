import { useState, useMemo, useCallback } from "react";
import { useLocation } from "wouter";
import type { WhaleRow, WhaleEventRow, SortKey, SortDir, ViewFilter } from "./types";
import { useSplitResize } from "../../shared/hooks/useSplitResize";
import { useScanStatus, fmtCountdown } from "../../shared/hooks/useScanStatus";
import { Button, ResizeDivider, Spinner } from "../../shared/ui";
import { RegistryTab } from "./RegistryTab";
import { ActivityTab } from "./ActivityTab";
import { ScanSettingsModal } from "./ScanSettingsModal";
import WhaleDetails from "./WhaleDetails";
import { Zap, Settings2 } from "lucide-react";

// ── Props ─────────────────────────────────────────────────────────────────────

interface Props {
  selectedAddress?: string;
  whales: WhaleRow[];
  activity: WhaleEventRow[];
  loading: boolean;
  error: string | null;
  lastRefreshed: Date | null;
  onRefresh: () => void;
  onTrack: (address: string, displayName?: string) => Promise<void>;
  onUntrack: (address: string) => Promise<void>;
  onToggleFollow: (address: string) => Promise<void>;
  onLookup: (address: string) => Promise<WhaleRow>;
  onPoll: () => Promise<void>;
  onBulk: (addresses: string[], action: string) => Promise<void>;
}

// ── Root component ────────────────────────────────────────────────────────────

export default function WhaleTracker({
  selectedAddress,
  whales,
  activity,
  loading,
  error,
  lastRefreshed,
  onRefresh,
  onTrack,
  onUntrack,
  onToggleFollow,
  onLookup,
  onPoll,
  onBulk,
}: Props) {
  const [search, setSearch] = useState("");
  const [, setLocation] = useLocation();
  const [sortKey, setSortKey] = useState<SortKey>("profit");
  const [sortDir, setSortDir] = useState<SortDir>("desc");
  const [filterFollowed, setFilterFollowed] = useState(false);
  const [viewFilter, setViewFilter] = useState<ViewFilter>("active");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [mobileTab, setMobileTab] = useState<"registry" | "activity">(
    "registry",
  );
  const [showScanSettings, setShowScanSettings] = useState(false);
  const { leftPct, containerRef, onMouseDown } = useSplitResize("whale-split-pct", 45);
  const { scanStatus, countdown, scanning, rescan } = useScanStatus(onRefresh);

  // ── Sort / selection callbacks (stable refs) ──────────────────────────

  const setSortKeyFn = useCallback(
    (key: SortKey) => {
      if (key === sortKey) {
        setSortDir((d) => (d === "desc" ? "asc" : "desc"));
      } else {
        setSortKey(key);
        setSortDir("desc");
      }
    },
    [sortKey],
  );

  const flipSortDir = useCallback(() => {
    setSortDir((d) => (d === "desc" ? "asc" : "desc"));
  }, []);

  const toggleSelect = useCallback((addr: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(addr)) next.delete(addr);
      else next.add(addr);
      return next;
    });
  }, []);

  const toggleSelectAll = useCallback((all: WhaleRow[]) => {
    setSelected((prev) => {
      if (all.length === 0) return new Set();
      if (prev.size === all.length) return new Set();
      return new Set(all.map((w) => w.address));
    });
  }, []);

  // ── Filtered + sorted whale list ──────────────────────────────────────

  const filtered = useMemo(() => {
    let list = [...whales];

    if (viewFilter === "active") list = list.filter((w) => !w.archived);
    else if (viewFilter === "archived")
      list = list.filter((w) => w.archived);

    if (filterFollowed) list = list.filter((w) => w.followed);
    if (search.trim()) {
      const q = search.trim().toLowerCase();
      list = list.filter(
        (w) =>
          w.address.toLowerCase().includes(q) ||
          (w.display_name ?? "").toLowerCase().includes(q),
      );
    }
    list.sort((a, b) => {
      let av: number, bv: number;
      switch (sortKey) {
        case "profit":
          av = parseFloat(a.profit) || 0;
          bv = parseFloat(b.profit) || 0;
          break;
        case "roi":
          av = a.roi;
          bv = b.roi;
          break;
        case "win_rate":
          av = a.win_rate;
          bv = b.win_rate;
          break;
        case "volume":
          av = parseFloat(a.volume) || 0;
          bv = parseFloat(b.volume) || 0;
          break;
        case "markets_traded":
          av = a.markets_traded;
          bv = b.markets_traded;
          break;
        case "last_seen":
          av = new Date(a.last_seen).getTime();
          bv = new Date(b.last_seen).getTime();
          break;
        default:
          av = 0;
          bv = 0;
      }
      return sortDir === "desc" ? bv - av : av - bv;
    });
    // Pin followed whales to top
    const followed = list.filter((w) => w.followed);
    const rest = list.filter((w) => !w.followed);
    return [...followed, ...rest];
  }, [whales, search, sortKey, sortDir, filterFollowed, viewFilter]);

  const archivedCount = useMemo(
    () => whales.filter((w) => w.archived).length,
    [whales],
  );
  const activeCount = useMemo(
    () => whales.filter((w) => !w.archived).length,
    [whales],
  );

  // ── Registry props (memoized to prevent new object each render) ───────

  const registryProps = useMemo(
    () => ({
      whales: filtered,
      allCount: activeCount,
      archivedCount,
      search,
      onSearch: setSearch,
      sortKey,
      sortDir,
      onSort: setSortKeyFn,
      onFlipDir: flipSortDir,
      filterFollowed,
      onFilterFollowed: setFilterFollowed,
      viewFilter,
      onViewFilter: setViewFilter,
      onTrack,
      onUntrack,
      onToggleFollow,
      onLookup,
      onPoll,
      onBulk,
      selected,
      onToggleSelect: toggleSelect,
      onToggleSelectAll: toggleSelectAll,
    }),
    [
      filtered,
      activeCount,
      archivedCount,
      search,
      sortKey,
      sortDir,
      setSortKeyFn,
      flipSortDir,
      filterFollowed,
      viewFilter,
      onTrack,
      onUntrack,
      onToggleFollow,
      onLookup,
      onPoll,
      onBulk,
      selected,
      toggleSelect,
      toggleSelectAll,
    ],
  );

  // ── Render ────────────────────────────────────────────────────────────

  return (
    <div className="flex flex-col h-full min-h-0 gap-3 p-4">
      {/* Header */}
      <div className="flex items-center justify-between gap-3 shrink-0">
        <div className="flex-1 min-w-0">
          <h2 className="text-sm font-mono font-semibold text-zinc-200 uppercase tracking-widest">
            Whale Registry
          </h2>
          <div className="flex items-center gap-2 mt-0.5 flex-wrap">
            {lastRefreshed && (
              <span className="text-[10px] font-mono text-zinc-600">
                Updated {lastRefreshed.toLocaleTimeString()} ·{" "}
                <span className="text-zinc-500">{activeCount} active</span>
                {archivedCount > 0 && (
                  <span className="text-zinc-600">
                    {" "}
                    · {archivedCount} archived
                  </span>
                )}
              </span>
            )}
            {scanStatus && (
              <span className="text-[10px] font-mono text-zinc-600">
                ·{" "}
                {scanStatus.last_scan > 0 ? (
                  <span className="text-zinc-500">
                    last scan{" "}
                    {new Date(
                      scanStatus.last_scan * 1000,
                    ).toLocaleTimeString([], {
                      hour: "2-digit",
                      minute: "2-digit",
                    })}
                  </span>
                ) : (
                  <span className="text-zinc-700">never scanned</span>
                )}
                {countdown !== null && countdown > 0 && (
                  <span className="text-zinc-700">
                    {" "}
                    · next in{" "}
                    <span className="tabular-nums">
                      {fmtCountdown(countdown)}
                    </span>
                  </span>
                )}
              </span>
            )}
          </div>
        </div>
        <div className="flex items-center gap-1.5 shrink-0">
          <button
            onClick={() => setShowScanSettings(true)}
            className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border border-zinc-700/60 bg-zinc-800/80 text-zinc-400 text-[10px] font-mono hover:text-zinc-200 hover:border-zinc-500 hover:bg-zinc-700/60 transition-all"
            title="Scan settings"
          >
            <Settings2 className="w-3.5 h-3.5" />
          </button>
          <button
            onClick={rescan}
            disabled={scanning || loading}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-emerald-700/50 bg-emerald-500/10 text-emerald-400 text-[10px] font-mono hover:bg-emerald-500/20 hover:border-emerald-600/60 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            title="Run an immediate whale scan"
          >
            {scanning ? (
              <>
                <Spinner size="xs" label="Scanning whales" />
                Scanning…
              </>
            ) : (
              <>
                <Zap className="w-3 h-3" /> Rescan
              </>
            )}
          </button>
          <Button onClick={onRefresh} disabled={loading} size="sm">
            {loading ? "…" : "Refresh"}
          </Button>
        </div>
      </div>

      {/* Scan settings modal */}
      {showScanSettings && (
        <ScanSettingsModal onClose={() => setShowScanSettings(false)} />
      )}

      {error && (
        <div className="text-[11px] font-mono text-red-400 bg-red-950/30 border border-red-900/40 rounded px-3 py-2 shrink-0">
          {error}
        </div>
      )}

      {/* ── Mobile tab bar (hidden on md+) ── */}
      <div className="flex gap-1 shrink-0 md:hidden">
        {(["registry", "activity"] as const).map((tab) => (
          <button
            key={tab}
            onClick={() => setMobileTab(tab)}
            className={`flex-1 py-1.5 rounded text-[10px] font-mono uppercase tracking-widest border transition-colors ${
              mobileTab === tab
                ? "bg-emerald-500/15 text-emerald-400 border-emerald-700/40"
                : "bg-transparent text-zinc-500 border-zinc-700 hover:text-zinc-300"
            }`}
          >
            {tab === "registry"
              ? `Whales (${activeCount})`
              : `Activity (${activity.length})`}
          </button>
        ))}
      </div>

      {/* ── Mobile: single pane ── */}
      <div className="flex flex-col flex-1 min-h-0 md:hidden">
        {mobileTab === "registry" ? (
          <RegistryTab {...registryProps} mobile />
        ) : selectedAddress ? (
          <WhaleDetails
            address={selectedAddress}
            activity={activity}
            whales={whales}
            onBack={() => setLocation("/whales")}
          />
        ) : (
          <ActivityTab events={activity} />
        )}
      </div>

      {/* ── Desktop: resizable split ── */}
      <div
        ref={containerRef}
        className="hidden md:flex flex-1 min-h-0 gap-0"
      >
        {/* Left — registry */}
        <div
          className="flex flex-col min-h-0 min-w-0"
          style={{ width: `${leftPct}%` }}
        >
          <RegistryTab {...registryProps} />
        </div>

        {/* Divider */}
        <ResizeDivider onMouseDown={onMouseDown} />

        {/* Right — details or activity */}
        <div className="flex flex-col min-h-0 min-w-0 flex-1 overflow-hidden">
          {selectedAddress ? (
            <WhaleDetails
              address={selectedAddress}
              activity={activity}
              whales={whales}
              onBack={() => setLocation("/whales")}
            />
          ) : (
            <ActivityTab events={activity} />
          )}
        </div>
      </div>
    </div>
  );
}
