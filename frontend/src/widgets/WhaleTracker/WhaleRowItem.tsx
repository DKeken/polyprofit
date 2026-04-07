import { memo, useState, useMemo } from "react";
import { useLocation } from "wouter";
import type { WhaleRow } from "./types";
import { fmtUsd, fmtPnl, shortenAddress, pnlColor } from "../../shared/lib/format";
import { Stat, Badge, Checkbox } from "../../shared/ui";

interface WhaleRowItemProps {
  whale: WhaleRow;
  onUntrack: (a: string) => Promise<void>;
  onToggleFollow: (a: string) => Promise<void>;
  onNavigate: () => void;
  alwaysShowActions?: boolean;
  selected: boolean;
  onToggleSelect: () => void;
}

export const WhaleRowItem = memo(
  function WhaleRowItem({
    whale: w,
    onUntrack,
    onToggleFollow,
    onNavigate,
    alwaysShowActions = false,
    selected,
    onToggleSelect,
  }: WhaleRowItemProps) {
    const profit = parseFloat(w.profit) || 0;
    const [busy, setBusy] = useState(false);
    const isRecentlyActive = useMemo(() => {
      const seenMs = new Date(w.last_seen).getTime();
      return Date.now() - seenMs < 2 * 60 * 1000;
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
          <div
            className="pt-0.5 shrink-0 flex items-center justify-center cursor-pointer"
            onClick={(e) => e.stopPropagation()}
          >
            <Checkbox checked={selected} onChange={onToggleSelect} />
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
            <div
              className={`text-sm font-mono font-bold tabular-nums ${pnlColor(profit)}`}
            >
              {fmtPnl(profit, 0)}
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
          <Stat
            label="Vol"
            value={`$${fmtUsd(parseFloat(w.volume) || 0, 0)}`}
          />
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
  },
  (prev, next) =>
    prev.whale === next.whale &&
    prev.selected === next.selected &&
    prev.alwaysShowActions === next.alwaysShowActions,
);
