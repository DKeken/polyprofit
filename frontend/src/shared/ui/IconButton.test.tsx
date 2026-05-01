import { describe, expect, it, mock } from "bun:test";
import { fireEvent, render } from "@testing-library/react";
import { IconButton } from "./IconButton";

describe("IconButton", () => {
  it("renders icon node", () => {
    const { getByText } = render(
      <IconButton aria-label="play" icon={<span>▶</span>} />,
    );
    expect(getByText("▶")).toBeTruthy();
  });

  it("requires aria-label and exposes it", () => {
    const { getByLabelText } = render(
      <IconButton aria-label="copy" icon={<span>c</span>} />,
    );
    expect(getByLabelText("copy")).toBeTruthy();
  });

  it("primary variant adds emerald styles", () => {
    const { getByLabelText } = render(
      <IconButton aria-label="ok" icon={<span>x</span>} variant="primary" />,
    );
    expect(getByLabelText("ok").className).toContain("emerald");
  });

  it("danger variant adds red styles", () => {
    const { getByLabelText } = render(
      <IconButton aria-label="ko" icon={<span>x</span>} variant="danger" />,
    );
    expect(getByLabelText("ko").className).toContain("red");
  });

  it("size sm reduces dim class", () => {
    const { getByLabelText } = render(
      <IconButton aria-label="s" icon={<span>x</span>} size="sm" />,
    );
    expect(getByLabelText("s").className).toContain("w-7");
  });

  it("forwards onClick", () => {
    const onClick = mock(() => {});
    const { getByLabelText } = render(
      <IconButton aria-label="t" icon={<span>x</span>} onClick={onClick} />,
    );
    fireEvent.click(getByLabelText("t"));
    expect(onClick).toHaveBeenCalledTimes(1);
  });
});
