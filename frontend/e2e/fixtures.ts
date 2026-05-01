/**
 * Shared API mocks for e2e smoke flows.
 *
 * The frontend is read-only here: tests intercept /api/* responses but never
 * exercise pause/resume/kill. WS traffic is left to fall through; the app
 * treats a closed socket as "disconnected" and renders defaults.
 */

import type { Page } from "@playwright/test";

export async function mockBackend(page: Page) {
  await page.route("**/api/status", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        authenticated: false,
        wallet_address: null,
        paused: false,
        heartbeat_alive: false,
        daily_pnl: "0.00",
        active_positions: 0,
        active_orders: 0,
        active_markets: 0,
        signals_generated: 0,
        orders_placed: 0,
        orders_filled: 0,
        adverse_fills: 0,
        ws_reconnects: 0,
      }),
    }),
  );

  await page.route("**/api/markets", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        markets: [
          {
            condition_id: "0x01",
            asset: "BTC",
            kind: "UpDown",
            question: "Will BTC be above $200k by year-end?",
            strike: "200000",
            end_time: new Date(Date.now() + 86_400_000).toISOString(),
            active: true,
          },
          {
            condition_id: "0x02",
            asset: "ETH",
            kind: "Above",
            question: "ETH above $5000?",
            strike: "5000",
            end_time: new Date(Date.now() + 3600_000).toISOString(),
            active: true,
          },
        ],
      }),
    }),
  );

  await page.route("**/api/pnl-history**", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ points: [] }),
    }),
  );

  await page.route("**/api/wallet", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        address: "0x0000000000000000000000000000000000000000",
        matic_balance: "0.0000",
        usdc_balance: "0.00",
      }),
    }),
  );

  await page.route("**/api/db/stats", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ trades: 0, positions: 0, equity_points: 0 }),
    }),
  );
}
