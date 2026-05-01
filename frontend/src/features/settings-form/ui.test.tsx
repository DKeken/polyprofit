import { afterEach, describe, expect, it, mock } from "bun:test";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import Settings from "./ui";
import type { BotConfig } from "../../shared/api";

const baseConfig: BotConfig = {
  min_edge: "0.05",
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
  assets: ["BTC", "ETH"],
  known_assets: ["BTC", "ETH"],
  asset_definitions: [
    { symbol: "BTC", binance_symbol: "BTCUSDT", keywords: ["btc"] },
    { symbol: "ETH", binance_symbol: "ETHUSDT", keywords: ["eth"] },
  ],
};

describe("Settings", () => {
  afterEach(() => {
    mock.restore();
  });

  it("sends only changed fields with normalized asset definitions", async () => {
    const onSave = mock(async () => ({
      changes: ["min_edge: 0.07", "asset_definitions: 2 assets"],
    }));

    render(<Settings config={baseConfig} onSave={onSave} />);

    fireEvent.change(screen.getAllByDisplayValue("0.05")[0], {
      target: { value: "0.07" },
    });

    fireEvent.click(screen.getByRole("button", { name: "assets" }));

    const keywordInputs = screen.getAllByPlaceholderText("btc, bitcoin");
    fireEvent.change(keywordInputs[0], {
      target: { value: " BTC, Bitcoin " },
    });

    fireEvent.click(screen.getByRole("button", { name: /save changes/i }));

    await waitFor(() => expect(onSave).toHaveBeenCalledTimes(1));
    expect(onSave).toHaveBeenCalledWith({
      min_edge: "0.07",
      asset_definitions: [
        {
          symbol: "BTC",
          binance_symbol: "BTCUSDT",
          keywords: ["btc", "bitcoin"],
        },
        {
          symbol: "ETH",
          binance_symbol: "ETHUSDT",
          keywords: ["eth"],
        },
      ],
    });
  });

  it("renders backend error and removes orphaned active assets from draft", async () => {
    const onSave = mock(async () => {
      throw new Error("assets list must not be empty");
    });

    render(<Settings config={baseConfig} onSave={onSave} />);

    fireEvent.click(screen.getByRole("button", { name: "assets" }));
    fireEvent.click(screen.getAllByRole("button", { name: "Remove" })[0]);

    expect(screen.queryByRole("button", { name: "BTC" })).not.toBeInTheDocument();
    const saveButton = screen.getByRole("button", { name: /save changes/i });
    expect(saveButton).not.toBeDisabled();

    fireEvent.click(saveButton);

    await screen.findByText("Error: assets list must not be empty");
  });
});
