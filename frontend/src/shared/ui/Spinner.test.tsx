import { describe, expect, it } from "bun:test";
import { render } from "@testing-library/react";
import { Spinner } from "./Spinner";

describe("Spinner", () => {
  it("has role=status", () => {
    const { getByRole } = render(<Spinner />);
    expect(getByRole("status")).toBeTruthy();
  });

  it("default aria-label is Loading", () => {
    const { getByRole } = render(<Spinner />);
    expect(getByRole("status").getAttribute("aria-label")).toBe("Loading");
  });

  it("custom label overrides default", () => {
    const { getByRole } = render(<Spinner label="Saving" />);
    expect(getByRole("status").getAttribute("aria-label")).toBe("Saving");
  });

  it("size prop sets dimension class", () => {
    const { getByTestId } = render(<Spinner size="xs" />);
    expect(getByTestId("spinner").className).toContain("w-3");
  });
});
