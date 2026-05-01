import { AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, ReferenceLine } from "recharts";
import { useAppStore } from "../../shared/store/useAppStore";
import { buildTranslator } from "../../shared/lib/i18n";
interface PnlPoint {
  time: string;
  pnl: number;
}

export default function EquityCurve({ data }: { data: PnlPoint[] }) {
  const { dataPeriod, language } = useAppStore();
  const t = buildTranslator(language);

  const hasData = data.length > 1;
  const latest = hasData ? data[data.length - 1] : null;
  const isPositive = latest ? latest.pnl >= 0 : true;
  const strokeColor = isPositive ? "#34d399" : "#f87171";

  return (
    <div className="h-full flex flex-col pt-1">
      {/* Header */}
      <div className="shrink-0 flex items-center justify-between px-4 py-2 bg-zinc-900/40 border-b border-zinc-800/60 flex-row">
        <div className="text-[11px] font-mono font-semibold uppercase tracking-widest text-zinc-300">
          {t("equityCurve")}
        </div>
        <div className="flex items-center gap-2 text-[10px] font-mono text-zinc-600 bg-zinc-800/40 px-2 py-0.5 rounded uppercase">
          <span>{dataPeriod}</span>
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
          <div className="h-full flex items-center justify-center text-zinc-600 text-[11px] font-mono">
            Waiting for data...
          </div>
        )}
      </div>
    </div>
  );
}
