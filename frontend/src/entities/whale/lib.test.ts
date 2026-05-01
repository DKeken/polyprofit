import { describe, expect, it } from "bun:test";
import { whaleIsActive, whaleProfit, type Whale } from "./index";

const base: Whale = {
  address: "0xabc",
  display_name: null,
  profit: "1234.5",
  roi: 0.42,
  win_rate: 0.55,
  volume: "1000",
  markets_traded: 7,
  last_seen: new Date().toISOString(),
  followed: false,
  archived: false,
};

describe("whale entity helpers", () => {
  it("whaleProfit parses string", () => {
    expect(whaleProfit(base)).toBe(1234.5);
  });

  it("whaleProfit returns 0 for non-numeric", () => {
    expect(whaleProfit({ ...base, profit: "n/a" })).toBe(0);
  });

  it("whaleIsActive true for recent last_seen", () => {
    expect(whaleIsActive(base)).toBe(true);
  });

  it("whaleIsActive false for very old last_seen", () => {
    const old = new Date(Date.now() - 1000 * 60 * 60 * 24 * 365).toISOString();
    expect(whaleIsActive({ ...base, last_seen: old })).toBe(false);
  });
});
