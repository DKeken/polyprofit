/**
 * Central hook for bot state via WebSocket + typed API layer.
 *
 * Types imported directly from Rust-generated bindings (ts-rs).
 * API calls go through the typed client in api.ts.
 */

import { useState, useEffect, useCallback } from "react";
import { api } from "../api";

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

const INITIAL: Tick = {
  daily_pnl: "0.00",
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
  mode: "Demo",
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
  },
  drawdown_pct: 0,
  uptime_secs: 0,
  open_positions: [],
};

const MAX_PNL_POINTS = 120; // ~2 min of 1s ticks

export function useBot() {
  const [tick, setTick] = useState<Tick>(INITIAL);
  const [connected, setConnected] = useState(false);
  const [pnlHistory, setPnlHistory] = useState<PnlPoint[]>([]);

  useEffect(() => {
    let ws: WebSocket | null = null;
    let timer: ReturnType<typeof setTimeout> | null = null;
    let stopped = false;

    function connect() {
      if (stopped) return;
      const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
      const url = `${protocol}//${window.location.host}/ws`;

      ws = new WebSocket(url);
      ws.onopen = () => setConnected(true);
      ws.onmessage = (ev) => {
        try {
          const data = JSON.parse(ev.data) as Tick;
          setTick(data);
          setPnlHistory((prev) => {
            const point: PnlPoint = {
              time: new Date().toLocaleTimeString([], {
                hour: "2-digit",
                minute: "2-digit",
                second: "2-digit",
              }),
              pnl: parseFloat(data.daily_pnl) || 0,
            };
            const next = [...prev, point];
            return next.length > MAX_PNL_POINTS
              ? next.slice(-MAX_PNL_POINTS)
              : next;
          });
        } catch {
          /* ignore */
        }
      };
      ws.onclose = () => {
        setConnected(false);
        if (!stopped) timer = setTimeout(connect, 2000);
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
    if (!window.confirm("KILL SWITCH: Cancel all orders and pause bot?")) return;
    await api.kill();
  }, []);

  const updateConfig = useCallback(
    (updates: Record<string, string | number>) => api.updateConfig(updates),
    [],
  );

  return { tick, connected, pnlHistory, pause, resume, kill, updateConfig };
}
