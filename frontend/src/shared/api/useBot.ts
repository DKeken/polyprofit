/**
 * Central hook for bot state via WebSocket + typed API layer.
 *
 * Types imported directly from Rust-generated bindings (ts-rs).
 * API calls go through the typed client in api.ts.
 */

import { useState, useEffect, useCallback, useRef } from "react";
import { api } from "./client";
import { useAppStore } from "../store/useAppStore";
import { fmtTimeSimple } from "../lib/format";

// ── Re-export Rust-generated types for component use ──
export type { Tick } from "@server-bindings/Tick";
export type { TradeInfo as Trade } from "@server-bindings/TradeInfo";
export type { PriceInfo } from "@server-bindings/PriceInfo";
export type { ConfigSnapshot as BotConfig } from "@server-bindings/ConfigSnapshot";
export type { PositionInfo } from "@server-bindings/PositionInfo";

import type { Tick } from "@server-bindings/Tick";

export interface PnlPoint {
  time: string;
  pnl: number;
}

export interface LogEntry {
  id: number;
  ts: string;
  type: 'EVAL' | 'EXEC' | 'FILL' | 'ERR' | 'SYS';
  msg: string;
}

const INITIAL: Tick = {
  daily_pnl: "0.00",
  total_pnl: "0.00",
  paused: false,
  heartbeat_alive: false,
  positions: 0,
  orders: 0,
  markets: 0,
  signals: 0,
  fills: 0,
  adverse: 0,
  reconnects: 0,
  trades: [],
  balance: "0.00",
  win_rate: 0,
  total_trades: 0,
  orders_placed: 0,
  orders_cancelled: 0,
  prices: {},
  config: {
    min_edge: "0.05",
    min_prob: "0.15",
    max_prob: "0.85",
    max_spread: "0.06",
    order_strategy: "Passive",
    market_refresh_secs: 60,
    daily_loss_limit: "-100",
    daily_profit_cap: "100000",
    max_position_pct: "0.05",
    max_concurrent: 50,
    drawdown_limit: "0.20",
    adverse_fill_pause: 3,
    assets: [],
    known_assets: [],
    asset_definitions: [],
  },
  drawdown_pct: 0,
  uptime_secs: 0,
  whale_events_count: 0,
  whale_alert_count: 0,
  open_positions: [],
};

const MAX_PNL_POINTS = 3600; // ~1 hour of 1s ticks — long history for equity curve

export function useBot() {
  const [tick, setTick] = useState<Tick>(INITIAL);
  const [connected, setConnected] = useState(false);
  const [pnlHistory, setPnlHistory] = useState<PnlPoint[]>([]);
  const [logEntries, setLogEntries] = useState<LogEntry[]>([]);
  const logIdRef = useRef(0);

  // Global store values
  const { dataPeriod } = useAppStore();

  // Load persisted PnL history on mount & when period changes
  useEffect(() => {
    let cancelled = false;
    api
      .pnlHistory(dataPeriod)
      .then((res) => {
        if (cancelled) return;
        if (res.points.length > 0) {
          const initial: PnlPoint[] = res.points.map((p) => {
            const dt = new Date(p.time);
            return {
              time: isNaN(dt.getTime())
                ? p.time
                : fmtTimeSimple(p.time),
              pnl: parseFloat(p.pnl) || 0,
            };
          });
          setPnlHistory(initial);
        } else {
          setPnlHistory([]);
        }
      })
      .catch(() => {
        /* ignore — old backend without this endpoint */
      });
      return () => { cancelled = true; };
  }, [dataPeriod]);

  useEffect(() => {
    let ws: WebSocket | null = null;
    let timer: ReturnType<typeof setTimeout> | null = null;
    let stopped = false;
    let delay = 1000;
    let lastPointTime = 0;

    function tradeToLogEntry(trade: Tick["trades"][number]): LogEntry | null {
      const pnl = trade.pnl ? parseFloat(trade.pnl) : null;
      const ts = fmtTimeSimple(new Date().toISOString());
      if (trade.adverse) {
        return { id: logIdRef.current++, ts, type: 'ERR', msg: `Adverse fill: ${trade.market?.slice(0, 40)}` };
      }
      if (pnl !== null && pnl !== 0) {
        const sign = pnl > 0 ? '+' : '';
        return { id: logIdRef.current++, ts, type: 'FILL', msg: `${sign}$${pnl.toFixed(2)} // ${trade.side} ${trade.market?.slice(0, 30)}` };
      }
      if (trade.market) {
        return { id: logIdRef.current++, ts, type: 'EXEC', msg: `$${trade.size ?? '?'} — ${trade.market?.slice(0, 35)} // ${trade.side}` };
      }
      return null;
    }

    function connect() {
      if (stopped) return;
      const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
      const url = `${protocol}//${window.location.host}/ws`;

      ws = new WebSocket(url);
      ws.onopen = () => {
        setConnected(true);
        delay = 1000;
      };
      ws.onmessage = (ev) => {
        try {
          const data = JSON.parse(ev.data) as Tick;
          setTick(data);
          
          setPnlHistory((prev) => {
            const currentPnl = parseFloat(data.total_pnl) || 0;
            const now = Date.now();
            const lastPnl = prev.length > 0 ? prev[prev.length - 1].pnl : null;
            
            // Limit point addition: only if pnl changed, or every 10 seconds
            if (lastPnl === currentPnl && now - lastPointTime < 10000) {
              return prev;
            }
            
            lastPointTime = now;
            
            const point: PnlPoint = {
              time: fmtTimeSimple(new Date().toISOString()),
              pnl: currentPnl,
            };
            const next = [...prev, point];
            return next.length > MAX_PNL_POINTS
              ? next.slice(-MAX_PNL_POINTS)
              : next;
          });

          // Generate execution log entries from new trades
          if (data.trades?.length) {
            const newLogs = data.trades.slice(0, 5)
              .map((t) => tradeToLogEntry(t))
              .filter((e): e is LogEntry => e !== null);
            if (newLogs.length) {
              setLogEntries(prev => {
                const next = [...prev, ...newLogs];
                return next.length > 200 ? next.slice(-200) : next;
              });
            }
          }
        } catch {
          /* ignore */
        }
      };
      ws.onclose = () => {
        setConnected(false);
        if (!stopped) {
          timer = setTimeout(connect, delay);
          delay = Math.min(delay * 2, 10_000);
        }
      };
      ws.onerror = () => ws?.close();
    }

    connect();
    return () => {
      stopped = true;
      ws?.close();
      if (timer) clearTimeout(timer);
    };
  }, []);

  const pause = useCallback(() => api.pause(), []);
  const resume = useCallback(() => api.resume(), []);

  const kill = useCallback(async () => {
    if (!window.confirm("KILL SWITCH: Cancel all orders and pause bot?"))
      return;
    await api.kill();
  }, []);

  const updateConfig = useCallback(async (updates: Record<string, unknown>) => {
    const res = await api.updateConfig(updates);
    setTick((prev) => ({ ...prev, config: res.config }));
    return res;
  }, []);

  return { tick, connected, pnlHistory, logEntries, pause, resume, kill, updateConfig };
}
