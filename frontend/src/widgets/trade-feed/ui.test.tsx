import { describe, expect, it } from "bun:test";
import { fireEvent, render } from "@testing-library/react";
import TradeFeed from "./ui";
import type { Tick } from "@server-bindings/Tick";
import type { TradeInfo } from "@server-bindings/TradeInfo";
import type { PositionInfo } from "@server-bindings/PositionInfo";

const tick: Tick = {
  ts: "2026-05-01T12:00:00Z",
  asset: "BTC",
  // recharts-y unused fields
  spot: "100000",
  binance: "100000",
  poly: "100050",
  edge: "0.0005",
  spread: "0.01",
  markets: 12,
} as unknown as Tick;

const trades: TradeInfo[] = [
  {
    market: "Will BTC hit 200k?",
    side: "BUY",
    size: "100",
    pnl: "12.34",
    ts: new Date(Date.now() - 30_000).toISOString(),
  } as unknown as TradeInfo,
];

const positions: PositionInfo[] = [
  {
    condition_id: "0xabc1234567890",
    market: "ETH above $5000?",
    side: "BUY",
    size: "50",
    entry_price: "0.42",
    age_secs: 3600,
  } as unknown as PositionInfo,
];

describe("TradeFeed", () => {
  it("default tab shows mixed activity (positions + trades)", () => {
    const { getByText } = render(
      <TradeFeed trades={trades} positions={positions} totalTrades={1} tick={tick} />,
    );
    expect(getByText("Will BTC hit 200k?")).toBeTruthy();
    expect(getByText("ETH above $5000?")).toBeTruthy();
    expect(getByText("1 trades · 1 open")).toBeTruthy();
  });

  it("switching to Positions tab hides trades, keeps positions", () => {
    const { getByText, queryByText } = render(
      <TradeFeed trades={trades} positions={positions} totalTrades={1} tick={tick} />,
    );
    fireEvent.click(getByText("Positions"));
    expect(queryByText("Will BTC hit 200k?")).toBeNull();
    expect(getByText("ETH above $5000?")).toBeTruthy();
    expect(getByText("1 open positions")).toBeTruthy();
  });

  it("switching to Search tab shows search input + empty hint", () => {
    const { getByText, getByPlaceholderText } = render(
      <TradeFeed trades={trades} positions={positions} totalTrades={1} tick={tick} />,
    );
    fireEvent.click(getByText("Search"));
    expect(getByPlaceholderText("Search markets...")).toBeTruthy();
  });

  it("Search input filters trades by market name", () => {
    const { getByText, getByPlaceholderText, queryByText } = render(
      <TradeFeed trades={trades} positions={positions} totalTrades={1} tick={tick} />,
    );
    fireEvent.click(getByText("Search"));
    fireEvent.change(getByPlaceholderText("Search markets..."), {
      target: { value: "BTC" },
    });
    expect(getByText("Will BTC hit 200k?")).toBeTruthy();
    expect(queryByText("ETH above $5000?")).toBeNull();
  });
});
