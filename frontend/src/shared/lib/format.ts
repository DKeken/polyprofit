/** Shared formatting utilities — no business logic, no imports from higher layers. */

export function fmtUsd(value: number, decimals = 2): string {
  return value.toLocaleString(undefined, {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  });
}

export function fmtPct(value: number, decimals = 1): string {
  return `${(value * 100).toFixed(decimals)}%`;
}

export function fmtPctRaw(value: number, decimals = 1): string {
  return `${(value * 100).toFixed(decimals)}%`;
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
