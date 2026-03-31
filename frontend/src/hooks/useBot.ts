import { useState, useEffect, useCallback } from "react";

export interface Trade {
  side: string;
  price: string;
  size: string;
  pnl: string | null;
  adverse: boolean;
  ts: string;
  market: string;
}

export interface PriceInfo {
  binance: string;
  chainlink: string;
  lag_secs: number;
}

export interface PnlPoint {
  time: string;
  pnl: number;
}

export interface Tick {
  // Existing
  daily_pnl: string;
  paused: boolean;
  heartbeat_alive: boolean;
  positions: number;
  orders: number;
  markets: number;
  signals: number;
  fills: number;
  adverse: number;
  reconnects: number;
  trades: Trade[];

  // New
  balance: string;
  win_rate: number;
  total_trades: number;
  orders_placed: number;
  orders_cancelled: number;
  mode: string;
  prices: Record<string, PriceInfo>;
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
          const data = JSON.parse(ev.data);
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

  const pause = useCallback(async () => {
    await fetch("/api/pause", { method: "POST" });
  }, []);

  const resume = useCallback(async () => {
    await fetch("/api/resume", { method: "POST" });
  }, []);

  const kill = useCallback(async () => {
    if (!window.confirm("KILL SWITCH: Cancel all orders and pause bot?")) return;
    await fetch("/api/kill", { method: "POST" });
  }, []);

  return { tick, connected, pnlHistory, pause, resume, kill };
}
