import { useState, useMemo, useRef, useEffect, useCallback } from "react";
import type { WhaleRow, WhaleEventRow } from "../../shared/hooks/useWhales";
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

// ── Types ─────────────────────────────────────────────────────────────────────

type SortKey =
  | "profit"
  | "roi"
  | "win_rate"
  | "volume"
  | "markets_traded"
  | "last_seen";
type SortDir = "desc" | "asc";

interface Props {
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
}

// ── Resizable split hook ──────────────────────────────────────────────────────

const STORAGE_KEY = "whale-split-pct";
const MIN_PCT = 25;
const MAX_PCT = 75;

function useSplitResize(defaultPct = 55) {
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
}: Props) {
  const [search, setSearch] = useState("");
  const [sortKey, setSortKey] = useState<SortKey>("profit");
  const [sortDir, setSortDir] = useState<SortDir>("desc");
  const [filterFollowed, setFilterFollowed] = useState(false);
  const [mobileTab, setMobileTab] = useState<"registry" | "activity">(
    "registry",
  );
  const { leftPct, containerRef, onMouseDown } = useSplitResize();

  function toggleSort(key: SortKey) {
    if (key === sortKey) {
      setSortDir((d) => (d === "desc" ? "asc" : "desc"));
    } else {
      setSortKey(key);
      setSortDir("desc");
    }
  }

  const filtered = useMemo(() => {
    let list = [...whales];
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
    return list;
  }, [whales, search, sortKey, sortDir, filterFollowed]);

  return (
    <div className="flex flex-col h-full min-h-0 gap-3 p-4">
      {/* Header */}
      <div className="flex items-center justify-between gap-3 shrink-0">
        <div>
          <h2 className="text-sm font-mono font-semibold text-zinc-200 uppercase tracking-widest">
            Whale Registry
          </h2>
          {lastRefreshed && (
            <p className="text-[10px] font-mono text-zinc-600 mt-0.5">
              Updated {lastRefreshed.toLocaleTimeString()}
            </p>
          )}
        </div>
        <Button onClick={onRefresh} disabled={loading} size="sm">
          {loading ? "Loading…" : "Refresh"}
        </Button>
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
              ? `Whales (${whales.length})`
              : `Activity (${activity.length})`}
          </button>
        ))}
      </div>

      {/* ── Mobile: single pane ── */}
      <div className="flex flex-col flex-1 min-h-0 md:hidden">
        {mobileTab === "registry" ? (
          <RegistryTab
            whales={filtered}
            allCount={whales.length}
            search={search}
            onSearch={setSearch}
            sortKey={sortKey}
            sortDir={sortDir}
            onSort={toggleSort}
            filterFollowed={filterFollowed}
            onFilterFollowed={setFilterFollowed}
            onTrack={onTrack}
            onUntrack={onUntrack}
            onToggleFollow={onToggleFollow}
            onLookup={onLookup}
            onPoll={onPoll}
            mobile
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
          <RegistryTab
            whales={filtered}
            allCount={whales.length}
            search={search}
            onSearch={setSearch}
            sortKey={sortKey}
            sortDir={sortDir}
            onSort={toggleSort}
            filterFollowed={filterFollowed}
            onFilterFollowed={setFilterFollowed}
            onTrack={onTrack}
            onUntrack={onUntrack}
            onToggleFollow={onToggleFollow}
            onLookup={onLookup}
            onPoll={onPoll}
          />
        </div>

        {/* Divider */}
        <div
          onMouseDown={onMouseDown}
          className="w-1.5 shrink-0 mx-1 rounded-full bg-zinc-800 hover:bg-emerald-600/50 cursor-col-resize transition-colors active:bg-emerald-500/70"
        />

        {/* Right — activity */}
        <div className="flex flex-col min-h-0 min-w-0 flex-1">
          <ActivityTab events={activity} />
        </div>
      </div>
    </div>
  );
}

// ── Registry tab ──────────────────────────────────────────────────────────────

interface RegistryTabProps {
  whales: WhaleRow[];
  allCount: number;
  search: string;
  onSearch: (v: string) => void;
  sortKey: SortKey;
  sortDir: SortDir;
  onSort: (k: SortKey) => void;
  filterFollowed: boolean;
  onFilterFollowed: (v: boolean) => void;
  onTrack: (address: string, displayName?: string) => Promise<void>;
  onUntrack: (address: string) => Promise<void>;
  onToggleFollow: (address: string) => Promise<void>;
  onLookup: (address: string) => Promise<WhaleRow>;
  onPoll: () => Promise<void>;
  mobile?: boolean;
}

function RegistryTab({
  whales,
  allCount,
  search,
  onSearch,
  sortKey,
  sortDir,
  onSort,
  filterFollowed,
  onFilterFollowed,
  onTrack,
  onUntrack,
  onToggleFollow,
  onLookup,
  onPoll,
  mobile = false,
}: RegistryTabProps) {
  return (
    <div className="flex flex-col flex-1 min-h-0 gap-3">
      {/* Controls row */}
      <div className="flex flex-wrap items-center gap-2 shrink-0">
        <div className="flex-1 min-w-[160px]">
          <Input
            placeholder="Search address or name…"
            value={search}
            onChange={(e) => onSearch(e.target.value)}
          />
        </div>
        <div className="w-36">
          <Select
            value={sortKey}
            onChange={(e) => onSort(e.target.value as SortKey)}
          >
            <option value="profit">Sort: Profit</option>
            <option value="roi">Sort: ROI</option>
            <option value="win_rate">Sort: Win Rate</option>
            <option value="volume">Sort: Volume</option>
            <option value="markets_traded">Sort: Markets</option>
            <option value="last_seen">Sort: Last Seen</option>
          </Select>
        </div>
        <button
          onClick={() => onSort(sortKey)}
          className="px-2 py-1.5 rounded border border-zinc-700 bg-zinc-800 text-zinc-400 text-[10px] font-mono hover:text-zinc-200 hover:border-zinc-500 transition-colors"
          title={sortDir === "desc" ? "Descending" : "Ascending"}
        >
          {sortDir === "desc" ? "↓" : "↑"}
        </button>
        <button
          onClick={() => onFilterFollowed(!filterFollowed)}
          className={`px-2.5 py-1.5 rounded border text-[10px] font-mono transition-colors ${
            filterFollowed
              ? "bg-emerald-500/15 text-emerald-400 border-emerald-700/40"
              : "bg-zinc-800 text-zinc-500 border-zinc-700 hover:text-zinc-300"
          }`}
        >
          Following
        </button>
      </div>

      {/* Add-whale inline form */}
      <AddWhaleRow onTrack={onTrack} onLookup={onLookup} />

      {/* Whale list */}
      <Panel className="flex-1 min-h-0">
        {whales.length === 0 ? (
          allCount === 0 ? (
            <PollEmptyState onPoll={onPoll} />
          ) : (
            <EmptyState msg="No whales match the current filter." />
          )
        ) : (
          <div className="divide-y divide-zinc-800/50">
            {whales.map((w) => (
              <WhaleRowItem
                key={w.address}
                whale={w}
                onUntrack={onUntrack}
                onToggleFollow={onToggleFollow}
                alwaysShowActions={mobile}
              />
            ))}
          </div>
        )}
      </Panel>
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
      <span className="text-2xl">🐋</span>
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
          <>⚡ Scan now</>
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
  alwaysShowActions = false,
}: {
  whale: WhaleRow;
  onUntrack: (a: string) => Promise<void>;
  onToggleFollow: (a: string) => Promise<void>;
  alwaysShowActions?: boolean;
}) {
  const profit = parseFloat(w.profit) || 0;
  const [busy, setBusy] = useState(false);

  async function act(fn: () => Promise<void>) {
    setBusy(true);
    try {
      await fn();
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="py-2.5 px-3 group hover:bg-zinc-800/30 transition-colors">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5 flex-wrap">
            <span className="text-[11px] font-mono text-zinc-300 truncate max-w-[180px]">
              {w.display_name ?? shortenAddress(w.address)}
            </span>
            {w.followed && <Badge color="emerald">FOLLOW</Badge>}
          </div>
          <div className="text-[9px] font-mono text-zinc-600 mt-0.5 truncate">
            {shortenAddress(w.address)} · {w.markets_traded} mkts ·{" "}
            {new Date(w.last_seen).toLocaleDateString()}
          </div>
        </div>
        <div className="text-right shrink-0">
          <div className={`text-sm font-mono font-bold ${pnlColor(profit)}`}>
            +${fmtUsd(profit, 0)}
          </div>
          <div className="text-[9px] font-mono text-zinc-500">
            ROI {(w.roi * 100).toFixed(1)}%
          </div>
        </div>
      </div>

      <div className="flex items-center gap-3 mt-1.5">
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
            onClick={() => act(() => onToggleFollow(w.address))}
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
            onClick={() => act(() => onUntrack(w.address))}
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
          <EmptyState msg="No activity matches the filter." />
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
