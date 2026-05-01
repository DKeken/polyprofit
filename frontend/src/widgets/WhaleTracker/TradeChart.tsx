import { memo, useState, useCallback, useRef, useEffect, useMemo } from "react";
import {
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  BarChart,
  Bar,
  CartesianGrid,
  LineChart,
  Line,
  ReferenceLine,
  Legend,
} from "recharts";
import type { ChartPoint, ChartMode } from "./types";
import { buyLabel } from "./types";
import { TradeTooltip } from "./TradeTooltip";
import { fmtUsd } from "../../shared/lib/format";
import { Spinner } from "../../shared/ui";

interface TradeChartProps {
  chartData: ChartPoint[];
  histLoading: boolean;
  histError: string | null;
  onRetry: () => void;
  totalTrades: number;
}

// ── Custom Legend ────────────────────────────────────────────────────────

const ChartLegend = memo(function ChartLegend() {
  return (
    <div className="flex gap-4 items-center justify-end text-[10px] font-mono text-zinc-500 shrink-0 pr-1">
      <span className="flex items-center gap-1">
        <span className="inline-block w-2 h-2 rounded-sm bg-emerald-400/80" />{" "}
        BUY
      </span>
      <span className="flex items-center gap-1">
        <span className="inline-block w-2 h-2 rounded-sm bg-rose-400/80" />{" "}
        SELL
      </span>
    </div>
  );
});

// ── Bar shape with built-in color — avoids per-bar <Cell> components ────

function ColoredBar(props: Record<string, unknown>) {
  const { x, y, width, height, payload } = props as {
    x: number;
    y: number;
    width: number;
    height: number;
    payload: ChartPoint;
  };
  const isBuy = buyLabel(payload.side);
  return (
    <rect
      x={x}
      y={y}
      width={width}
      height={height}
      rx={2}
      ry={2}
      fill={isBuy ? "#34d39999" : "#fb718599"}
      stroke={isBuy ? "#34d399" : "#fb7185"}
      strokeWidth={1}
    />
  );
}

// ── Axis tick config (stable objects) ────────────────────────────────────

const AXIS_TICK = {
  fontSize: 9,
  fontFamily: "monospace",
  fill: "#52525b",
} as const;

const CHART_MARGIN = { top: 4, right: 4, left: 4, bottom: 0 } as const;

// ── Debounced chart container ───────────────────────────────────────────

function DebouncedChartContainer({
  children,
}: {
  children: React.ReactNode;
}) {
  const wrapperRef = useRef<HTMLDivElement>(null);
  const [dims, setDims] = useState({ width: 0, height: 0 });
  const timerRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  useEffect(() => {
    const el = wrapperRef.current;
    if (!el) return;

    const measure = () => {
      const rect = el.getBoundingClientRect();
      setDims({ width: Math.floor(rect.width), height: Math.floor(rect.height) });
    };

    // Initial measure
    measure();

    const ro = new ResizeObserver(() => {
      clearTimeout(timerRef.current);
      timerRef.current = setTimeout(measure, 150);
    });
    ro.observe(el);

    return () => {
      ro.disconnect();
      clearTimeout(timerRef.current);
    };
  }, []);

  return (
    <div ref={wrapperRef} style={{ width: "100%", height: "100%" }}>
      {dims.width > 0 && dims.height > 0 && (
        <svg width={0} height={0} style={{ position: "absolute" }}>
          {/* Force recharts to use our measured size */}
        </svg>
      )}
      {dims.width > 0 && dims.height > 0 ? (
        <ResponsiveContainer width="100%" height="100%">
          {children as React.ReactElement}
        </ResponsiveContainer>
      ) : null}
    </div>
  );
}

// ── Y-axis formatter (stable ref) ──────────────────────────────────────

const yAxisFormatter = (val: number) => `$${fmtUsd(val, 0)}`;

// ── Tooltip renderer (stable ref) ──────────────────────────────────────

// Recharts' TooltipContentProps changes between versions; we accept the
// generic shape and trust the runtime payload contract since `dataKey`
// is fixed for our chart.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const tooltipContent = (props: any) => (
  <TradeTooltip active={props.active} payload={props.payload as ReadonlyArray<{ payload: ChartPoint }> | undefined} />
);

// ── Main component ─────────────────────────────────────────────────────

export const TradeChart = memo(function TradeChart({
  chartData,
  histLoading,
  histError,
  onRetry,
  totalTrades,
}: TradeChartProps) {
  const [chartMode, setChartMode] = useState<ChartMode>("bar");
  const [showAll, setShowAll] = useState(false);

  const visibleData = useMemo(
    () => (showAll ? chartData : chartData.slice(-30)),
    [chartData, showAll],
  );

  const handleModeSwitch = useCallback((mode: ChartMode) => {
    setChartMode(mode);
  }, []);

  return (
    <div className="shrink-0 bg-zinc-900/40 border border-zinc-800/60 rounded-xl p-4 flex flex-col gap-3">
      <div className="flex items-center justify-between gap-2">
        <div>
          <h3 className="text-xs font-mono font-semibold text-zinc-300 uppercase tracking-widest">
            Trade Activity
          </h3>
          {!histLoading && (
            <p className="text-[10px] text-zinc-600 font-mono mt-0.5">
              {totalTrades} trades total · {visibleData.length} shown
            </p>
          )}
        </div>
        <div className="flex items-center gap-2">
          <div className="flex rounded-md overflow-hidden border border-zinc-800">
            {(["bar", "cumulative"] as ChartMode[]).map((mode) => (
              <button
                key={mode}
                onClick={() => handleModeSwitch(mode)}
                className={`px-2.5 py-1 text-[10px] font-mono uppercase tracking-wide transition-colors ${
                  chartMode === mode
                    ? "bg-emerald-600 text-white"
                    : "text-zinc-500 hover:text-zinc-300 hover:bg-zinc-800"
                }`}
              >
                {mode === "bar" ? "Trades" : "Cumulative"}
              </button>
            ))}
          </div>
        </div>
      </div>

      {histLoading ? (
        <div className="h-48 flex items-center justify-center">
          <div className="flex gap-1.5 items-center text-zinc-600 text-xs font-mono">
            <Spinner size="xs" label="Loading history" /> Loading history…
          </div>
        </div>
      ) : histError ? (
        <div className="h-48 flex flex-col items-center justify-center gap-2 text-xs font-mono">
          <div className="text-rose-400">⚠ {histError}</div>
          <button
            onClick={onRetry}
            className="text-zinc-500 hover:text-zinc-300 underline text-[10px]"
          >
            Retry
          </button>
        </div>
      ) : visibleData.length === 0 ? (
        <div className="h-48 flex flex-col items-center justify-center gap-2 border border-dashed border-zinc-800/60 rounded-lg">
          <div className="text-2xl">📊</div>
          <div className="text-xs font-mono text-zinc-600">
            No trades recorded yet.
          </div>
        </div>
      ) : (
        <>
          <ChartLegend />
          <div style={{ height: 220 }}>
            <DebouncedChartContainer>
              {chartMode === "bar" ? (
                <BarChart
                  data={visibleData}
                  margin={CHART_MARGIN}
                  barCategoryGap="30%"
                >
                  <CartesianGrid
                    strokeDasharray="3 3"
                    stroke="#27272a"
                    vertical={false}
                  />
                  <XAxis
                    dataKey="time"
                    tick={AXIS_TICK}
                    tickLine={false}
                    axisLine={false}
                    interval="preserveStartEnd"
                  />
                  <YAxis
                    tickFormatter={yAxisFormatter}
                    tick={AXIS_TICK}
                    tickLine={false}
                    axisLine={false}
                    width={56}
                  />
                  <Tooltip
                    content={tooltipContent}
                    cursor={{ fill: "#27272a60" }}
                  />
                  <Bar
                    dataKey="amount"
                    maxBarSize={32}
                    shape={<ColoredBar />}
                  />
                </BarChart>
              ) : (
                <LineChart
                  data={visibleData}
                  margin={CHART_MARGIN}
                >
                  <CartesianGrid
                    strokeDasharray="3 3"
                    stroke="#27272a"
                    vertical={false}
                  />
                  <XAxis
                    dataKey="time"
                    tick={AXIS_TICK}
                    tickLine={false}
                    axisLine={false}
                    interval="preserveStartEnd"
                  />
                  <YAxis
                    tickFormatter={yAxisFormatter}
                    tick={AXIS_TICK}
                    tickLine={false}
                    axisLine={false}
                    width={56}
                  />
                  <Tooltip content={tooltipContent} />
                  <ReferenceLine
                    y={0}
                    stroke="#3f3f46"
                    strokeDasharray="4 2"
                  />
                  <Line
                    type="monotone"
                    dataKey="cumulative"
                    stroke="#a78bfa"
                    strokeWidth={2}
                    dot={false}
                    activeDot={{ r: 4, fill: "#a78bfa" }}
                  />
                  <Legend
                    content={() => (
                      <div className="text-[10px] font-mono text-violet-400 text-center mt-1">
                        Cumulative net USDC exposure (BUY − SELL)
                      </div>
                    )}
                  />
                </LineChart>
              )}
            </DebouncedChartContainer>
          </div>
          {!showAll && chartData.length > 30 && (
            <button
              onClick={() => setShowAll(true)}
              className="text-[10px] font-mono text-zinc-500 hover:text-emerald-400 transition-colors self-center"
            >
              Show all {chartData.length} trades →
            </button>
          )}
        </>
      )}
    </div>
  );
});
