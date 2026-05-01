import { describe, expect, it, mock } from "bun:test";
import { render, fireEvent } from "@testing-library/react";
import { Button } from "./Button";

describe("Button", () => {
  it("renders children", () => {
    const { getByRole } = render(<Button>Click</Button>);
    expect(getByRole("button").textContent).toBe("Click");
  });

  it("applies primary variant classes", () => {
    const { getByRole } = render(<Button variant="primary">go</Button>);
    expect(getByRole("button").className).toContain("emerald");
  });

  it("applies danger variant classes", () => {
    const { getByRole } = render(<Button variant="danger">stop</Button>);
    expect(getByRole("button").className).toContain("red");
  });

  it("size sm shrinks text", () => {
    const { getByRole } = render(<Button size="sm">x</Button>);
    expect(getByRole("button").className).toContain("text-[10px]");
  });

  it("forwards onClick", () => {
    const onClick = mock(() => {});
    const { getByRole } = render(<Button onClick={onClick}>tap</Button>);
    fireEvent.click(getByRole("button"));
    expect(onClick).toHaveBeenCalledTimes(1);
  });

  it("respects disabled", () => {
    const onClick = mock(() => {});
    const { getByRole } = render(
      <Button onClick={onClick} disabled>tap</Button>,
    );
    fireEvent.click(getByRole("button"));
    expect(onClick).not.toHaveBeenCalled();
  });
});
