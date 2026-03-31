interface Props {
  paused: boolean;
  mode: string;
  onPause: () => void;
  onResume: () => void;
  onKill: () => void;
}

export default function Controls({
  paused,
  mode,
  onPause,
  onResume,
  onKill,
}: Props) {
  return (
    <div className="bg-zinc-900 rounded-lg border border-zinc-800 p-4 mt-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          {/* Mode badge */}
          <span
            className={`px-2.5 py-1 rounded text-xs font-medium ${
              mode === "Live"
                ? "bg-emerald-500/20 text-emerald-400 border border-emerald-800"
                : "bg-zinc-700/50 text-zinc-400 border border-zinc-700"
            }`}
          >
            {mode}
          </span>
        </div>

        <div className="flex items-center gap-3">
          {/* Pause / Resume */}
          <button
            onClick={paused ? onResume : onPause}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
              paused
                ? "bg-emerald-500/20 text-emerald-400 hover:bg-emerald-500/30"
                : "bg-zinc-700/50 text-zinc-300 hover:bg-zinc-700"
            }`}
          >
            {paused ? "▶ Resume" : "⏸ Pause"}
          </button>

          {/* Kill Switch */}
          <button
            onClick={onKill}
            className="px-4 py-2 rounded-lg text-sm font-medium bg-red-500/20 text-red-400 hover:bg-red-500/30 border border-red-800/50 transition-colors"
          >
            ⛔ Kill
          </button>
        </div>
      </div>
    </div>
  );
}
