import { describe, expect, it, mock } from "bun:test";
import { fireEvent, render, waitFor } from "@testing-library/react";
import type { MarketInfo } from "../../shared/api";
import Markets from "./ui";

const futureIso = (mins: number) =>
  new Date(Date.now() + mins * 60_000).toISOString();

const sample: MarketInfo[] = [
  {
    condition_id: "1",
    asset: "BTC",
    kind: "UpDown",
    question: "Will BTC go up?",
    strike: null,
    end_time: futureIso(60),
    active: true,
  },
  {
    condition_id: "2",
    asset: "ETH",
    kind: "Above",
    question: "ETH above $5000?",
    strike: "5000",
    end_time: futureIso(30),
    active: true,
  },
  {
    condition_id: "3",
    asset: "BTC",
    kind: "Below",
    question: "BTC below $80000?",
    strike: "80000",
    end_time: futureIso(120),
    active: true,
  },
];

function mockMarketsResponse(markets: MarketInfo[]) {
  return mock(async (url: RequestInfo | URL) => {
    const path = typeof url === "string" ? url : url.toString();
    if (path.includes("/api/markets")) {
      return new Response(JSON.stringify({ markets }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    }
    return new Response("not found", { status: 404 });
  }) as unknown as typeof fetch;
}

describe("markets-list", () => {
  it("renders fetched markets after load", async () => {
    const originalFetch = globalThis.fetch;
    globalThis.fetch = mockMarketsResponse(sample);

    try {
      const { findByText, queryByText } = render(<Markets />);

      // initial loading skeletons present
      // wait for "Will BTC go up?" question to appear
      const q1 = await findByText("Will BTC go up?");
      expect(q1).toBeTruthy();
      expect(queryByText("ETH above $5000?")).toBeTruthy();
      expect(queryByText("BTC below $80000?")).toBeTruthy();
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it("filters by Asset chip", async () => {
    const originalFetch = globalThis.fetch;
    globalThis.fetch = mockMarketsResponse(sample);

    try {
      const { findByText, queryByText, getAllByText } = render(<Markets />);
      await findByText("Will BTC go up?");

      // Click ETH chip
      // There are two "ETH" texts (chip + table cell), pick the chip via role=button
      const ethBtns = getAllByText("ETH");
      // Chip is a <button>; cell is a <span>; click first button-like
      const ethBtn = ethBtns.find((el) => el.tagName === "BUTTON");
      expect(ethBtn).toBeTruthy();
      fireEvent.click(ethBtn!);

      await waitFor(() => {
        expect(queryByText("Will BTC go up?")).toBeNull();
      });
      expect(queryByText("ETH above $5000?")).toBeTruthy();
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it("filters by free-text search", async () => {
    const originalFetch = globalThis.fetch;
    globalThis.fetch = mockMarketsResponse(sample);

    try {
      const { findByText, getByPlaceholderText, queryByText } = render(<Markets />);
      await findByText("Will BTC go up?");

      const search = getByPlaceholderText("Search markets...");
      fireEvent.change(search, { target: { value: "below" } });

      await waitFor(() => {
        expect(queryByText("Will BTC go up?")).toBeNull();
      });
      expect(queryByText("BTC below $80000?")).toBeTruthy();
    } finally {
      globalThis.fetch = originalFetch;
    }
  });
});
