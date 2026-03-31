import type { PriceInfo } from "../hooks/useBot";

const ASSET_ORDER = ["BTC", "ETH", "SOL", "XRP"];

function lagColor(lag: number): string {
  if (lag < 0) return "bg-zinc-600";
  if (lag < 30) return "bg-emerald-400";
  if (lag < 60) return "bg-yellow-400";
  return "bg-red-400";
}

function lagText(lag: number): string {
  if (lag < 0) return "—";
  return `${lag}s`;
}

interface Props {
  prices: Record<string, PriceInfo>;
}

export default function PriceMonitor({ prices }: Props) {
  const entries = ASSET_ORDER
    .filter((a) => a in prices)
    .map((a) => [a, prices[a]] as const);

  if (entries.length === 0) {
    return (
      <div className="bg-zinc-900 rounded-lg border border-zinc-800 p-4 mb-6">
        <h2 className="text-sm text-zinc-400 uppercase tracking-wider mb-3">
          Prices
        </h2>
        <div className="text-zinc-600 text-sm py-4 text-center">
          Waiting for price feeds…
        </div>
      </div>
    );
  }

  return (
    <div className="bg-zinc-900 rounded-lg border border-zinc-800 p-4 mb-6">
      <h2 className="text-sm text-zinc-400 uppercase tracking-wider mb-3">
        Prices
      </h2>
      <div className="space-y-2">
        {entries.map(([asset, info]) => {
          const binance = parseFloat(info.binance);
          const formatted =
            binance >= 100
              ? `$${binance.toLocaleString(undefined, { maximumFractionDigits: 0 })}`
              : `$${binance.toFixed(2)}`;

          return (
            <div
              key={asset}
              className="flex items-center justify-between py-1.5"
            >
              <span className="text-zinc-300 font-medium text-sm w-12">
                {asset}
              </span>
              <span className="mono text-sm text-zinc-100 flex-1 text-right mr-4">
                {formatted}
              </span>
              <span className="mono text-xs text-zinc-400 w-12 text-right mr-3">
                lag: {lagText(info.lag_secs)}
              </span>
              <div
                className={`w-2 h-2 rounded-full ${lagColor(info.lag_secs)}`}
              />
            </div>
          );
        })}
      </div>
    </div>
  );
}
