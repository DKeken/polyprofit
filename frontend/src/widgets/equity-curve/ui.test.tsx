import { describe, expect, it } from "bun:test";
import { render } from "@testing-library/react";
import EquityCurve from "./ui";

describe("EquityCurve", () => {
  it("renders empty state when no data", () => {
    const { getByText } = render(<EquityCurve data={[]} />);
    expect(getByText("Waiting for data...")).toBeTruthy();
  });

  it("renders empty state when only one point", () => {
    const { getByText } = render(
      <EquityCurve data={[{ time: "12:00", pnl: 0 }]} />,
    );
    expect(getByText("Waiting for data...")).toBeTruthy();
  });

  it("mounts the chart container when data has multiple points", () => {
    const data = Array.from({ length: 5 }, (_, i) => ({
      time: `12:0${i}`,
      pnl: i * 1.5,
    }));
    const { queryByText } = render(<EquityCurve data={data} />);
    expect(queryByText("Waiting for data...")).toBeNull();
  });
});
