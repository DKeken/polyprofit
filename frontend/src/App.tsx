import { Suspense, lazy, useState, useEffect } from "react";
import { Link, Route, Switch, useLocation } from "wouter";
import { useBot } from "./shared/api";
import { ToastProvider } from "./shared/ui/ToastProvider";
import { useWhaleAlerts } from "./shared/ui/useWhaleAlerts";
import {
  Settings,
  Wallet,
  Hexagon,
  Clock,
  Pause,
  Play,
  OctagonX,
} from "lucide-react";

import { Select } from "./shared/ui/Select";
import { useAppStore, type DataPeriod, type Language, type TimezoneMode } from "./shared/store/useAppStore";
import { buildTranslator } from "./shared/lib/i18n";
const DashboardPage = lazy(() => import("./pages/DashboardPage"));
const WhalesPage = lazy(() => import("./pages/WhalesPage"));
const WalletPage = lazy(() => import("./pages/WalletPage"));
const SettingsPage = lazy(() => import("./pages/SettingsPage"));
const Markets = lazy(() => import("./features/markets-list"));

const NAV_TABS: { path: string; label: string; match?: string[] }[] = [
  { path: "/", label: "Dashboard" },
  { path: "/whales", label: "Whales", match: ["/whales"] },
  { path: "/markets", label: "Markets" },
];

function isTabActive(tabPath: string, location: string, match?: string[]): boolean {
  if (tabPath === "/" && location === "/") return true;
  if (tabPath !== "/") {
    if (location === tabPath) return true;
    if (match?.some((m) => location.startsWith(m))) return true;
  }
  return false;
}

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

function AppInner() {
  const [location] = useLocation();
  const [connected, setConnected] = useState<boolean | null>(null);

  const {
    language,
    setLanguage,
    timezone,
    setTimezone,
    dataPeriod,
    setDataPeriod,
  } = useAppStore();
  const t = buildTranslator(language);

  const bot = useBot();
  const { tick, pause, resume, kill } = bot;

  // Whale alerts — fires toast when a followed whale makes a significant trade
  useWhaleAlerts(tick.whale_alert_count ?? 0);

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

  return (
    <div className="h-screen text-zinc-100 flex flex-col overflow-hidden">
      {/* ── Top nav bar ── */}
      <nav className="bg-zinc-900/95 border-b border-zinc-800/80 backdrop-blur-sm px-4 h-10 flex items-center gap-0 shrink-0">
        {/* Logo */}
        <Link href="/" className="flex items-center gap-2 mr-5 shrink-0 group">
          <div className="relative flex items-center justify-center w-5 h-5">
            <Hexagon 
              className="absolute inset-0 w-full h-full text-emerald-500/10 group-hover:text-emerald-500/20 stroke-emerald-500/50 group-hover:stroke-emerald-400/70 transition-colors" 
              fill="currentColor" 
              strokeWidth={1.5}
            />
            {/* 8-bit Pixel Pepe */}
            <svg 
              viewBox="0 0 14 14" 
              shapeRendering="crispEdges"
              className="absolute w-3.5 h-3.5 transition-transform duration-300 group-hover:scale-110"
              style={{ filter: "drop-shadow(0px 0px 4px rgba(52,211,153,0.6))" }}
            >
              {/* Skin */}
              <path fill="#10B981" className="group-hover:fill-[#34D399] transition-colors" d="M5 1 h4 v1 h2 v1 h1 v2 h1 v5 h-1 v2 h-2 v1 h-6 v-1 h-2 v-2 h-1 v-5 h1 v-2 h1 v-1 h2 v-1 Z" />
              {/* Eyes Background (White) */}
              <path fill="#FFFFFF" d="M3 5 h3 v3 h-3 Z M8 5 h3 v3 h-3 Z" />
              {/* Eyelids (Half-closed) */}
              <path fill="#059669" className="group-hover:fill-[#10B981] transition-colors" d="M3 5 h3 v1 h-3 Z M8 5 h3 v1 h-3 Z" />
              {/* Pupils (Black) */}
              <path fill="#064E3B" d="M4 6 h1 v1 h-1 Z M9 6 h1 v1 h-1 Z" />
              {/* Smug Lips (Red -> neon pink) */}
              <path fill="#F43F5E" className="group-hover:fill-[#FB7185] transition-colors" d="M5 10 h5 v1 h-5 Z M10 9 h1 v1 h-1 Z" />
            </svg>
          </div>
          <span className="text-[11px] font-bold font-mono tracking-[0.2em] text-emerald-400 uppercase group-hover:text-emerald-300 transition-colors">
            Polyprofit
          </span>
        </Link>

        {/* Navigation tabs */}
        <div className="flex items-center h-full">
          {NAV_TABS.map((t) => {
            const active = isTabActive(t.path, location, t.match);
            return (
              <Link
                key={t.path}
                href={t.path}
                className={`relative h-full flex items-center px-3 text-[10px] font-mono uppercase tracking-wider transition-colors ${
                  active
                    ? "text-zinc-100"
                    : "text-zinc-500 hover:text-zinc-300"
                }`}
              >
                {t.label}
                {active && (
                  <span className="absolute bottom-0 left-2 right-2 h-0.5 bg-emerald-400 rounded-full" />
                )}
              </Link>
            );
          })}
        </div>

        {/* Center spacer */}
        <div className="flex-1" />

        {/* Status cluster */}
        <div className="flex items-center gap-3 mr-3">
          {/* Connection indicator */}
          <div className="flex items-center gap-1.5">
            <span
              className={`w-1.5 h-1.5 rounded-full ${
                connected
                  ? "bg-emerald-400 shadow-[0_0_6px_rgba(52,211,153,0.5)]"
                  : "bg-zinc-600"
              }`}
            />
            <span
              className={`text-[9px] font-mono font-semibold tracking-wider uppercase ${
                connected ? "text-emerald-400" : "text-zinc-600"
              }`}
            >
              {connected ? "LIVE" : "OFF"}
            </span>
          </div>

          <span className="w-px h-3.5 bg-zinc-800" />

          {/* Uptime */}
          <span className="text-[9px] font-mono text-zinc-500 tabular-nums flex items-center gap-1">
            <Clock className="w-2.5 h-2.5 text-zinc-600" />
            {formatUptime(tick.uptime_secs)}
          </span>

          <span className="w-px h-3.5 bg-zinc-800" />

          {/* Cycle */}
          <span className="text-[9px] font-mono text-zinc-500 tabular-nums">
            #{tick.total_trades ?? 0}
          </span>
        </div>

        {/* Global Selectors */}
        <div className="flex items-center gap-2 mr-3">
          <Select 
            className="py-1 px-2 pr-6 text-[10px] h-6 min-w-[70px]" 
            value={dataPeriod} 
            onChange={(e) => setDataPeriod(e.target.value as DataPeriod)}
          >
            <option value="1H">{t("period_1H")}</option>
            <option value="24H">{t("period_24H")}</option>
            <option value="7D">{t("period_7D")}</option>
            <option value="30D">{t("period_30D")}</option>
            <option value="ALL">{t("period_ALL")}</option>
          </Select>
          
          <Select 
            className="py-1 px-2 pr-6 text-[10px] h-6" 
            value={language} 
            onChange={(e) => setLanguage(e.target.value as Language)}
          >
            <option value="en">EN</option>
            <option value="ru">RU</option>
          </Select>
          
          <Select 
            className="py-1 px-2 pr-6 text-[10px] h-6 min-w-[90px]" 
            value={timezone} 
            onChange={(e) => setTimezone(e.target.value as TimezoneMode)}
          >
            <option value="local">LOCAL</option>
            <option value="utc">UTC</option>
          </Select>
        </div>

        {/* Controls */}
        <div className="flex items-center gap-1">
          <button
            onClick={tick.paused ? resume : pause}
            className={`flex items-center gap-1 px-2 py-1 rounded-md text-[9px] font-mono font-semibold uppercase tracking-wider transition-all ${
              tick.paused
                ? "bg-emerald-500/10 text-emerald-400 border border-emerald-700/40 hover:bg-emerald-500/20"
                : "text-zinc-400 border border-zinc-700/60 hover:bg-zinc-800 hover:text-zinc-200"
            }`}
          >
            {tick.paused ? (
              <><Play className="w-2.5 h-2.5" /> Resume</>
            ) : (
              <><Pause className="w-2.5 h-2.5" /> Pause</>
            )}
          </button>

          <button
            onClick={kill}
            className="flex items-center gap-1 px-2 py-1 rounded-md text-[9px] font-mono font-semibold uppercase tracking-wider bg-red-500/8 text-red-400/80 border border-red-900/30 hover:bg-red-500/15 hover:text-red-400 transition-all"
          >
            <OctagonX className="w-2.5 h-2.5" /> Kill
          </button>

          <span className="w-px h-3.5 bg-zinc-800 mx-0.5" />

          {/* Wallet */}
          <Link
            href="/wallet"
            className={`p-1.5 rounded-md transition-all ${
              location === "/wallet"
                ? "bg-zinc-800 text-zinc-100"
                : "text-zinc-500 hover:text-zinc-300 hover:bg-zinc-800/50"
            }`}
            title="Wallet"
          >
            <Wallet className="w-3.5 h-3.5" />
          </Link>

          {/* Settings */}
          <Link
            href="/settings"
            className={`p-1.5 rounded-md transition-all ${
              location === "/settings"
                ? "bg-zinc-800 text-zinc-100"
                : "text-zinc-500 hover:text-zinc-300 hover:bg-zinc-800/50"
            }`}
            title="Settings"
          >
            <Settings className="w-3.5 h-3.5" />
          </Link>
        </div>
      </nav>

      {/* ── Page content ── */}
      <div className="flex-1 min-h-0 flex flex-col overflow-y-auto">
        <Suspense fallback={<Loader />}>
          <Switch>
            <Route path="/" component={DashboardPage} />
            <Route path="/whales" component={WhalesPage} />
            <Route path="/whales/:address" component={WhalesPage} />
            <Route path="/markets" component={Markets} />
            <Route path="/wallet" component={WalletPage} />
            <Route path="/settings" component={SettingsPage} />
          </Switch>
        </Suspense>
      </div>
    </div>
  );
}

function App() {
  return (
    <ToastProvider>
      <AppInner />
    </ToastProvider>
  );
}

export default App;
