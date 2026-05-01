import { describe, expect, it } from "bun:test";
import { render } from "@testing-library/react";
import ExecutionLog from "./ui";
import type { LogEntry } from "../../shared/api";

const sample: LogEntry[] = [
  { id: 1, ts: "2026-05-01T12:00:00Z", type: "EVAL", msg: "scan started" },
  { id: 2, ts: "2026-05-01T12:00:01Z", type: "EXEC", msg: "limit order @0.42" },
  { id: 3, ts: "2026-05-01T12:00:02Z", type: "FILL", msg: "filled 100 shares" },
];

describe("ExecutionLog", () => {
  it("renders header + entry count", () => {
    const { getByText } = render(<ExecutionLog entries={sample} connected={true} />);
    expect(getByText("3 entries")).toBeTruthy();
  });

  it("renders each entry's type and message", () => {
    const { getByText } = render(<ExecutionLog entries={sample} connected={true} />);
    expect(getByText("EVAL")).toBeTruthy();
    expect(getByText("EXEC")).toBeTruthy();
    expect(getByText("FILL")).toBeTruthy();
    expect(getByText("scan started")).toBeTruthy();
    expect(getByText("filled 100 shares")).toBeTruthy();
  });

  it("empty + connected → 'Waiting for trades...'", () => {
    const { getByText } = render(<ExecutionLog entries={[]} connected={true} />);
    expect(getByText("Waiting for trades...")).toBeTruthy();
  });

  it("empty + disconnected → 'Disconnected'", () => {
    const { getByText } = render(<ExecutionLog entries={[]} connected={false} />);
    expect(getByText("Disconnected")).toBeTruthy();
  });
});
