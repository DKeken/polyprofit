import { defineConfig, devices } from "@playwright/test";

/**
 * Playwright config — boots Vite dev server with API mocking via page.route.
 *
 * Run: `bun run e2e`
 *
 * Tests live in `./e2e/`. The dev server serves on port 5173; tests own a
 * single browser context and use `page.route('/api/**', ...)` to mock REST
 * responses. WebSocket traffic is left unmocked: the app falls back to the
 * `INITIAL` Tick state so smoke tests still pass.
 */
export default defineConfig({
  testDir: "./e2e",
  timeout: 30_000,
  fullyParallel: true,
  reporter: [["list"]],
  use: {
    baseURL: "http://127.0.0.1:5173",
    trace: "on-first-retry",
    screenshot: "only-on-failure",
  },
  webServer: {
    command: "bun run dev -- --port 5173 --strictPort",
    port: 5173,
    reuseExistingServer: !process.env.CI,
    timeout: 60_000,
  },
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
  ],
});
