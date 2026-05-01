import { describe, expect, it, mock } from "bun:test";
import { fireEvent, render } from "@testing-library/react";
import { Tabs } from "./Tabs";

const tabs = [
  { id: "a", label: "Alpha" },
  { id: "b", label: "Beta" },
  { id: "c", label: "Gamma", disabled: true },
] as const;

describe("Tabs", () => {
  it("renders all tabs", () => {
    const { getByText } = render(
      <Tabs tabs={[...tabs]} active="a" onChange={() => {}} />,
    );
    expect(getByText("Alpha")).toBeTruthy();
    expect(getByText("Beta")).toBeTruthy();
    expect(getByText("Gamma")).toBeTruthy();
  });

  it("marks active tab with aria-selected", () => {
    const { getByRole } = render(
      <Tabs tabs={[...tabs]} active="b" onChange={() => {}} />,
    );
    const beta = getByRole("tab", { name: "Beta" });
    expect(beta.getAttribute("aria-selected")).toBe("true");
  });

  it("clicking tab fires onChange with id", () => {
    const onChange = mock(() => {});
    const { getByText } = render(
      <Tabs tabs={[...tabs]} active="a" onChange={onChange} />,
    );
    fireEvent.click(getByText("Beta"));
    expect(onChange).toHaveBeenCalledWith("b");
  });

  it("disabled tab does not fire onChange", () => {
    const onChange = mock(() => {});
    const { getByText } = render(
      <Tabs tabs={[...tabs]} active="a" onChange={onChange} />,
    );
    fireEvent.click(getByText("Gamma"));
    expect(onChange).not.toHaveBeenCalled();
  });

  it("renders badge slot", () => {
    const { getByTestId } = render(
      <Tabs
        tabs={[{ id: "a", label: "Alpha", badge: <span>3</span> }]}
        active="a"
        onChange={() => {}}
      />,
    );
    expect(getByTestId("tab-badge").textContent).toBe("3");
  });
});
