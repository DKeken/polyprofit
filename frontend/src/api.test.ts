import { afterEach, describe, expect, it, vi } from "vitest";
import { ApiError, api } from "./api";

describe("api.updateConfig", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("throws backend validation messages as ApiError", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        new Response(JSON.stringify({ error: "assets list must not be empty" }), {
          status: 400,
          headers: { "Content-Type": "application/json" },
        }),
      ),
    );

    await expect(api.updateConfig({ assets: [] })).rejects.toMatchObject({
      name: "ApiError",
      message: "assets list must not be empty",
      status: 400,
    } satisfies Partial<ApiError>);
  });

  it("returns updated config payload on success", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        new Response(
          JSON.stringify({
            status: "updated",
            changes: ["min_edge: 0.07"],
            config: {
              min_edge: "0.07",
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
              assets: ["BTC"],
              known_assets: ["BTC"],
              asset_definitions: [
                {
                  symbol: "BTC",
                  binance_symbol: "BTCUSDT",
                  keywords: ["btc"],
                },
              ],
            },
          }),
          {
            status: 200,
            headers: { "Content-Type": "application/json" },
          },
        ),
      ),
    );

    const res = await api.updateConfig({ min_edge: "0.07" });

    expect(res.status).toBe("updated");
    expect(res.config.min_edge).toBe("0.07");
    expect(res.config.assets).toEqual(["BTC"]);
  });
});
