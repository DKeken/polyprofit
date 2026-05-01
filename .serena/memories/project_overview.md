PolyProfit = Rust workspace + React/Vite frontend, multi-venue trading bot.

## Layout
- 11 Rust crates: pp-core, pp-feeds, pp-discovery, pp-strategy, pp-execution, pp-risk, pp-server, pp-whales, pp-wallet, pp-venue, **pp-venue-polymarket**
- Frontend `frontend/` — Bun 1.3 + Vite 8 + React 19 + Tailwind 4 + Recharts + Zustand + wouter
- DB: redb embedded
- Auth: alloy LocalSigner + Polymarket SDK
- Rust 1.95 nightly, edition 2024

## Frontend FSD layout
```
src/
├── App.tsx
├── pages/                  # DashboardPage, SettingsPage, WhalesPage, WalletPage
├── widgets/                # dashboard, equity-curve, execution-log, trade-feed, WhaleTracker
├── features/               # settings-form, markets-list
├── entities/               # trade, market, position, whale (each w/ helpers + tests)
├── shared/
│   ├── api/                # client.ts, useBot.ts, index.ts
│   ├── ui/                 # Design system (Panel, Button, IconButton, Stat, Badge,
│   │                          Card, Modal, Tabs, Skeleton, Spinner, Input, Select,
│   │                          Checkbox, EmptyState, ResizeDivider, ToastProvider)
│   ├── lib/                # format.ts, i18n.ts
│   ├── hooks/              # useSplitResize, useWhales, useScanStatus
│   └── store/              # useAppStore (zustand)
└── assets/
```

## Design system wired in
- All ad-hoc `border-2 border-... animate-spin` spans replaced with `<Spinner />` (WhaleTracker, RegistryTab, ActivityTab, ScanSettingsModal, TradeChart, WalletPage)
- `Loader2` from lucide replaced with `Spinner`
- markets-list loading placeholder uses `<Skeleton />`

## Polymarket venue adapter (`pp-venue-polymarket`)
- Stub crate that wraps `pp_venue::Venue` trait around existing pp-execution + pp-discovery code
- `PolymarketVenue::place_order` → delegates to `pp_execution::orders::execute`
- `cancel_order` / `cancel_all` → SDK cancel calls + state cleanup
- `discover_markets` → `pp_discovery::discover` + clones state.markets
- `positions` → reads in-memory state.positions
- `heartbeat_alive` → SDK `heartbeats_active()`
- `balances` → not wired yet (RPC plumbing in pp-server::api::admin to extract first)
- Compiles + passes its own unit test (`cargo test -p pp-venue-polymarket` 1 passed)

## Tests (`make verify` exit 0)
| Layer | Count | Δ |
|---|---|---|
| cargo test --workspace | **110** (23 suites) | +1 (PolymarketVenue trait check) |
| bun test (frontend) | **78** (18 files) | +3 (markets-list smoke) |
| **Total** | **188** | +4 |

Frontend test breakdown:
- shared/lib/format: 8
- shared/api/client: 2
- shared/ui {Button,IconButton,Stat,Badge,Card,Modal,Tabs,Skeleton,Spinner,EmptyState}: 44
- entities/{trade,market,position,whale}: 22
- features/settings-form/ui: 2 (existing)
- **features/markets-list/ui: 3 (NEW: render, asset-chip filter, free-text search)**

## SDK (Polymarket)
- Crate alias `polymarket_sdk` = `polymarket_client_sdk_v2 = "0.5"`
- Auto-detects exchange protocol via GET /version
- Heartbeats via SDK feature flag

## Verify (`make verify` exit 0)
- `cargo build --workspace` ✅
- `cargo test --workspace` ✅ 110
- `cargo clippy --workspace --all-targets` ✅ 0 warnings
- frontend `bun run lint` ✅
- frontend `bun test` ✅ 78
- frontend `bun run build` ✅

## Hosts (May 2026)
- CLOB: `https://clob.polymarket.com`
- Gamma: `https://gamma-api.polymarket.com`
- Data: `https://data-api.polymarket.com`
- RTDS WS: `wss://ws-live-data.polymarket.com`
- Orderbook WS: `wss://ws-subscriptions-clob.polymarket.com/ws/market`

## .todo/ (20 files)
- 00_PLAN.md, saas-migration.md (deferred)
- pp-* per-crate plans, pp-venue-* impl plans, frontend.md, main.rs.md, config.toml.md, docs.md
