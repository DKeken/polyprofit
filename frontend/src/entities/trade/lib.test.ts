import { describe, expect, it } from "bun:test";
import { tradeIsLoss, tradeIsResolved, tradeIsWin, tradePnl } from "./index";
import type { Trade } from "./index";

const base: Omit<Trade, "pnl"> = {
  side: "Yes",
  price: "0.5",
  size: "10",
  adverse: false,
  ts: new Date().toISOString(),
  market: "test",
};

describe("trade entity helpers", () => {
  it("tradePnl returns 0 for null pnl", () => {
    expect(tradePnl({ ...base, pnl: null } as Trade)).toBe(0);
  });

  it("tradePnl parses string", () => {
    expect(tradePnl({ ...base, pnl: "12.5" } as Trade)).toBe(12.5);
  });

  it("tradeIsWin true for positive", () => {
    expect(tradeIsWin({ ...base, pnl: "0.01" } as Trade)).toBe(true);
  });

  it("tradeIsWin false for zero", () => {
    expect(tradeIsWin({ ...base, pnl: "0" } as Trade)).toBe(false);
  });

  it("tradeIsLoss true for negative", () => {
    expect(tradeIsLoss({ ...base, pnl: "-5" } as Trade)).toBe(true);
  });

  it("tradeIsResolved tracks null pnl", () => {
    expect(tradeIsResolved({ ...base, pnl: null } as Trade)).toBe(false);
    expect(tradeIsResolved({ ...base, pnl: "1" } as Trade)).toBe(true);
  });
});
