/**
 * TradeFeed — Polymarket-style trade activity feed with bottom tab navigation.
 * Full left column with 4 views: Predictions, Tokens, Search, My Positions.
 */

import { useState, useMemo } from "react";
import type { Tick } from "@server-bindings/Tick";
import type { TradeInfo } from "@server-bindings/TradeInfo";
import type { PositionInfo } from "@server-bindings/PositionInfo";
import Markets from "../../features/markets-list";
import { Panel } from "../../shared/ui";

import { formatDuration, isBuySide } from "../../shared/lib/format";

function timeAgo(ts: string | undefined): string {
  if (!ts) return "";
  const diff = Math.floor((Date.now() - new Date(ts).getTime()) / 1000);
  if (diff < 0 || isNaN(diff)) return "now";
  if (diff < 60) return `${diff}s ago`;
  return formatDuration(diff) + " ago";
}

function formatAge(secs: number): string {
  return formatDuration(secs);
}

function TradeRow({ trade, t }: { trade: TradeInfo, t: (k: string) => string }) {
  const pnl = trade.pnl ? parseFloat(trade.pnl) : null;
  const isYes = isBuySide(trade.side);
  const sign = pnl !== null && pnl >= 0 ? "+" : "";

  return (
    <div className="flex items-center gap-3 px-4 py-2.5 hover:bg-zinc-800/30 transition-colors border-b border-zinc-800/20">
      <span className={`shrink-0 w-10 py-1 rounded text-[10px] font-bold font-mono text-center uppercase ${
        isYes ? "bg-emerald-500/20 text-emerald-400" : "bg-red-500/20 text-red-400"
      }`}>
        {isYes ? t?.("buy") ?? "Buy" : t?.("sell") ?? "Sell"}
      </span>
      <div className="w-8 h-8 rounded-full bg-zinc-800 border border-zinc-700/50 flex items-center justify-center shrink-0">
        <span className="text-[10px] font-mono text-zinc-500">
          {(trade.market || "?")[0].toUpperCase()}
        </span>
      </div>
      <div className="flex-1 min-w-0">
        <div className="text-[13px] text-zinc-200 truncate leading-tight">
          {trade.market || "Unknown market"}
        </div>
        <div className="text-[10px] text-zinc-500 mt-0.5 font-mono">{trade.side ?? (t?.("buy") ?? "Buy")}</div>
      </div>
      <div className="shrink-0 text-[11px] font-mono text-zinc-500 w-14 text-right">
        {timeAgo(trade.ts)}
      </div>
      <div className="shrink-0 text-right w-20">
        {pnl !== null && (
          <div className={`text-[13px] font-mono font-semibold ${pnl >= 0 ? "text-profit" : "text-loss"}`}>
            {sign}${Math.abs(pnl).toFixed(2)}
          </div>
        )}
        {trade.size && (
          <div className="text-[10px] text-zinc-600 font-mono">{trade.size} {t?.("shares") ?? "shares"}</div>
        )}
      </div>
    </div>
  );
}

function PositionRow({ pos, t }: { pos: PositionInfo, t: (k: string) => string }) {
  const isYes = isBuySide(pos.side);

  return (
    <div className="flex items-center gap-3 px-4 py-2.5 hover:bg-zinc-800/30 transition-colors border-b border-zinc-800/20">
      <span className={`shrink-0 w-10 py-1 rounded text-[10px] font-bold font-mono text-center uppercase ${
        isYes ? "bg-emerald-500/20 text-emerald-400" : "bg-red-500/20 text-red-400"
      }`}>
        {isYes ? "Yes" : "No"}
      </span>
      <div className="w-8 h-8 rounded-full bg-zinc-800 border border-zinc-700/50 flex items-center justify-center shrink-0">
        <span className="text-[10px] font-mono text-zinc-500">
          {(pos.market || pos.condition_id || "?")[0].toUpperCase()}
        </span>
      </div>
      <div className="flex-1 min-w-0">
        <div className="text-[13px] text-zinc-200 truncate leading-tight">
          {pos.market || pos.condition_id.slice(0, 12)}
        </div>
        <div className="text-[10px] text-zinc-500 mt-0.5 font-mono">
          entry: ${pos.entry_price ?? "?"}
        </div>
      </div>
      <div className="shrink-0 text-[11px] font-mono text-zinc-500 w-14 text-right">
        {formatAge(pos.age_secs)}
      </div>
      <div className="shrink-0 text-right w-20">
        <div className="text-[13px] font-mono text-zinc-300">{pos.size ?? "?"}</div>
        <div className="text-[10px] text-zinc-600 font-mono">{t?.("shares") ?? "shares"}</div>
      </div>
    </div>
  );
}

type FeedTab = "predictions" | "tokens" | "search" | "positions";

import { useAppStore } from "../../shared/store/useAppStore";
import { buildTranslator } from "../../shared/lib/i18n";

export default function TradeFeed({
  trades,
  positions,
  totalTrades,
  tick,
}: {
  trades: TradeInfo[];
  positions: PositionInfo[];
  totalTrades: number;
  tick: Tick;
}) {
  const [tab, setTab] = useState<FeedTab>("predictions");
  const [searchQuery, setSearchQuery] = useState("");
  const { language } = useAppStore();
  const t = buildTranslator(language);

  // Filter trades by search query
  const filteredTrades = useMemo(() => {
    if (!searchQuery.trim()) return trades;
    const q = searchQuery.toLowerCase();
    return trades.filter(t => (t.market || "").toLowerCase().includes(q));
  }, [trades, searchQuery]);

  const filteredPositions = useMemo(() => {
    if (!searchQuery.trim()) return positions;
    const q = searchQuery.toLowerCase();
    return positions.filter(p =>
      (p.market || p.condition_id || "").toLowerCase().includes(q)
    );
  }, [positions, searchQuery]);

  // Tab header info
  const statsText: Record<FeedTab, string> = {
    predictions: `${totalTrades} trades · ${positions.length} open`,
    tokens: `${tick.markets ?? 0} markets`,
    search: `${filteredTrades.length} trades · ${filteredPositions.length} positions`,
    positions: `${positions.length} open positions`,
  };

  return (
    <Panel className="flex flex-col h-full bg-zinc-950">
      {/* Sleek Top Tabs */}
      <div className="shrink-0 border-b border-zinc-800/60 bg-zinc-900/40 p-1.5 flex items-center gap-1">
        <NavTab
          active={tab === "predictions"}
          onClick={() => setTab("predictions")}
          icon={<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M3 3v18h18"/><path d="m19 9-5 5-4-4-3 3"/></svg>}
          label="Activity"
        />
        <NavTab
          active={tab === "positions"}
          onClick={() => setTab("positions")}
          icon={<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/></svg>}
          label="Positions"
        />
        <NavTab
          active={tab === "tokens"}
          onClick={() => setTab("tokens")}
          icon={<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><path d="M12 6v6l4 2"/></svg>}
          label="Tokens"
        />
        <NavTab
          active={tab === "search"}
          onClick={() => setTab("search")}
          icon={<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.3-4.3"/></svg>}
          label="Search"
        />
      </div>

      {/* Header Info */}
      <div className="shrink-0 px-4 py-2 border-b border-zinc-800/40 flex items-center justify-between">
        <span className="text-[10px] font-mono text-zinc-500 tracking-wide">
          {statsText[tab]}
        </span>
      </div>

      {/* Search bar — only for search tab */}
      {tab === "search" && (
        <div className="shrink-0 px-4 py-2 border-b border-zinc-800/40 bg-zinc-900/20">
          <input
            type="text"
            placeholder="Search markets..."
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            className="w-full bg-zinc-800/60 border border-zinc-700/60 rounded px-3 py-1.5 text-[11px] font-mono text-zinc-200 placeholder-zinc-600 outline-none focus:border-emerald-500/50 focus:ring-1 focus:ring-emerald-500/20 transition-all"
          />
        </div>
      )}

      {/* Column headers — for predictions and search tabs */}
      {(tab === "predictions" || tab === "search" || tab === "positions") && (
        <div className="shrink-0 flex items-center gap-3 px-4 py-1.5 text-[9px] font-mono uppercase tracking-widest text-zinc-600 border-b border-zinc-800/50 bg-zinc-900/20">
          <span className="w-10">Type</span>
          <span className="w-8" />
          <span className="flex-1">Market</span>
          <span className="w-14 text-right">Time</span>
          <span className="w-20 text-right">Amount</span>
        </div>
      )}

      {/* Scrollable feed */}
      <div className="flex-1 overflow-y-auto min-h-0 bg-transparent">
        {tab === "predictions" && (
          trades.length === 0 && positions.length === 0 ? (
            <div className="flex items-center justify-center h-full text-zinc-600 text-[11px] font-mono">
              Waiting for activity...
            </div>
          ) : (
            <div className="divide-y divide-zinc-800/40">
              {positions.map((pos, i) => (
                <PositionRow key={`pos-${pos.condition_id}-${i}`} pos={pos} t={t} />
              ))}
              {trades.map((trade, i) => (
                <TradeRow key={`trade-${trade.ts}-${i}`} trade={trade} t={t} />
              ))}
            </div>
          )
        )}

        {tab === "tokens" && (
          <Markets />
        )}

        {tab === "search" && (
          filteredTrades.length === 0 && filteredPositions.length === 0 ? (
            <div className="flex items-center justify-center h-full text-zinc-600 text-[11px] font-mono">
              {searchQuery.trim() ? "No results found" : "Type to search trades & positions"}
            </div>
          ) : (
            <div className="divide-y divide-zinc-800/40">
              {filteredPositions.map((pos, i) => (
                <PositionRow key={`pos-${pos.condition_id}-${i}`} pos={pos} t={t} />
              ))}
              {filteredTrades.map((trade, i) => (
                <TradeRow key={`trade-${trade.ts}-${i}`} trade={trade} t={t} />
              ))}
            </div>
          )
        )}

        {tab === "positions" && (
          positions.length === 0 ? (
            <div className="flex items-center justify-center h-full text-zinc-600 text-[11px] font-mono">
              No open positions
            </div>
          ) : (
            <div className="divide-y divide-zinc-800/40">
              {positions.map((pos, i) => (
                <PositionRow key={`pos-${pos.condition_id}-${i}`} pos={pos} t={t} />
              ))}
            </div>
          )
        )}
      </div>
    </Panel>
  );
}

function NavTab({ active, onClick, icon, label }: {
  active: boolean;
  onClick: () => void;
  icon: React.ReactNode;
  label: string;
}) {
  return (
    <button
      onClick={onClick}
      className={`flex-1 flex items-center justify-center gap-1.5 px-3 py-1.5 rounded text-[10px] uppercase font-mono font-semibold tracking-wider transition-all ${
        active 
          ? "bg-emerald-500/10 text-emerald-400 border border-emerald-500/20" 
          : "text-zinc-500 border border-transparent hover:bg-zinc-800/50 hover:text-zinc-300"
      }`}
    >
      {icon}
      {label}
    </button>
  );
}
