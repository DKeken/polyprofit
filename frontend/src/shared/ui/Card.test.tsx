import { describe, expect, it } from "bun:test";
import { render } from "@testing-library/react";
import { Card } from "./Card";

describe("Card", () => {
  it("renders children", () => {
    const { getByText } = render(<Card>body</Card>);
    expect(getByText("body")).toBeTruthy();
  });

  it("omits header when no title/subtitle/actions", () => {
    const { queryByTestId } = render(<Card>body</Card>);
    expect(queryByTestId("card-header")).toBeNull();
  });

  it("renders title + subtitle when provided", () => {
    const { getByText } = render(
      <Card title="t" subtitle="s">body</Card>,
    );
    expect(getByText("t")).toBeTruthy();
    expect(getByText("s")).toBeTruthy();
  });

  it("renders actions slot", () => {
    const { getByText } = render(
      <Card title="t" actions={<button>action</button>}>body</Card>,
    );
    expect(getByText("action")).toBeTruthy();
  });

  it("renders footer when provided", () => {
    const { getByTestId, getByText } = render(
      <Card footer="ft">body</Card>,
    );
    expect(getByTestId("card-footer")).toBeTruthy();
    expect(getByText("ft")).toBeTruthy();
  });

  it("outline variant has transparent background", () => {
    const { getByTestId } = render(<Card variant="outline">x</Card>);
    expect(getByTestId("card").className).toContain("bg-transparent");
  });
});
