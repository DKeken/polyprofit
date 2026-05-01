import { test, expect } from "@playwright/test";
import { mockBackend } from "./fixtures";

test.describe("smoke", () => {
  test.beforeEach(async ({ page }) => {
    await mockBackend(page);
  });

  test("app boots + renders nav", async ({ page }) => {
    await page.goto("/");
    // top-nav links rendered by App.tsx
    await expect(page.getByRole("link", { name: "Dashboard" })).toBeVisible();
    await expect(page.getByRole("link", { name: "Whales" })).toBeVisible();
    await expect(page.getByRole("link", { name: "Markets" })).toBeVisible();
  });

  test("markets page lists mocked markets", async ({ page }) => {
    await page.goto("/markets");
    await expect(
      page.getByText("Will BTC be above $200k by year-end?"),
    ).toBeVisible();
    await expect(page.getByText("ETH above $5000?")).toBeVisible();
  });

  test("dashboard renders without crashing", async ({ page }) => {
    await page.goto("/");
    // Dashboard widgets show "Waiting" copy when there's no live data
    // (WS is unmocked and falls back to INITIAL state).
    const body = page.locator("body");
    await expect(body).toBeVisible();
    // No React error boundary text leaked into the DOM
    await expect(page.getByText("Something went wrong")).toHaveCount(0);
  });
});
