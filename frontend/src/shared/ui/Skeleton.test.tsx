import { describe, expect, it } from "bun:test";
import { render } from "@testing-library/react";
import { Skeleton } from "./Skeleton";

describe("Skeleton", () => {
  it("applies pulse animation class", () => {
    const { getByTestId } = render(<Skeleton />);
    expect(getByTestId("skeleton").className).toContain("animate-pulse");
  });

  it("rounded=full produces rounded-full class", () => {
    const { getByTestId } = render(<Skeleton rounded="full" />);
    expect(getByTestId("skeleton").className).toContain("rounded-full");
  });

  it("aria-hidden=true so it isn't read by SR", () => {
    const { getByTestId } = render(<Skeleton />);
    expect(getByTestId("skeleton").getAttribute("aria-hidden")).toBe("true");
  });

  it("forwards extra className", () => {
    const { getByTestId } = render(<Skeleton className="my-extra" />);
    expect(getByTestId("skeleton").className).toContain("my-extra");
  });
});
