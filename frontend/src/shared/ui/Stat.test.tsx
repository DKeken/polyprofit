import { describe, expect, it } from "bun:test";
import { render } from "@testing-library/react";
import { Stat } from "./Stat";

describe("Stat", () => {
  it("renders label and value", () => {
    const { getByText } = render(<Stat label="PNL" value="+$10.00" />);
    expect(getByText("PNL")).toBeTruthy();
    expect(getByText("+$10.00")).toBeTruthy();
  });

  it("highlight applies emerald color", () => {
    const { getByText } = render(<Stat label="L" value="V" highlight />);
    expect(getByText("V").className).toContain("emerald");
  });

  it("default value color is zinc-400", () => {
    const { getByText } = render(<Stat label="L" value="V" />);
    expect(getByText("V").className).toContain("zinc-400");
  });
});
