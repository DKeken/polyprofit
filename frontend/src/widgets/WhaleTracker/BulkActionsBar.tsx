import { memo } from "react";
import type { WhaleRow, ViewFilter } from "./types";
import {
  Star,
  StarOff,
  Archive,
  RotateCcw,
  Trash2,
  X,
} from "lucide-react";

interface BulkActionsBarProps {
  selectedCount: number;
  selectedWhales: WhaleRow[];
  busy: boolean;
  viewFilter: ViewFilter;
  onAction: (action: string) => void;
  onClear: () => void;
}

export const BulkActionsBar = memo(function BulkActionsBar({
  selectedCount,
  selectedWhales,
  busy,
  viewFilter,
  onAction,
  onClear,
}: BulkActionsBarProps) {
  const allFollowed = selectedWhales.every((w) => w.followed);
  const someFollowed = selectedWhales.some((w) => w.followed);

  return (
    <div className="absolute bottom-6 left-1/2 -translate-x-1/2 z-10 bg-zinc-950/90 border border-zinc-800/80 backdrop-blur-md rounded-2xl px-3 py-2 flex items-center gap-3 shadow-2xl shadow-black animate-in fade-in slide-in-from-bottom-4 duration-200">
      <div className="text-[11px] font-mono text-zinc-400 shrink-0 flex items-center gap-2 pl-2">
        <span className="flex items-center justify-center bg-emerald-500 text-zinc-950 font-bold w-4 h-4 rounded text-[10px]">
          {selectedCount}
        </span>
        <span>selected</span>
      </div>

      <div className="h-4 w-px bg-zinc-800 shrink-0" />

      <div className="flex items-center gap-1.5 flex-1">
        {viewFilter !== "archived" && (
          <button
            disabled={busy}
            onClick={() => onAction("archive")}
            className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-[10px] font-mono font-medium text-zinc-400 hover:text-amber-400 hover:bg-amber-400/10 transition-colors disabled:opacity-40"
          >
            <Archive className="w-3.5 h-3.5" /> Archive
          </button>
        )}
        {viewFilter === "archived" && (
          <button
            disabled={busy}
            onClick={() => onAction("unarchive")}
            className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-[10px] font-mono font-medium text-zinc-400 hover:text-emerald-400 hover:bg-emerald-400/10 transition-colors disabled:opacity-40"
          >
            <RotateCcw className="w-3.5 h-3.5" /> Restore
          </button>
        )}

        {!allFollowed && (
          <button
            disabled={busy}
            onClick={() => onAction("follow")}
            className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-[10px] font-mono font-medium text-zinc-400 hover:text-violet-400 hover:bg-violet-400/10 transition-colors disabled:opacity-40"
          >
            <Star className="w-3.5 h-3.5" />{" "}
            {someFollowed ? "Follow rest" : "Follow"}
          </button>
        )}

        {someFollowed && (
          <button
            disabled={busy}
            onClick={() => onAction("unfollow")}
            className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-[10px] font-mono font-medium text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800/80 transition-colors disabled:opacity-40"
          >
            <StarOff className="w-3.5 h-3.5" />{" "}
            {allFollowed ? "Unfollow" : "Unfollow all"}
          </button>
        )}

        <div className="h-4 w-px bg-zinc-800 shrink-0 mx-1" />

        <button
          disabled={busy}
          onClick={() => onAction("delete")}
          className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-[10px] font-mono font-medium text-zinc-500 hover:text-red-400 hover:bg-red-400/10 transition-colors disabled:opacity-40"
        >
          <Trash2 className="w-3.5 h-3.5" /> Delete
        </button>
      </div>

      <button
        onClick={onClear}
        className="text-zinc-500 hover:text-zinc-300 hover:bg-zinc-800 transition-colors shrink-0 p-1.5 rounded-lg ml-1"
        title="Clear selection"
      >
        <X className="w-4 h-4" />
      </button>
    </div>
  );
});
