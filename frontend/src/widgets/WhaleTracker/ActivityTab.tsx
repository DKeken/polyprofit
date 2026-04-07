import { memo, useState, useMemo } from "react";
import { useLocation } from "wouter";
import type { WhaleEventRow } from "./types";
import { fmtUsd, shortenAddress } from "../../shared/lib/format";
import { Panel, EmptyState, Badge, Input, Select } from "../../shared/ui";
import { ExternalLink, User } from "lucide-react";

// ── Activity Row ──────────────────────────────────────────────────────────────

const ActivityRow = memo(function ActivityRow({
  event,
}: {
  event: WhaleEventRow;
}) {
  const [, setLocation] = useLocation();
  const [navigating, setNavigating] = useState(false);

  const amount = parseFloat(event.amount) || 0;
  const price = parseFloat(event.price) || 0;
  const isBuy = event.side.toUpperCase().includes("BUY");
  const ts = new Date(event.timestamp);

  async function handleMarketClick(e: React.MouseEvent) {
    e.preventDefault();
    if (navigating || !event.condition_id) return;
    setNavigating(true);
    try {
      const res = await fetch(`/api/whales/slug/${event.condition_id}`);
      const data = await res.json();
      if (data && data.slug) {
        window.open(`https://polymarket.com/event/${data.slug}`, "_blank");
      } else {
        window.open(`https://polymarket.com/markets`, "_blank");
      }
    } catch (err) {
      console.error("Failed to resolve market slug", err);
      window.open(`https://polymarket.com/markets`, "_blank");
    } finally {
      setNavigating(false);
    }
  }

  return (
    <div className="py-2 px-3 hover:bg-zinc-800/20 transition-colors group">
      <div className="flex items-center justify-between gap-2">
        <Badge color={isBuy ? "emerald" : "red"}>{event.side}</Badge>
        <span className="text-[10px] font-mono text-zinc-300 font-semibold">
          ${fmtUsd(amount, 0)}
        </span>
        <span className="text-[10px] font-mono text-zinc-500">
          @{price.toFixed(3)}
        </span>
        <span className="text-[9px] font-mono text-zinc-600 ml-auto flex items-center gap-2">
          {ts.toLocaleTimeString([], {
            hour: "2-digit",
            minute: "2-digit",
          })}
        </span>
      </div>
      {event.question && (
        <a
          href={`https://polymarket.com/event/${event.condition_id}`}
          onClick={handleMarketClick}
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-center gap-1.5 text-[9px] font-mono text-zinc-500 hover:text-emerald-400 transition-colors mt-0.5 truncate"
          title="View on Polymarket"
        >
          <span className="truncate">{event.question}</span>
          {navigating ? (
            <span className="inline-block w-2.5 h-2.5 border-2 border-emerald-400/40 border-t-emerald-400 rounded-full animate-spin shrink-0" />
          ) : (
            <ExternalLink className="w-2.5 h-2.5 shrink-0 opacity-0 group-hover:opacity-100 transition-opacity" />
          )}
        </a>
      )}
      <div className="flex items-center gap-1.5 mt-1">
        <button
          onClick={() => setLocation(`/whales/${event.address}`)}
          className="flex items-center gap-1 text-[9px] font-mono text-zinc-700 hover:text-emerald-400 transition-colors"
          title="View Whale Profile"
        >
          <User className="w-2.5 h-2.5" />
          {shortenAddress(event.address)}
        </button>
        <span className="text-[9px] font-mono text-zinc-700">
          · {event.platform}
        </span>
      </div>
    </div>
  );
});

// ── Activity Tab ──────────────────────────────────────────────────────────────

export const ActivityTab = memo(function ActivityTab({
  events,
}: {
  events: WhaleEventRow[];
}) {
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
              <ActivityRow key={`${e.condition_id}-${e.timestamp}-${i}`} event={e} />
            ))}
          </div>
        )}
      </Panel>
    </div>
  );
});
