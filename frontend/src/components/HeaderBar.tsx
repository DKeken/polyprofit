import type { Tick } from "@server-bindings/Tick";

function formatUptime(secs: number | undefined): string {
  if (!secs) return "00:00:00";
  const h = Math.floor(secs / 3600);
  const m = Math.floor((secs % 3600) / 60);
  const s = Math.floor(secs % 60);
  return [h, m, s].map(v => String(v).padStart(2, "0")).join(":");
}

interface Props {
  tick: Tick | null;
  connected: boolean;
  paused: boolean;
  onPause: () => void;
  onResume: () => void;
  onKill: () => void;
  onSettings: () => void;
}

export default function HeaderBar({
  tick,
  connected,
  paused,
  onPause,
  onResume,
  onKill,
  onSettings,
}: Props) {
  const statusText = connected ? "LIVE" : "Disconnected";
  const statusClass = connected ? "text-emerald-400 live-indicator" : "text-zinc-500";
  const dotClass = connected ? "bg-emerald-400 animate-pulse-dot" : "bg-zinc-600";

  return (
    <div className="bg-zinc-950 border-b border-zinc-800/60 px-4 md:px-5 py-2 shrink-0">
      <div className="flex items-center justify-between gap-3">
        {/* Left: Title + Connection */}
        <div className="flex items-center gap-3">
          <h1 className="text-sm font-bold font-mono tracking-widest text-zinc-200 uppercase">
            polymarket arb
          </h1>
          <span className={`flex items-center gap-1.5 text-xs font-mono ${!connected ? "text-zinc-500" : ""}`}>
            <span className={`w-2 h-2 rounded-full ${dotClass}`} />
            <span className={`${statusClass} font-semibold`}>{statusText}</span>
          </span>
        </div>

        {/* Right: Controls + Stats */}
        <div className="flex items-center gap-3 text-[11px] font-mono">
          {/* Pause / Resume */}
          <button
            onClick={paused ? onResume : onPause}
            className={`px-2.5 py-1 rounded text-[10px] font-semibold uppercase tracking-wider transition-colors ${
              paused
                ? "bg-emerald-500/15 text-emerald-400 border border-emerald-700/40 hover:bg-emerald-500/25"
                : "bg-zinc-800 text-zinc-400 border border-zinc-700 hover:bg-zinc-700"
            }`}
          >
            {paused ? "Resume" : "Pause"}
          </button>

          {/* Kill */}
          <button
            onClick={onKill}
            className="px-2.5 py-1 rounded text-[10px] font-semibold uppercase tracking-wider bg-red-500/10 text-red-400 border border-red-800/30 hover:bg-red-500/20 transition-colors"
          >
            Kill
          </button>

          <span className="text-zinc-700">|</span>

          {/* Uptime + Cycle */}
          <span className="text-zinc-500">
            uptime{" "}
            <span className="text-zinc-300">{formatUptime(tick?.uptime_secs)}</span>
          </span>
          <span className="text-zinc-500">
            cycle{" "}
            <span className="text-zinc-300">#{tick?.total_trades ?? 0}</span>
          </span>

          {/* Settings gear */}
          <button
            onClick={onSettings}
            className="text-zinc-500 hover:text-zinc-300 transition-colors p-1"
            title="Settings"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z"/>
              <circle cx="12" cy="12" r="3"/>
            </svg>
          </button>
        </div>
      </div>
    </div>
  );
}
