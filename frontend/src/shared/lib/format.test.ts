import { describe, expect, it } from "bun:test";
import {
  fmtPct,
  fmtPnl,
  fmtUsd,
  formatDuration,
  isBuySide,
  pnlColor,
  pnlSign,
  shortenAddress,
} from "./format";

describe("format helpers", () => {
  it("fmtUsd formats with comma + 2dp", () => {
    expect(fmtUsd(1234.5)).toBe("1,234.50");
  });

  it("fmtPct multiplies by 100 and adds %", () => {
    expect(fmtPct(0.123)).toBe("12.3%");
  });

  it("formatDuration handles seconds, minutes, hours, days", () => {
    expect(formatDuration(0)).toBe("0s");
    expect(formatDuration(45)).toBe("45s");
    expect(formatDuration(120)).toBe("2m");
    expect(formatDuration(3600)).toBe("1h");
    expect(formatDuration(3660)).toBe("1h 1m");
    expect(formatDuration(90061)).toBe("1d 1h");
  });

  it("isBuySide detects YES variants and Buy", () => {
    expect(isBuySide("YES")).toBe(true);
    expect(isBuySide("Yes")).toBe(true);
    expect(isBuySide("Buy")).toBe(true);
    expect(isBuySide("No")).toBe(false);
  });

  it("shortenAddress truncates", () => {
    expect(shortenAddress("0x1234567890abcdef1234567890abcdef")).toBe(
      "0x1234…abcdef",
    );
  });

  it("shortenAddress passthrough short", () => {
    expect(shortenAddress("0x12")).toBe("0x12");
  });

  it("pnlColor + sign for positive/negative", () => {
    expect(pnlColor(5)).toContain("emerald");
    expect(pnlColor(-1)).toContain("red");
    expect(pnlSign(5)).toBe("+");
    expect(pnlSign(-1)).toBe("");
  });

  it("fmtPnl renders with sign + dollar", () => {
    // pnlSign returns "" for negatives — the bot displays the absolute value
    // because the leading "-" is provided by the dollar sign on the dashboard.
    expect(fmtPnl(10.5)).toBe("+$10.50");
    expect(fmtPnl(-3.21)).toBe("$3.21");
  });
});
