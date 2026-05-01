PolyProfit = Rust workspace + React/Vite frontend, multi-venue trading bot.

## Layout
- 11 Rust crates: pp-core, pp-feeds, pp-discovery, pp-strategy, pp-execution, pp-risk, pp-server, pp-whales, pp-wallet, pp-venue, pp-venue-polymarket
- Frontend `frontend/` — Bun 1.3 + Vite 8 + React 19 + Tailwind 4 + Recharts + Zustand + wouter + **Playwright e2e**
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
e2e/                        # Playwright smoke tests (smoke.spec.ts, fixtures.ts)
playwright.config.ts
```

## Polymarket venue adapter (`pp-venue-polymarket`)
- Wraps `pp_venue::Venue` trait around existing pp-execution + pp-discovery code
- `place_order` → `pp_execution::orders::execute`
- `cancel_order` / `cancel_all` → SDK cancel + state cleanup
- `discover_markets` → `pp_discovery::discover` + clones state.markets
- `positions` → reads in-memory state.positions
- `heartbeat_alive` → SDK `heartbeats_active()`
- **`balances` ✅ wired** — fetches MATIC + USDC.e + native USDC via `pp_wallet::polygon::*`
- 2 unit tests pass

## pp-wallet polygon module
- `pp_wallet::polygon` — extracted from `pp-server::api::admin`
- `fetch_matic_balance(addr) -> f64`, `fetch_erc20_balance(token, wallet, decimals) -> f64`
- `fetch_usdc_balance(addr) -> f64` (combines USDC.e + native USDC)
- Constants: POLYGON_RPC, USDC_E_ADDRESS, USDC_NATIVE_ADDRESS
- 2 unit tests (constants shape, balanceOf calldata layout)

## pp-execution pure helpers
- `maker_quote(side, size_usdc, best_bid, best_ask) -> (price, shares)` — extracted from `place_maker_order`
- `taker_fill_price(side, best_bid, best_ask) -> Decimal` — extracted from `place_market_order`
- 8 new unit tests covering Yes/No paths, edge bids/asks, zero-share rejection

## Tests (`make verify` exit 0)
| Layer | Count |
|---|---|
| cargo test --workspace | **122** (23 suites) |
| bun test (frontend unit) | **89** (21 files) |
| Playwright e2e (chromium) | **3** |
| **Total** | **214** |

Frontend unit breakdown:
- shared/lib/format: 8
- shared/api/client: 2
- shared/ui {Button,IconButton,Stat,Badge,Card,Modal,Tabs,Skeleton,Spinner,EmptyState}: 44
- entities/{trade,market,position,whale}: 22
- features/{settings-form: 2, markets-list: 3}: 5
- widgets/{execution-log: 4, equity-curve: 3, trade-feed: 4}: 11

Playwright smoke:
- app boots + renders nav
- markets page lists mocked markets
- dashboard renders without crashing

## SDK (Polymarket)
- Crate alias `polymarket_sdk` = `polymarket_client_sdk_v2 = "0.5"`
- Auto-detects exchange protocol via GET /version
- Heartbeats via SDK feature flag

## Verify (`make verify` exit 0)
- `cargo build --workspace` ✅
- `cargo test --workspace` ✅ 122
- `cargo clippy --workspace --all-targets -- -D warnings` ✅ 0 warnings
- frontend `bun run lint` ✅
- frontend `bun run test` ✅ 89  *(uses `bun test src` — bunfig has no `root` field)*
- frontend `bun run build` ✅
- frontend `bun run e2e` ✅ 3 (separate, not in make verify)

## Hosts (May 2026)
- CLOB: `https://clob.polymarket.com`
- Gamma: `https://gamma-api.polymarket.com`
- Data: `https://data-api.polymarket.com`
- RTDS WS: `wss://ws-live-data.polymarket.com`
- Orderbook WS: `wss://ws-subscriptions-clob.polymarket.com/ws/market`

## .todo/ (20 files)
- 00_PLAN.md, saas-migration.md (deferred)
- pp-* per-crate plans, pp-venue-* impl plans, frontend.md, main.rs.md, config.toml.md, docs.md
