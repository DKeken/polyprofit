import { useState, useMemo, useRef, useEffect, useCallback } from "react";
import { useLocation } from "wouter";
import type { WhaleRow, WhaleEventRow } from "../../shared/hooks/useWhales";
import { useScanStatus, fmtCountdown } from "../../shared/hooks/useScanStatus";
import { fmtUsd, shortenAddress, pnlColor } from "../../shared/lib/format";
import {
  Panel,
  EmptyState,
  Stat,
  Button,
  Badge,
  Input,
  Select,
} from "../../shared/ui";
import WhaleDetails from "./WhaleDetails";
import {
  ArrowDown,
  ArrowUp,
  Star,
  StarOff,
  Archive,
  RotateCcw,
  Trash2,
  X,
  Zap,
  Search,
  Settings2,
} from "lucide-react";

// ── Types ─────────────────────────────────────────────────────────────────────

type SortKey =
  | "profit"
  | "roi"
  | "win_rate"
  | "volume"
  | "markets_traded"
  | "last_seen";
type SortDir = "desc" | "asc";
type ViewFilter = "active" | "archived" | "all";

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

// ── Resizable split hook ──────────────────────────────────────────────────────

const STORAGE_KEY = "whale-split-pct";
const MIN_PCT = 25;
const MAX_PCT = 75;

function useSplitResize(defaultPct = 45) {
  const stored = parseFloat(localStorage.getItem(STORAGE_KEY) ?? "");
  const [leftPct, setLeftPct] = useState(
    Number.isFinite(stored) ? stored : defaultPct,
  );
  const containerRef = useRef<HTMLDivElement>(null);
  const dragging = useRef(false);

  const onMouseDown = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    dragging.current = true;
    document.body.style.cursor = "col-resize";
    document.body.style.userSelect = "none";
  }, []);

  useEffect(() => {
    function onMove(e: MouseEvent) {
      if (!dragging.current || !containerRef.current) return;
      const rect = containerRef.current.getBoundingClientRect();
      const pct = Math.min(
        MAX_PCT,
        Math.max(MIN_PCT, ((e.clientX - rect.left) / rect.width) * 100),
      );
      setLeftPct(pct);
      localStorage.setItem(STORAGE_KEY, String(pct));
    }
    function onUp() {
      dragging.current = false;
      document.body.style.cursor = "";
      document.body.style.userSelect = "";
    }
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
    return () => {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
    };
  }, []);

  return { leftPct, containerRef, onMouseDown };
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
  const { leftPct, containerRef, onMouseDown } = useSplitResize();
  const { scanStatus, countdown, scanning, rescan } = useScanStatus(onRefresh);

  function setSortKeyFn(key: SortKey) {
    if (key === sortKey) {
      setSortDir((d) => (d === "desc" ? "asc" : "desc"));
    } else {
      setSortKey(key);
      setSortDir("desc");
    }
  }

  function flipSortDir() {
    setSortDir((d) => (d === "desc" ? "asc" : "desc"));
  }

  function toggleSelect(addr: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(addr)) next.delete(addr);
      else next.add(addr);
      return next;
    });
  }

  function toggleSelectAll(all: WhaleRow[]) {
    if (selected.size === all.length) {
      setSelected(new Set());
    } else {
      setSelected(new Set(all.map((w) => w.address)));
    }
  }

  const filtered = useMemo(() => {
    let list = [...whales];

    // View filter
    if (viewFilter === "active") list = list.filter((w) => !w.archived);
    else if (viewFilter === "archived") list = list.filter((w) => w.archived);

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
    // Pin followed whales to top while preserving sort within each group
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

  const registryProps = {
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
  };

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
                  <span className="text-zinc-600"> · {archivedCount} archived</span>
                )}
              </span>
            )}
            {/* Scan status indicator */}
            {scanStatus && (
              <span className="text-[10px] font-mono text-zinc-600">
                ·{" "}
                {scanStatus.last_scan > 0 ? (
                  <span className="text-zinc-500">
                    last scan{" "}
                    {new Date(scanStatus.last_scan * 1000).toLocaleTimeString(
                      [],
                      { hour: "2-digit", minute: "2-digit" },
                    )}
                  </span>
                ) : (
                  <span className="text-zinc-700">never scanned</span>
                )}
                {countdown !== null && countdown > 0 && (
                  <span className="text-zinc-700">
                    {" "}· next in{" "}
                    <span className="tabular-nums">{fmtCountdown(countdown)}</span>
                  </span>
                )}
              </span>
            )}
          </div>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          {/* Rescan button */}
          <button
            onClick={rescan}
            disabled={scanning || loading}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-emerald-700/50 bg-emerald-500/10 text-emerald-400 text-[10px] font-mono hover:bg-emerald-500/20 hover:border-emerald-600/60 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            title="Run an immediate whale scan"
          >
            {scanning ? (
              <>
                <span className="inline-block w-2.5 h-2.5 border-2 border-emerald-400/40 border-t-emerald-400 rounded-full animate-spin" />
                Scanning…
              </>
            ) : (
              <><Zap className="w-3 h-3" /> Rescan</>
            )}
          </button>
          <Button onClick={onRefresh} disabled={loading} size="sm">
            {loading ? "…" : "Refresh"}
          </Button>
        </div>
      </div>

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
      <div ref={containerRef} className="hidden md:flex flex-1 min-h-0 gap-0">
        {/* Left — registry */}
        <div
          className="flex flex-col min-h-0 min-w-0"
          style={{ width: `${leftPct}%` }}
        >
          <RegistryTab {...registryProps} />
        </div>

        {/* Divider */}
        <div
          onMouseDown={onMouseDown}
          className="w-1.5 shrink-0 mx-1 rounded-full bg-zinc-800 hover:bg-emerald-600/50 cursor-col-resize transition-colors active:bg-emerald-500/70"
        />

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

// ── Scan Settings Modal ───────────────────────────────────────────────────────

function ScanSettingsModal({ onClose }: { onClose: () => void }) {
  const [interval, setInterval] = useState("300");
  const [minTrade, setMinTrade] = useState("500");
  const [minWinRate, setMinWinRate] = useState("55");
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  // Load current settings
  useEffect(() => {
    fetch("/api/config")
      .then((r) => r.json())
      .then((cfg: Record<string, unknown>) => {
        if (cfg.whale_poll_interval_secs) setInterval(String(cfg.whale_poll_interval_secs));
        if (cfg.min_whale_trade_usd) setMinTrade(String(cfg.min_whale_trade_usd));
        if (cfg.min_whale_win_rate) setMinWinRate(String(Math.round(Number(cfg.min_whale_win_rate) * 100)));
      })
      .catch(() => {});
  }, []);

  async function handleSave() {
    setSaving(true);
    try {
      await fetch("/api/config", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          whale_poll_interval_secs: Number(interval),
          min_whale_trade_usd: minTrade,
          min_whale_win_rate: Number(minWinRate) / 100,
        }),
      });
      setSaved(true);
      setTimeout(() => onClose(), 800);
    } catch {
      // silently fail
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm" onClick={onClose}>
      <div
        className="bg-zinc-800 border border-zinc-700/60 rounded-xl shadow-2xl w-full max-w-sm p-5 animate-fade-in"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-sm font-mono font-semibold text-zinc-200">Scan Settings</h3>
          <button onClick={onClose} className="text-zinc-500 hover:text-zinc-300 transition-colors">
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="flex flex-col gap-3">
          <label className="flex flex-col gap-1">
            <span className="text-[10px] font-mono text-zinc-500 uppercase tracking-wider">Poll interval (seconds)</span>
            <Input value={interval} onChange={(e) => setInterval(e.target.value)} />
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-[10px] font-mono text-zinc-500 uppercase tracking-wider">Min trade size (USD)</span>
            <Input value={minTrade} onChange={(e) => setMinTrade(e.target.value)} />
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-[10px] font-mono text-zinc-500 uppercase tracking-wider">Min win rate (%)</span>
            <Input value={minWinRate} onChange={(e) => setMinWinRate(e.target.value)} />
          </label>
        </div>

        <div className="flex items-center justify-end gap-2 mt-5">
          {saved && <span className="text-[10px] font-mono text-emerald-400">Saved!</span>}
          <Button size="sm" variant="ghost" onClick={onClose}>Cancel</Button>
          <Button size="sm" variant="primary" disabled={saving} onClick={handleSave}>
            {saving ? "Saving..." : "Save"}
          </Button>
        </div>
      </div>
    </div>
  );
}

// ── Registry tab ──────────────────────────────────────────────────────────────

interface RegistryTabProps {
  whales: WhaleRow[];
  allCount: number;
  archivedCount: number;
  search: string;
  onSearch: (v: string) => void;
  sortKey: SortKey;
  sortDir: SortDir;
  onSort: (k: SortKey) => void;
  onFlipDir: () => void;
  filterFollowed: boolean;
  onFilterFollowed: (v: boolean) => void;
  viewFilter: ViewFilter;
  onViewFilter: (v: ViewFilter) => void;
  onTrack: (address: string, displayName?: string) => Promise<void>;
  onUntrack: (address: string) => Promise<void>;
  onToggleFollow: (address: string) => Promise<void>;
  onLookup: (address: string) => Promise<WhaleRow>;
  onPoll: () => Promise<void>;
  onBulk: (addresses: string[], action: string) => Promise<void>;
  selected: Set<string>;
  onToggleSelect: (addr: string) => void;
  onToggleSelectAll: (all: WhaleRow[]) => void;
  mobile?: boolean;
}

function RegistryTab({
  whales,
  allCount,
  archivedCount,
  search,
  onSearch,
  sortKey,
  sortDir,
  onSort,
  onFlipDir,
  filterFollowed,
  onFilterFollowed,
  viewFilter,
  onViewFilter,
  onTrack,
  onUntrack,
  onToggleFollow,
  onLookup,
  onPoll,
  onBulk,
  selected,
  onToggleSelect,
  onToggleSelectAll,
  mobile = false,
}: RegistryTabProps) {
  const [, setLocation] = useLocation();
  const [bulkBusy, setBulkBusy] = useState(false);
  const [showScanSettings, setShowScanSettings] = useState(false);


  // Stats for followed whales
  const followedStats = useMemo(() => {
    const followed = whales.filter((w) => w.followed);
    if (followed.length === 0) return null;
    const totalPnl = followed.reduce((s, w) => s + (parseFloat(w.profit) || 0), 0);
    const avgWin = followed.reduce((s, w) => s + w.win_rate, 0) / followed.length;
    return { count: followed.length, totalPnl, avgWin };
  }, [whales]);

  const selectedArr = useMemo(() => Array.from(selected), [selected]);
  const allSelected =
    whales.length > 0 && whales.every((w) => selected.has(w.address));

  async function handleBulk(action: string) {
    if (selectedArr.length === 0) return;
    setBulkBusy(true);
    try {
      await onBulk(selectedArr, action);
    } finally {
      setBulkBusy(false);
    }
  }

  return (
    <div className="flex flex-col flex-1 min-h-0 gap-2 relative">
      {/* Followed-whale stats bar */}
      {followedStats && (
        <div className="flex items-center gap-3 px-2 py-1.5 bg-violet-500/5 border border-violet-600/20 rounded-lg shrink-0">
          <span className="text-[9px] font-mono text-violet-400 uppercase tracking-wider">Following {followedStats.count}</span>
          <span className="h-3 w-px bg-violet-800/40" />
          <span className={`text-[10px] font-mono tabular-nums ${followedStats.totalPnl >= 0 ? "text-emerald-400" : "text-red-400"}`}>
            Σ {followedStats.totalPnl >= 0 ? "+" : ""}${fmtUsd(followedStats.totalPnl, 0)}
          </span>
          <span className="text-[9px] font-mono text-zinc-500">
            avg win {(followedStats.avgWin * 100).toFixed(0)}%
          </span>
        </div>
      )}
      {/* View filter tabs */}
      <div className="flex gap-0.5 shrink-0 bg-zinc-900/60 border border-zinc-800/60 rounded-lg p-0.5">
        {(
          [
            { key: "active" as ViewFilter, label: `Active (${allCount})` },
            { key: "archived" as ViewFilter, label: `Archived (${archivedCount})` },
            { key: "all" as ViewFilter, label: "All" },
          ] as { key: ViewFilter; label: string }[]
        ).map(({ key, label }) => (
          <button
            key={key}
            onClick={() => onViewFilter(key)}
            className={`flex-1 py-1.5 rounded-md text-[10px] font-mono uppercase tracking-wide transition-all ${
              viewFilter === key
                ? "bg-zinc-700/80 text-zinc-100 shadow-sm"
                : "text-zinc-500 hover:text-zinc-300"
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {/* Controls row */}
      <div className="flex flex-wrap items-center gap-2 shrink-0">
        <div className="flex-1 min-w-[140px]">
          <Input
            placeholder="Search address or name…"
            value={search}
            onChange={(e) => onSearch(e.target.value)}
          />
        </div>
        <div className="w-32">
          <Select
            value={sortKey}
            onChange={(e) => onSort(e.target.value as SortKey)}
          >
            <option value="profit">Profit</option>
            <option value="roi">ROI</option>
            <option value="win_rate">Win Rate</option>
            <option value="volume">Volume</option>
            <option value="markets_traded">Markets</option>
            <option value="last_seen">Last Seen</option>
          </Select>
        </div>
        <button
          onClick={onFlipDir}
          className="px-2 py-1.5 rounded border border-zinc-700 bg-zinc-800 text-zinc-400 text-[11px] font-mono hover:text-zinc-200 hover:border-zinc-500 transition-colors"
          title={sortDir === "desc" ? "Descending — click to reverse" : "Ascending — click to reverse"}
        >
          {sortDir === "desc" ? <ArrowDown className="w-3.5 h-3.5" /> : <ArrowUp className="w-3.5 h-3.5" />}
        </button>
        <button
          onClick={() => onFilterFollowed(!filterFollowed)}
          className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded border text-[10px] font-mono transition-colors ${
            filterFollowed
              ? "bg-violet-500/15 text-violet-400 border-violet-700/40"
              : "bg-zinc-800 text-zinc-500 border-zinc-700 hover:text-zinc-300"
          }`}
        >
          <Star className="w-3 h-3" /> Following
        </button>
        <button
          onClick={() => setShowScanSettings(true)}
          className="p-1.5 rounded border border-zinc-700 bg-zinc-800 text-zinc-500 hover:text-zinc-200 hover:border-zinc-500 transition-colors"
          title="Scan settings"
        >
          <Settings2 className="w-3.5 h-3.5" />
        </button>
      </div>

      {/* Scan settings modal */}
      {showScanSettings && (
        <ScanSettingsModal onClose={() => setShowScanSettings(false)} />
      )}

      {/* Add-whale inline form */}
      <AddWhaleRow onTrack={onTrack} onLookup={onLookup} />

      {/* Whale list */}
      <Panel className="flex-1 min-h-0 pb-0">
        {/* Select all row */}
        {whales.length > 0 && (
          <div className="flex items-center gap-2 px-2 py-1.5 border-b border-zinc-800/50 shrink-0">
            <input
              type="checkbox"
              className="accent-emerald-500 cursor-pointer"
              checked={allSelected}
              onChange={() => onToggleSelectAll(whales)}
              title="Select all"
            />
            <span className="text-[10px] font-mono text-zinc-600">
              {selected.size > 0
                ? `${selected.size} of ${whales.length} selected`
                : `${whales.length} whale${whales.length !== 1 ? "s" : ""}`}
            </span>
          </div>
        )}

        {whales.length === 0 ? (
          allCount === 0 && archivedCount === 0 ? (
            <PollEmptyState onPoll={onPoll} />
          ) : (
            <EmptyState msg="No whales match the current filter." />
          )
        ) : (
          <div className="divide-y divide-zinc-800/50 overflow-y-auto">
            {whales.map((w) => (
              <WhaleRowItem
                key={w.address}
                whale={w}
                onUntrack={onUntrack}
                onToggleFollow={onToggleFollow}
                onNavigate={() => setLocation(`/whales/${w.address}`)}
                alwaysShowActions={mobile}
                selected={selected.has(w.address)}
                onToggleSelect={() => onToggleSelect(w.address)}
              />
            ))}
          </div>
        )}
      </Panel>

      {/* ── Bulk Actions Bar (floating) ── */}
      {selected.size > 0 && (
        <BulkActionsBar
          count={selected.size}
          busy={bulkBusy}
          viewFilter={viewFilter}
          onAction={handleBulk}
          onClear={() => {
            // deselect all – done by emptying via parent but triggered functionally
            onToggleSelectAll([]);
          }}
        />
      )}
    </div>
  );
}

// ── Bulk Actions Bar ──────────────────────────────────────────────────────────

function BulkActionsBar({
  count,
  busy,
  viewFilter,
  onAction,
  onClear,
}: {
  count: number;
  busy: boolean;
  viewFilter: ViewFilter;
  onAction: (action: string) => void;
  onClear: () => void;
}) {
  return (
    <div className="absolute bottom-3 left-3 right-3 z-10 bg-zinc-900/95 border border-emerald-700/40 backdrop-blur-sm rounded-xl px-4 py-3 flex items-center gap-3 shadow-2xl shadow-black/40">
      <div className="text-[11px] font-mono text-zinc-300 shrink-0">
        <span className="text-emerald-400 font-bold">{count}</span> selected
      </div>
      <div className="h-4 w-px bg-zinc-700 shrink-0" />
      <div className="flex items-center gap-2 flex-wrap flex-1">
        {viewFilter !== "archived" && (
          <button
            disabled={busy}
            onClick={() => onAction("archive")}
            className="px-3 py-1.5 rounded-lg text-[10px] font-mono border border-zinc-700 text-zinc-400 hover:text-amber-400 hover:border-amber-700/50 hover:bg-amber-950/30 transition-colors disabled:opacity-40"
          >
            <Archive className="w-3 h-3" /> Archive
          </button>
        )}
        {viewFilter === "archived" && (
          <button
            disabled={busy}
            onClick={() => onAction("unarchive")}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[10px] font-mono border border-zinc-700 text-zinc-400 hover:text-emerald-400 hover:border-emerald-700/50 hover:bg-emerald-950/30 transition-colors disabled:opacity-40"
          >
            <RotateCcw className="w-3 h-3" /> Restore
          </button>
        )}
        <button
          disabled={busy}
          onClick={() => onAction("follow")}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[10px] font-mono border border-zinc-700 text-zinc-400 hover:text-emerald-400 hover:border-emerald-700/50 hover:bg-emerald-950/30 transition-colors disabled:opacity-40"
        >
          <Star className="w-3 h-3" /> Follow all
        </button>
        <button
          disabled={busy}
          onClick={() => onAction("unfollow")}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[10px] font-mono border border-zinc-700 text-zinc-400 hover:text-zinc-200 transition-colors disabled:opacity-40"
        >
          <StarOff className="w-3 h-3" /> Unfollow
        </button>
        <button
          disabled={busy}
          onClick={() => onAction("delete")}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[10px] font-mono border border-zinc-700 text-zinc-500 hover:text-red-400 hover:border-red-900/50 hover:bg-red-950/20 transition-colors disabled:opacity-40 ml-auto"
        >
          <Trash2 className="w-3 h-3" /> Delete
        </button>
      </div>
      <button
        onClick={onClear}
        className="text-zinc-600 hover:text-zinc-300 transition-colors shrink-0 p-1"
        title="Clear selection"
      >
        <X className="w-3.5 h-3.5" />
      </button>
    </div>
  );
}

// ── Poll empty state ─────────────────────────────────────────────────────────

function PollEmptyState({ onPoll }: { onPoll: () => Promise<void> }) {
  const [polling, setPolling] = useState(false);
  const [done, setDone] = useState(false);

  async function handlePoll() {
    setPolling(true);
    try {
      await onPoll();
      setDone(true);
    } finally {
      setPolling(false);
    }
  }

  return (
    <div className="flex flex-col items-center justify-center h-full gap-3 px-6 py-8 text-center">
      <Search className="w-8 h-8 text-zinc-600" />
      <p className="text-[11px] font-mono text-zinc-500 leading-relaxed">
        No whales tracked yet — next auto-poll in ~5 min,
        <br />
        or scan Polymarket right now.
      </p>
      {done && (
        <p className="text-[10px] font-mono text-emerald-500">
          Scan complete — check the list!
        </p>
      )}
      <button
        onClick={handlePoll}
        disabled={polling}
        className="flex items-center gap-2 px-4 py-2 rounded-lg border border-emerald-700/50 bg-emerald-500/10 text-emerald-400 text-[11px] font-mono hover:bg-emerald-500/20 hover:border-emerald-600/60 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
      >
        {polling ? (
          <>
            <span className="inline-block w-3 h-3 border-2 border-emerald-400/40 border-t-emerald-400 rounded-full animate-spin" />
            Scanning…
          </>
        ) : (
          <><Zap className="w-3.5 h-3.5" /> Scan now</>
        )}
      </button>
    </div>
  );
}

// ── Add-whale inline form ─────────────────────────────────────────────────────

function AddWhaleRow({
  onTrack,
  onLookup,
}: {
  onTrack: (address: string, displayName?: string) => Promise<void>;
  onLookup: (address: string) => Promise<WhaleRow>;
}) {
  const [open, setOpen] = useState(false);
  const [addr, setAddr] = useState("");
  const [label, setLabel] = useState("");
  const [preview, setPreview] = useState<WhaleRow | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const addrRef = useRef<HTMLInputElement>(null);

  async function handleLookup() {
    const a = addr.trim();
    if (!a) return;
    setBusy(true);
    setErr(null);
    setPreview(null);
    try {
      const w = await onLookup(a);
      setPreview(w);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Lookup failed");
    } finally {
      setBusy(false);
    }
  }

  async function handleTrack() {
    const a = addr.trim();
    if (!a) return;
    setBusy(true);
    setErr(null);
    try {
      await onTrack(a, label.trim() || undefined);
      setAddr("");
      setLabel("");
      setPreview(null);
      setOpen(false);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Track failed");
    } finally {
      setBusy(false);
    }
  }

  if (!open) {
    return (
      <button
        onClick={() => {
          setOpen(true);
          setTimeout(() => addrRef.current?.focus(), 50);
        }}
        className="w-full flex items-center gap-2 px-3 py-2 rounded border border-dashed border-zinc-700 text-zinc-500 text-[10px] font-mono hover:border-emerald-700/60 hover:text-emerald-400 transition-colors shrink-0"
      >
        <span className="text-base leading-none">+</span>
        Add whale manually
      </button>
    );
  }

  return (
    <div className="bg-zinc-800/60 border border-zinc-700/60 rounded-xl p-3 flex flex-col gap-2 shrink-0">
      <p className="text-[10px] font-mono uppercase tracking-widest text-zinc-500">
        Add Whale
      </p>
      <div className="flex gap-2">
        <Input
          ref={addrRef}
          placeholder="0x… wallet address"
          value={addr}
          onChange={(e) => {
            setAddr(e.target.value);
            setPreview(null);
          }}
          className="flex-1"
        />
        <Button
          size="sm"
          disabled={busy || !addr.trim()}
          onClick={handleLookup}
        >
          {busy ? "…" : "Lookup"}
        </Button>
      </div>
      <Input
        placeholder="Label (optional)"
        value={label}
        onChange={(e) => setLabel(e.target.value)}
      />

      {err && <p className="text-[10px] font-mono text-red-400">{err}</p>}

      {preview && (
        <div className="bg-zinc-800/60 border border-zinc-700/40 rounded-lg p-2 flex items-start justify-between gap-2">
          <div>
            <p className="text-[11px] font-mono text-zinc-200">
              {preview.display_name ?? shortenAddress(preview.address)}
            </p>
            <p className="text-[9px] font-mono text-zinc-600 mt-0.5">
              {shortenAddress(preview.address)}
            </p>
            <div className="flex gap-3 mt-1">
              <span className="text-[9px] font-mono text-zinc-400">
                Win {(preview.win_rate * 100).toFixed(1)}%
              </span>
              <span className="text-[9px] font-mono text-zinc-400">
                ROI {(preview.roi * 100).toFixed(1)}%
              </span>
              <span
                className={`text-[9px] font-mono ${pnlColor(parseFloat(preview.profit) || 0)}`}
              >
                +${fmtUsd(parseFloat(preview.profit) || 0, 0)}
              </span>
            </div>
          </div>
          <Badge color="zinc">preview</Badge>
        </div>
      )}

      <div className="flex gap-2 justify-end">
        <Button
          size="sm"
          variant="ghost"
          onClick={() => {
            setOpen(false);
            setAddr("");
            setLabel("");
            setPreview(null);
            setErr(null);
          }}
        >
          Cancel
        </Button>
        <Button
          size="sm"
          variant="primary"
          disabled={busy || !addr.trim()}
          onClick={handleTrack}
        >
          {busy ? "Adding…" : "Track"}
        </Button>
      </div>
    </div>
  );
}

// ── Single whale row ──────────────────────────────────────────────────────────

function WhaleRowItem({
  whale: w,
  onUntrack,
  onToggleFollow,
  onNavigate,
  alwaysShowActions = false,
  selected,
  onToggleSelect,
}: {
  whale: WhaleRow;
  onUntrack: (a: string) => Promise<void>;
  onToggleFollow: (a: string) => Promise<void>;
  onNavigate: () => void;
  alwaysShowActions?: boolean;
  selected: boolean;
  onToggleSelect: () => void;
}) {
  const profit = parseFloat(w.profit) || 0;
  const [busy, setBusy] = useState(false);
  const isRecentlyActive = useMemo(() => {
    const seenMs = new Date(w.last_seen).getTime();
    return Date.now() - seenMs < 2 * 60 * 1000; // 2 minutes
  }, [w.last_seen]);

  async function act(fn: () => Promise<void>, e: React.MouseEvent) {
    e.stopPropagation();
    setBusy(true);
    try {
      await fn();
    } finally {
      setBusy(false);
    }
  }

  return (
    <div
      className={`py-2.5 px-3 group transition-colors cursor-pointer ${
        selected
          ? "bg-emerald-950/20 border-l-2 border-emerald-600/60"
          : w.followed
          ? "border-l-2 border-violet-600/40 hover:bg-violet-950/10"
          : "hover:bg-zinc-800/30 border-l-2 border-transparent"
      }${w.archived ? " opacity-60" : ""}`}
      onClick={onNavigate}
    >
      <div className="flex items-start justify-between gap-2">
        {/* Checkbox */}
        <div className="pt-0.5 shrink-0" onClick={(e) => e.stopPropagation()}>
          <input
            type="checkbox"
            checked={selected}
            onChange={onToggleSelect}
            className="accent-emerald-500 cursor-pointer"
          />
        </div>

        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5 flex-wrap">
            <span className="text-[11px] font-mono text-zinc-300 truncate max-w-[150px]">
              {w.display_name ?? shortenAddress(w.address)}
            </span>
            {isRecentlyActive && (
              <span className="inline-flex items-center gap-1 text-[9px] font-mono text-emerald-400">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                live
              </span>
            )}
            {w.followed && <Badge color="violet">FOLLOW</Badge>}
            {w.archived && <Badge color="zinc">ARC</Badge>}
          </div>
          <div className="text-[9px] font-mono text-zinc-600 mt-0.5 truncate">
            {shortenAddress(w.address)} · {w.markets_traded} mkts ·{" "}
            {new Date(w.last_seen).toLocaleDateString()}
          </div>
        </div>
        <div className="text-right shrink-0">
          <div className={`text-sm font-mono font-bold tabular-nums ${pnlColor(profit)}`}>
            {profit >= 0 ? "+" : ""}${fmtUsd(profit, 0)}
          </div>
          <div className="text-[9px] font-mono text-zinc-500">
            ROI {(w.roi * 100).toFixed(1)}%
          </div>
        </div>
      </div>

      <div className="flex items-center gap-2 mt-1.5 ml-5">
        <Stat
          label="Win"
          value={`${(w.win_rate * 100).toFixed(1)}%`}
          highlight={w.win_rate >= 0.65}
        />
        <Stat label="Vol" value={`$${fmtUsd(parseFloat(w.volume) || 0, 0)}`} />
        <Stat label="Mkts" value={String(w.markets_traded)} />
        <div
          className={`ml-auto flex gap-1.5 transition-opacity ${alwaysShowActions ? "opacity-100" : "opacity-0 group-hover:opacity-100"}`}
        >
          <button
            disabled={busy}
            onClick={(e) => act(() => onToggleFollow(w.address), e)}
            className={`px-2 py-0.5 rounded text-[9px] font-mono border transition-colors disabled:opacity-40 ${
              w.followed
                ? "bg-emerald-500/15 text-emerald-400 border-emerald-700/40 hover:bg-red-950/30 hover:text-red-400 hover:border-red-800/40"
                : "bg-zinc-800/60 text-zinc-400 border-zinc-700 hover:bg-emerald-500/15 hover:text-emerald-400 hover:border-emerald-700/40"
            }`}
          >
            {w.followed ? "Unfollow" : "Follow"}
          </button>
          <button
            disabled={busy}
            onClick={(e) => act(() => onUntrack(w.address), e)}
            className="px-2 py-0.5 rounded text-[9px] font-mono border border-zinc-700 text-zinc-600 hover:text-red-400 hover:border-red-900/50 transition-colors disabled:opacity-40"
          >
            Remove
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Activity tab ──────────────────────────────────────────────────────────────

function ActivityTab({ events }: { events: WhaleEventRow[] }) {
  const [addrFilter, setAddrFilter] = useState("");
  const [sideFilter, setSideFilter] = useState<"all" | "buy" | "sell">("all");

  const filtered = useMemo(() => {
    let list = [...events];
    if (addrFilter.trim()) {
      const q = addrFilter.trim().toLowerCase();
      list = list.filter((e) => e.address.toLowerCase().includes(q));
    }
    if (sideFilter !== "all") {
      list = list.filter((e) =>
        sideFilter === "buy"
          ? e.side.toUpperCase().includes("BUY")
          : e.side.toUpperCase().includes("SELL"),
      );
    }
    return list;
  }, [events, addrFilter, sideFilter]);

  return (
    <div className="flex flex-col flex-1 min-h-0 gap-3">
      <div className="flex items-center gap-2 shrink-0">
        <div className="flex-1">
          <Input
            placeholder="Filter by address…"
            value={addrFilter}
            onChange={(e) => setAddrFilter(e.target.value)}
          />
        </div>
        <div className="w-28">
          <Select
            value={sideFilter}
            onChange={(e) =>
              setSideFilter(e.target.value as "all" | "buy" | "sell")
            }
          >
            <option value="all">All sides</option>
            <option value="buy">Buy only</option>
            <option value="sell">Sell only</option>
          </Select>
        </div>
      </div>

      <Panel className="flex-1 min-h-0">
        {filtered.length === 0 ? (
          <EmptyState msg="No live activity yet — whale scanner will populate this on next poll." />
        ) : (
          <div className="divide-y divide-zinc-800/40">
            {filtered.map((e, i) => (
              <ActivityRow key={i} event={e} />
            ))}
          </div>
        )}
      </Panel>
    </div>
  );
}

function ActivityRow({ event }: { event: WhaleEventRow }) {
  const amount = parseFloat(event.amount) || 0;
  const price = parseFloat(event.price) || 0;
  const isBuy = event.side.toUpperCase().includes("BUY");
  const ts = new Date(event.timestamp);

  return (
    <div className="py-2 px-3 hover:bg-zinc-800/20 transition-colors">
      <div className="flex items-center justify-between gap-2">
        <Badge color={isBuy ? "emerald" : "red"}>{event.side}</Badge>
        <span className="text-[10px] font-mono text-zinc-300 font-semibold">
          ${fmtUsd(amount, 0)}
        </span>
        <span className="text-[10px] font-mono text-zinc-500">
          @{price.toFixed(3)}
        </span>
        <span className="text-[9px] font-mono text-zinc-600 ml-auto">
          {ts.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
        </span>
      </div>
      {event.question && (
        <p className="text-[9px] font-mono text-zinc-500 mt-0.5 truncate">
          {event.question}
        </p>
      )}
      <p className="text-[9px] font-mono text-zinc-700 mt-0.5">
        {shortenAddress(event.address)} · {event.platform}
      </p>
    </div>
  );
}
