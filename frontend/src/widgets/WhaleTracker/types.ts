import type { WhaleRow, WhaleEventRow } from "../../shared/hooks/useWhales";

export type { WhaleRow, WhaleEventRow };

export type SortKey =
  | "profit"
  | "roi"
  | "win_rate"
  | "volume"
  | "markets_traded"
  | "last_seen";

export type SortDir = "desc" | "asc";
export type ViewFilter = "active" | "archived" | "all";

export interface ChartPoint {
  time: string;
  amount: number;
  price: number;
  side: string;
  question: string | null;
  cumulative: number;
  pnl: number;
}

export type ChartMode = "bar" | "cumulative";

// ── Helpers ──────────────────────────────────────────────────────────────────

export function buyLabel(side: string): boolean {
  return side.toUpperCase().startsWith("BUY");
}

export function formatTime(iso: string): string {
  const d = new Date(iso);
  return (
    d.toLocaleDateString("en-US", { month: "short", day: "numeric" }) +
    " " +
    d.toLocaleTimeString("en-US", {
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    })
  );
}

export function buildChartData(trades: WhaleEventRow[]): ChartPoint[] {
  const sorted = [...trades].sort(
    (a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime(),
  );
  let cumulative = 0;
  return sorted.map((ev) => {
    const amount = parseFloat(ev.amount) || 0;
    const price = parseFloat(ev.price) || 0;
    const isBuy = buyLabel(ev.side);
    const pnl = isBuy ? amount : -amount;
    cumulative += pnl;
    return {
      time: formatTime(ev.timestamp),
      amount,
      price,
      side: ev.side,
      question: ev.question,
      cumulative,
      pnl,
    };
  });
}
