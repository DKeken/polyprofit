import { useState, useMemo, useCallback, memo } from "react";
import { useLocation } from "wouter";
import type { WhaleRow, SortKey, SortDir, ViewFilter } from "./types";
import { fmtUsd } from "../../shared/lib/format";
import {
  Panel,
  EmptyState,
  Input,
  Select,
  Checkbox,
  Spinner,
} from "../../shared/ui";
import { WhaleRowItem } from "./WhaleRowItem";
import { AddWhaleRow } from "./AddWhaleRow";
import { BulkActionsBar } from "./BulkActionsBar";
import {
  ArrowDown,
  ArrowUp,
  Star,
  Zap,
  Search,
} from "lucide-react";

// ── Poll empty state ──────────────────────────────────────────────────────────

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
            <Spinner size="xs" label="Scanning" />
            Scanning…
          </>
        ) : (
          <>
            <Zap className="w-3.5 h-3.5" /> Scan now
          </>
        )}
      </button>
    </div>
  );
}

// ── Registry Tab Props ────────────────────────────────────────────────────────

export interface RegistryTabProps {
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

// ── Registry Tab ──────────────────────────────────────────────────────────────

export const RegistryTab = memo(function RegistryTab({
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

  // Stats for followed whales
  const followedStats = useMemo(() => {
    const followed = whales.filter((w) => w.followed);
    if (followed.length === 0) return null;
    const totalPnl = followed.reduce(
      (s, w) => s + (parseFloat(w.profit) || 0),
      0,
    );
    const avgWin =
      followed.reduce((s, w) => s + w.win_rate, 0) / followed.length;
    return { count: followed.length, totalPnl, avgWin };
  }, [whales]);

  const selectedArr = useMemo(() => Array.from(selected), [selected]);
  const allSelected =
    whales.length > 0 && whales.every((w) => selected.has(w.address));

  const handleBulk = useCallback(
    async (action: string) => {
      if (selectedArr.length === 0) return;
      setBulkBusy(true);
      try {
        await onBulk(selectedArr, action);
        onToggleSelectAll([]);
      } finally {
        setBulkBusy(false);
      }
    },
    [selectedArr, onBulk, onToggleSelectAll],
  );

  return (
    <div className="flex flex-col flex-1 min-h-0 gap-2 relative">
      {/* Followed-whale stats bar */}
      {followedStats && (
        <div className="flex items-center gap-3 px-2 py-1.5 bg-violet-500/5 border border-violet-600/20 rounded-lg shrink-0">
          <span className="text-[9px] font-mono text-violet-400 uppercase tracking-wider">
            Following {followedStats.count}
          </span>
          <span className="h-3 w-px bg-violet-800/40" />
          <span
            className={`text-[10px] font-mono tabular-nums ${followedStats.totalPnl >= 0 ? "text-emerald-400" : "text-red-400"}`}
          >
            Σ {followedStats.totalPnl >= 0 ? "+" : ""}$
            {fmtUsd(followedStats.totalPnl, 0)}
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
            {
              key: "archived" as ViewFilter,
              label: `Archived (${archivedCount})`,
            },
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
          title={
            sortDir === "desc"
              ? "Descending — click to reverse"
              : "Ascending — click to reverse"
          }
        >
          {sortDir === "desc" ? (
            <ArrowDown className="w-3.5 h-3.5" />
          ) : (
            <ArrowUp className="w-3.5 h-3.5" />
          )}
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
      </div>

      {/* Add-whale inline form */}
      <AddWhaleRow onTrack={onTrack} onLookup={onLookup} />

      {/* Whale list */}
      <Panel className="flex-1 min-h-0 pb-0">
        {/* Select all row */}
        {whales.length > 0 && (
          <div className="flex items-center gap-2 px-2 py-1.5 border-b border-zinc-800/50 shrink-0">
            <Checkbox
              className="mt-px"
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
          selectedCount={selected.size}
          selectedWhales={whales.filter((w) => selected.has(w.address))}
          busy={bulkBusy}
          viewFilter={viewFilter}
          onAction={handleBulk}
          onClear={() => onToggleSelectAll([])}
        />
      )}
    </div>
  );
});
