# Server — pp-server/

> Axum REST API + WebSocket live stream + serves React build.
> Минимальный API — только то что нужно дашборду.

---

## api.rs — REST endpoints

```rust
use axum::{Router, Json, extract::State as AxumState};
use tower_http::cors::CorsLayer;
use tower_http::services::ServeDir;
use pp_core::types::*;

type AppCtx = (Arc<RwLock<AppState>>, Arc<RwLock<Vec<Market>>>);

pub async fn run(
    state: Arc<RwLock<AppState>>,
    markets: Arc<RwLock<Vec<Market>>>,
    config: &Config,
) -> anyhow::Result<()> {
    let app = Router::new()
        .route("/api/status", axum::routing::get(get_status))
        .route("/api/positions", axum::routing::get(get_positions))
        .route("/api/trades", axum::routing::get(get_trades))
        .route("/api/control/pause", axum::routing::post(pause))
        .route("/api/control/resume", axum::routing::post(resume))
        .route("/ws", axum::routing::get(ws_handler))
        .fallback_service(ServeDir::new(&config.server.frontend_dist))
        .layer(CorsLayer::permissive())
        .with_state((state, markets));

    let addr = format!("0.0.0.0:{}", config.server.port);
    tracing::info!("Dashboard: http://{addr}");
    let listener = tokio::net::TcpListener::bind(&addr).await?;
    axum::serve(listener, app).await?;
    Ok(())
}

async fn get_status(AxumState((state, _)): AxumState<AppCtx>) -> Json<serde_json::Value> {
    let s = state.read().await;
    Json(serde_json::json!({
        "balance": s.balance,
        "daily_pnl": s.daily_pnl,
        "total_pnl": s.total_pnl,
        "win_rate": if s.trades > 0 { s.wins as f64 / s.trades as f64 } else { 0.0 },
        "trades": s.trades,
        "positions": s.positions.len(),
        "cycle": s.cycle,
        "mode": s.mode,
        "heartbeat": pp_execution::heartbeat::is_healthy(),
        "prices": {
            "binance": &s.prices.binance,
            "chainlink": &s.prices.chainlink,
        },
    }))
}

async fn get_positions(AxumState((state, _)): AxumState<AppCtx>) -> Json<serde_json::Value> {
    let s = state.read().await;
    Json(serde_json::json!(s.positions))
}

async fn get_trades(AxumState((state, _)): AxumState<AppCtx>) -> Json<serde_json::Value> {
    let s = state.read().await;
    // Последние 100 трейдов
    let recent: Vec<_> = s.log.iter().rev().take(100).collect();
    Json(serde_json::json!(recent))
}

async fn pause(AxumState((state, _)): AxumState<AppCtx>) -> &'static str {
    // TODO: access RiskManager to call .pause()
    "paused"
}

async fn resume(AxumState((state, _)): AxumState<AppCtx>) -> &'static str {
    "resumed"
}
```

---

## ws.rs — Live stream каждую секунду

```rust
use axum::extract::ws::{WebSocket, WebSocketUpgrade, Message};

async fn ws_handler(
    ws: WebSocketUpgrade,
    AxumState((state, _)): AxumState<AppCtx>,
) -> impl axum::response::IntoResponse {
    ws.on_upgrade(move |socket| stream(socket, state))
}

async fn stream(mut socket: WebSocket, state: Arc<RwLock<AppState>>) {
    let mut tick = tokio::time::interval(Duration::from_secs(1));
    let mut last_trade_idx = 0usize;

    loop {
        tick.tick().await;
        let s = state.read().await;

        let payload = serde_json::json!({
            "balance": s.balance,
            "daily_pnl": s.daily_pnl,
            "win_rate": if s.trades > 0 { s.wins as f64 / s.trades as f64 } else { 0.0 },
            "positions": s.positions.len(),
            "cycle": s.cycle,
            "heartbeat": pp_execution::heartbeat::is_healthy(),
            "new_trades": &s.log[last_trade_idx..],
            "prices": &s.prices,
        });

        last_trade_idx = s.log.len();
        drop(s);

        let msg = Message::Text(serde_json::to_string(&payload).unwrap());
        if socket.send(msg).await.is_err() {
            break; // клиент отключился
        }
    }
}
```

---

## React Dashboard — минималистичный как TON

> Дизайн-принципы и ASCII-мокап: [architecture.md → UI](../architecture.md#ui--минималистичный-dashboard)

### hooks/useBot.ts

```typescript
import { useState, useEffect, useRef } from "react";

interface Tick {
  balance: number;
  daily_pnl: number;
  win_rate: number;
  positions: number;
  cycle: number;
  heartbeat: boolean;
  new_trades: Trade[];
  prices: {
    binance: Record<string, { value: number }>;
    chainlink: Record<string, { value: number }>;
  };
}

interface Trade {
  ts: string;
  market: string;
  side: "Yes" | "No";
  price: number;
  edge: number;
  pnl: number | null;
}

export function useBot() {
  const [tick, setTick] = useState<Tick | null>(null);
  const [trades, setTrades] = useState<Trade[]>([]);
  const [equity, setEquity] = useState<{ t: number; v: number }[]>([]);
  const ws = useRef<WebSocket | null>(null);

  useEffect(() => {
    const connect = () => {
      ws.current = new WebSocket(`ws://${location.host}/ws`);
      ws.current.onmessage = (e) => {
        const d: Tick = JSON.parse(e.data);
        setTick(d);
        if (d.new_trades.length)
          setTrades((p) => [...d.new_trades, ...p].slice(0, 200));
        setEquity((p) => [...p, { t: Date.now(), v: d.balance }].slice(-3600));
      };
      ws.current.onclose = () => setTimeout(connect, 2000);
    };
    connect();
    return () => ws.current?.close();
  }, []);

  return { tick, trades, equity };
}
```

### Dashboard.tsx — один экран

```tsx
import { useBot } from "../hooks/useBot";
import { Area, AreaChart, ResponsiveContainer } from "recharts";

export function Dashboard() {
  const { tick, trades, equity } = useBot();
  if (!tick) return <Loader />;

  const pnlColor = tick.daily_pnl >= 0 ? "text-emerald-400" : "text-red-400";

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100 p-4 font-mono max-w-md mx-auto">
      {/* Balance + P&L */}
      <div className="text-center mb-6">
        <p className="text-3xl font-bold">${tick.balance.toFixed(2)}</p>
        <p className={`text-lg ${pnlColor}`}>
          {tick.daily_pnl >= 0 ? "+" : ""}
          {tick.daily_pnl.toFixed(2)} today
        </p>
      </div>

      {/* Win rate bar */}
      <div className="mb-4">
        <div className="flex justify-between text-xs text-zinc-500 mb-1">
          <span>Win Rate</span>
          <span>{(tick.win_rate * 100).toFixed(0)}%</span>
        </div>
        <div className="h-1.5 bg-zinc-800 rounded-full">
          <div
            className="h-full bg-emerald-500 rounded-full transition-all"
            style={{ width: `${tick.win_rate * 100}%` }}
          />
        </div>
      </div>

      {/* Equity sparkline */}
      <div className="h-24 mb-4">
        <ResponsiveContainer>
          <AreaChart data={equity}>
            <Area
              type="monotone"
              dataKey="v"
              stroke="#34d399"
              fill="#34d39920"
              strokeWidth={1.5}
              dot={false}
            />
          </AreaChart>
        </ResponsiveContainer>
      </div>

      {/* Prices */}
      {Object.entries(tick.prices.binance).map(([asset, bp]) => {
        const cp = tick.prices.chainlink[asset];
        const lag = cp
          ? (((bp.value - cp.value) / cp.value) * 100).toFixed(3)
          : "—";
        return (
          <div
            key={asset}
            className="flex justify-between py-1.5 border-b border-zinc-800/50"
          >
            <span className="text-zinc-400 uppercase text-sm">{asset}</span>
            <span className="text-sm">${bp.value.toFixed(0)}</span>
            <span
              className={`text-xs ${Number(lag) > 0 ? "text-emerald-400" : "text-red-400"}`}
            >
              {lag}%
            </span>
          </div>
        );
      })}

      {/* Recent trades */}
      <div className="mt-4">
        <p className="text-xs text-zinc-500 mb-2">Recent</p>
        {trades.slice(0, 5).map((t, i) => (
          <div
            key={i}
            className="flex justify-between text-xs py-1 border-b border-zinc-900"
          >
            <span className="text-zinc-500 truncate w-32">{t.market}</span>
            <span>{t.side}</span>
            <span
              className={
                t.pnl && t.pnl > 0 ? "text-emerald-400" : "text-red-400"
              }
            >
              {t.pnl ? `${t.pnl > 0 ? "+" : ""}${t.pnl.toFixed(2)}` : "..."}
            </span>
          </div>
        ))}
      </div>

      {/* Controls */}
      <div className="flex gap-3 mt-6">
        <button
          onClick={() => fetch("/api/control/pause", { method: "POST" })}
          className="flex-1 py-2 bg-zinc-800 rounded-lg text-zinc-300 text-sm hover:bg-zinc-700"
        >
          Pause
        </button>
        <button
          onClick={() => fetch("/api/control/resume", { method: "POST" })}
          className="flex-1 py-2 bg-emerald-900/30 border border-emerald-800 rounded-lg text-emerald-400 text-sm hover:bg-emerald-900/50"
        >
          Resume
        </button>
      </div>

      {/* Status bar */}
      <div className="flex justify-between text-[10px] text-zinc-600 mt-4">
        <span>#{tick.cycle}</span>
        <span>{tick.positions} pos</span>
        <span className={tick.heartbeat ? "text-emerald-600" : "text-red-500"}>
          {tick.heartbeat ? "♥" : "♥ DEAD"}
        </span>
      </div>
    </div>
  );
}

function Loader() {
  return (
    <div className="min-h-screen bg-zinc-950 flex items-center justify-center">
      <p className="text-zinc-600 text-sm animate-pulse">Connecting...</p>
    </div>
  );
}
```

### Frontend deps (package.json)

```json
{
  "name": "polyprofit-ui",
  "private": true,
  "scripts": {
    "dev": "vite",
    "build": "vite build"
  },
  "dependencies": {
    "react": "^19.0.0",
    "react-dom": "^19.0.0",
    "recharts": "^2.15.0"
  },
  "devDependencies": {
    "@vitejs/plugin-react": "^4.4.0",
    "autoprefixer": "^10.4.20",
    "postcss": "^8.5.0",
    "tailwindcss": "^4.0.0",
    "typescript": "^5.7.0",
    "vite": "^6.1.0"
  }
}
```

Минимум зависимостей: React 19, Recharts (equity curve), Tailwind 4, Vite 6. Без shadcn, без Lucide, без роутера.
