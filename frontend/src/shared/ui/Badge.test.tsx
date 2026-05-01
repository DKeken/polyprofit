import { describe, expect, it } from "bun:test";
import { render } from "@testing-library/react";
import { Badge } from "./Badge";

describe("Badge", () => {
  it("renders children", () => {
    const { getByText } = render(<Badge>NEW</Badge>);
    expect(getByText("NEW")).toBeTruthy();
  });

  it("applies emerald color", () => {
    const { getByText } = render(<Badge color="emerald">live</Badge>);
    expect(getByText("live").className).toContain("emerald");
  });

  it("falls back to zinc when color invalid", () => {
    // Forced cast — runtime guard via colors[c] || colors.zinc
    const { getByText } = render(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      <Badge color={"unknown" as any}>x</Badge>,
    );
    expect(getByText("x").className).toContain("zinc");
  });
});
