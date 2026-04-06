import { AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, ReferenceLine } from "recharts";

interface PnlPoint {
  time: string;
  pnl: number;
}

export default function EquityCurve({ data }: { data: PnlPoint[] }) {
  const hasData = data.length > 1;
  const latest = hasData ? data[data.length - 1] : null;
  const isPositive = latest ? latest.pnl >= 0 : true;
  const strokeColor = isPositive ? "#34d399" : "#f87171";

  return (
    <div className="h-full flex flex-col border-b border-zinc-800/40">
      {/* Header */}
      <div className="shrink-0 flex items-center justify-between px-5 pt-3 pb-1">
        <div className="text-[10px] font-mono uppercase tracking-widest text-zinc-500">
          equity curve <span className="text-zinc-700 mx-1">//</span>
          <span className="text-zinc-400">btc arb</span>
        </div>
        <div className="flex items-center gap-3 text-[10px] font-mono text-zinc-600">
          <span>8.00</span>
          <span className="text-zinc-700">/</span>
          <span>All</span>
        </div>
      </div>

      {/* Chart */}
      <div className="flex-1 min-h-0">
        {hasData ? (
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={data} margin={{ top: 8, right: 16, bottom: 4, left: 4 }}>
              <defs>
                <linearGradient id="equityGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor={strokeColor} stopOpacity={0.25} />
                  <stop offset="40%" stopColor={strokeColor} stopOpacity={0.06} />
                  <stop offset="100%" stopColor={strokeColor} stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="#27272a30" vertical={false} />
              <XAxis
                dataKey="time"
                tick={{ fontSize: 9, fill: "#52525b", fontFamily: "JetBrains Mono" }}
                axisLine={{ stroke: "#27272a" }}
                tickLine={false}
                interval="preserveStartEnd"
              />
              <YAxis
                tick={{ fontSize: 9, fill: "#52525b", fontFamily: "JetBrains Mono" }}
                axisLine={false}
                tickLine={false}
                width={50}
                tickFormatter={(v: number) => `$${v >= 1000 ? `${(v / 1000).toFixed(1)}k` : v.toFixed(0)}`}
              />
              <Tooltip
                contentStyle={{
                  background: "rgba(24, 24, 27, 0.95)",
                  backdropFilter: "blur(8px)",
                  border: "1px solid #3f3f46",
                  borderRadius: 8,
                  fontSize: 11,
                  fontFamily: "JetBrains Mono, monospace",
                  padding: "6px 10px",
                }}
                labelStyle={{ color: "#71717a", fontSize: 9 }}
                formatter={
                  ((v: unknown) => [
                    `$${Number(v ?? 0).toFixed(2)}`,
                    "P&L",
                  ]) as never
                }
              />
              <ReferenceLine y={0} stroke="#3f3f4660" strokeDasharray="4 4" />
              <Area
                type="monotone"
                dataKey="pnl"
                stroke={strokeColor}
                strokeWidth={2}
                fill="url(#equityGrad)"
                dot={false}
                activeDot={{ r: 4, stroke: strokeColor, strokeWidth: 2, fill: "#09090b" }}
                isAnimationActive={false}
              />
            </AreaChart>
          </ResponsiveContainer>
        ) : (
          <div className="h-full flex items-center justify-center text-zinc-600 text-sm font-mono">
            Waiting for data...
          </div>
        )}
      </div>
    </div>
  );
}
