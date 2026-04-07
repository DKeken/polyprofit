/** Shared formatting utilities — no business logic, no imports from higher layers. */
import type { Language, TimezoneMode } from "../store/useAppStore";

export function fmtUsd(value: number, decimals = 2): string {
  return value.toLocaleString("en-US", {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  });
}

export function fmtPct(value: number, decimals = 1): string {
  return `${(value * 100).toFixed(decimals)}%`;
}

export function formatDuration(secs: number | undefined): string {
  if (secs === undefined || secs < 0) return "0s";
  if (secs < 60) return `${Math.floor(secs)}s`;
  const m = Math.floor(secs / 60);
  if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60);
  const min = m % 60;
  if (h < 24) return min > 0 ? `${h}h ${min}m` : `${h}h`;
  const d = Math.floor(h / 24);
  return `${d}d ${h % 24}h`;
}

export function fmtTimeSimple(dateStr: string): string {
  const d = new Date(dateStr);
  if (isNaN(d.getTime())) return dateStr;
  return d.toLocaleTimeString("en-US", {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
}

export function isBuySide(side: string): boolean {
  return side === "YES" || side === "Yes" || side === "Buy";
}

export function shortenAddress(addr: string, chars = 6): string {
  if (addr.length <= chars * 2 + 2) return addr;
  return `${addr.slice(0, chars)}…${addr.slice(-chars)}`;
}

export function pnlColor(value: number): string {
  return value >= 0 ? "text-emerald-400" : "text-red-400";
}

export function pnlSign(value: number): string {
  return value >= 0 ? "+" : "";
}

export function fmtPnl(value: number, decimals = 2): string {
  return `${pnlSign(value)}$${fmtUsd(Math.abs(value), decimals)}`;
}

export function fmtPnl(value: number, decimals = 2): string {
  return `${pnlSign(value)}$${fmtUsd(Math.abs(value), decimals)}`;
}

export function fmtTime(dateStr: string, lang: Language, tz: TimezoneMode): string {
  const d = new Date(dateStr);
  if (isNaN(d.getTime())) return dateStr;
  
  return d.toLocaleTimeString(lang === "ru" ? "ru-RU" : "en-US", {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    timeZone: tz === "utc" ? "UTC" : undefined,
  });
}

export function fmtDateTime(dateStr: string, lang: Language, tz: TimezoneMode): string {
  const d = new Date(dateStr);
  if (isNaN(d.getTime())) return dateStr;

  return d.toLocaleString(lang === "ru" ? "ru-RU" : "en-US", {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: tz === "utc" ? "UTC" : undefined,
  });
}
