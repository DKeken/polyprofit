import { describe, expect, it } from "bun:test";
import { render } from "@testing-library/react";
import { EmptyState } from "./EmptyState";

describe("EmptyState", () => {
  it("displays the message", () => {
    const { getByText } = render(<EmptyState msg="No data" />);
    expect(getByText("No data")).toBeTruthy();
  });
});
