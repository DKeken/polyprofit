import { describe, expect, it } from "bun:test";
import type { MarketInfo } from "../../shared/api";
import { marketEndsInSecs, marketIsExpired, marketsByAsset } from "./index";

const baseMarket = (over: Partial<MarketInfo> = {}): MarketInfo => ({
  condition_id: "c0",
  asset: "BTC",
  kind: "UpDown",
  question: "?",
  strike: null,
  end_time: new Date(Date.now() + 1000 * 60).toISOString(),
  active: true,
  ...over,
});

describe("market entity helpers", () => {
  it("marketEndsInSecs returns positive seconds for future markets", () => {
    const m = baseMarket();
    const secs = marketEndsInSecs(m);
    expect(secs).toBeGreaterThan(0);
    expect(secs).toBeLessThanOrEqual(60);
  });

  it("marketEndsInSecs is 0 for ended", () => {
    const m = baseMarket({ end_time: new Date(Date.now() - 5000).toISOString() });
    expect(marketEndsInSecs(m)).toBe(0);
  });

  it("marketIsExpired true for past end_time", () => {
    const m = baseMarket({ end_time: new Date(Date.now() - 1).toISOString() });
    expect(marketIsExpired(m)).toBe(true);
  });

  it("marketIsExpired false for future", () => {
    expect(marketIsExpired(baseMarket())).toBe(false);
  });

  it("marketsByAsset groups markets by asset", () => {
    const list: MarketInfo[] = [
      baseMarket({ condition_id: "1", asset: "BTC" }),
      baseMarket({ condition_id: "2", asset: "ETH" }),
      baseMarket({ condition_id: "3", asset: "BTC" }),
    ];
    const groups = marketsByAsset(list);
    expect(groups.get("BTC")?.length).toBe(2);
    expect(groups.get("ETH")?.length).toBe(1);
  });
});
