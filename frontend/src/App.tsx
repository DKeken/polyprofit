import { Suspense, lazy, useState, useEffect } from "react";
import { useBot } from "./hooks/useBot";
import Settings from "./components/Settings";

const DashboardPage = lazy(() => import("./pages/DashboardPage"));
const WhalesPage = lazy(() => import("./pages/WhalesPage"));
const ConnectPage = lazy(() => import("./pages/ConnectPage"));
const Analytics = lazy(() => import("./components/Analytics"));
const Markets = lazy(() => import("./components/Markets"));

type Tab = "dashboard" | "whales" | "markets" | "analytics" | "connect";

const NAV_TABS: { id: Tab; label: string }[] = [
  { id: "dashboard", label: "Dashboard" },
  { id: "whales", label: "Whales" },
  { id: "markets", label: "Markets" },
  { id: "analytics", label: "Analytics" },
];

function formatUptime(secs: number | undefined): string {
  if (!secs) return "00:00:00";
  const h = Math.floor(secs / 3600);
  const m = Math.floor((secs % 3600) / 60);
  const s = Math.floor(secs % 60);
  return [h, m, s].map((v) => String(v).padStart(2, "0")).join(":");
}

function Loader() {
  return (
    <div className="min-h-screen text-zinc-100 flex items-center justify-center">
      <div className="text-sm text-zinc-500 font-mono">Loading…</div>
    </div>
  );
}

function App() {
  const [tab, setTab] = useState<Tab>("dashboard");
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [connected, setConnected] = useState<boolean | null>(null);

  const bot = useBot();
  const { tick, pause, resume, kill, updateConfig } = bot;

  // Check if backend is reachable
  useEffect(() => {
    let cancelled = false;
    const check = async () => {
      try {
        const res = await fetch("/api/status");
        if (!cancelled) setConnected(res.ok);
      } catch {
        if (!cancelled) setConnected(false);
      }
    };
    check();
    const interval = setInterval(check, 5000);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, []);

  // Still checking connection
  if (connected === null) return <Loader />;

  // Settings overlay
  if (settingsOpen) {
    return (
      <div className="min-h-screen text-zinc-100">
        <div className="max-w-[1200px] mx-auto p-4 md:p-6">
          <button
            onClick={() => setSettingsOpen(false)}
            className="mb-4 px-3 py-1.5 text-xs font-mono text-zinc-400 hover:text-zinc-200 bg-zinc-800 border border-zinc-700 rounded-lg transition-colors"
          >
            &larr; Back to App
          </button>
          <Settings
            key={JSON.stringify(tick.config)}
            config={tick.config}
            onSave={updateConfig}
          />
        </div>
      </div>
    );
  }

  return (
    <div className="h-screen text-zinc-100 flex flex-col overflow-hidden">
      {/* ── Top nav bar ── */}
      <nav className="bg-zinc-800 border-b border-zinc-700/60 px-4 py-2 flex items-center gap-1 shrink-0">
        {/* Title */}
        <h1 className="text-xs font-bold font-mono tracking-widest text-emerald-400 uppercase mr-4">
          Polyprofit
        </h1>

        {/* Tabs */}
        <div className="flex bg-zinc-800/50 rounded p-0.5 border border-zinc-700/50 mr-4">
          {NAV_TABS.map((t) => (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              className={`px-3 py-1 text-[10px] font-mono uppercase tracking-wider rounded transition-colors ${
                tab === t.id
                  ? "text-zinc-100 shadow-sm"
                  : "text-zinc-500 hover:text-zinc-300"
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>

        {/* Controls: Pause / Kill */}
        <div className="flex items-center gap-1.5">
          <button
            onClick={tick.paused ? resume : pause}
            className={`px-2.5 py-1 rounded text-[10px] font-semibold uppercase tracking-wider transition-colors ${
              tick.paused
                ? "bg-emerald-500/15 text-emerald-400 border border-emerald-700/40 hover:bg-emerald-500/25"
                : "bg-zinc-800 text-zinc-400 border border-zinc-700 hover:bg-zinc-700"
            }`}
          >
            {tick.paused ? "Resume" : "Pause"}
          </button>

          <button
            onClick={kill}
            className="px-2.5 py-1 rounded text-[10px] font-semibold uppercase tracking-wider bg-red-500/10 text-red-400 border border-red-800/30 hover:bg-red-500/20 transition-colors"
          >
            Kill
          </button>
        </div>

        {/* Status text */}
        <div className="flex items-center gap-3 ml-4 text-[10px] font-mono text-zinc-500">
          <span className="flex items-center gap-1.5">
            uptime{" "}
            <span className="text-zinc-300 font-medium">
              {formatUptime(tick.uptime_secs)}
            </span>
          </span>
          <span className="flex items-center gap-1.5">
            cycle{" "}
            <span className="text-zinc-300 font-medium">
              #{tick.total_trades ?? 0}
            </span>
          </span>
        </div>

        {/* Right side */}
        <div className="ml-auto flex items-center gap-4">
          <span className="flex items-center gap-1.5 text-[10px] font-mono">
            <span
              className={`w-2 h-2 rounded-full ${connected ? "bg-emerald-400 animate-pulse" : "bg-zinc-600"}`}
            />
            <span
              className={`font-semibold tracking-wider uppercase ${connected ? "text-emerald-400" : "text-zinc-500"}`}
            >
              {connected ? "LIVE" : "OFFLINE"}
            </span>
          </span>

          <div className="w-px h-4 bg-zinc-800" />

          {/* Connect Tab Button */}
          <button
            onClick={() => setTab("connect")}
            className={`px-2.5 py-1 text-[10px] font-mono uppercase tracking-wider rounded border transition-colors ${
              tab === "connect"
                ? "bg-emerald-500/10 text-emerald-400 border-emerald-500/30"
                : "text-zinc-500 border-zinc-700 hover:text-zinc-300 hover:border-zinc-700"
            }`}
          >
            Wallet
          </button>

          <div className="w-px h-4 bg-zinc-800" />

          {/* Settings */}
          <button
            onClick={() => setSettingsOpen(true)}
            className="text-zinc-500 hover:text-zinc-300 transition-colors p-1"
            title="Settings"
          >
            <svg
              width="14"
              height="14"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z" />
              <circle cx="12" cy="12" r="3" />
            </svg>
          </button>
        </div>
      </nav>

      {/* ── Page content ── */}
      <Suspense fallback={<Loader />}>
        {tab === "dashboard" && <DashboardPage />}
        {tab === "whales" && <WhalesPage />}
        {tab === "markets" && <Markets />}
        {tab === "analytics" && <Analytics />}
        {tab === "connect" && <ConnectPage />}
      </Suspense>
    </div>
  );
}

export default App;
