import { describe, expect, it } from "bun:test";
import {
  positionAgeSecs,
  positionEntryPrice,
  positionEntrySize,
  type Position,
} from "./index";

const sample: Position = {
  condition_id: "c1",
  side: "Yes",
  size: "10.5",
  entry_price: "0.42",
  market: "test",
  age_secs: 600,
};

describe("position entity helpers", () => {
  it("positionAgeSecs returns the stored age", () => {
    expect(positionAgeSecs(sample)).toBe(600);
  });

  it("positionEntrySize parses string to number", () => {
    expect(positionEntrySize(sample)).toBe(10.5);
  });

  it("positionEntryPrice parses string to number", () => {
    expect(positionEntryPrice(sample)).toBe(0.42);
  });

  it("falls back to 0 on bad input", () => {
    expect(
      positionEntrySize({ ...sample, size: "garbage" as unknown as string }),
    ).toBe(0);
  });
});
