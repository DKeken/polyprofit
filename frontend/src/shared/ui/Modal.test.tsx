import { describe, expect, it, mock } from "bun:test";
import { fireEvent, render } from "@testing-library/react";
import { Modal } from "./Modal";

describe("Modal", () => {
  it("renders nothing when closed", () => {
    const { queryByTestId } = render(
      <Modal open={false} onClose={() => {}}>body</Modal>,
    );
    expect(queryByTestId("modal")).toBeNull();
  });

  it("renders content when open", () => {
    const { getByText, getByTestId } = render(
      <Modal open onClose={() => {}} title="Hello">body</Modal>,
    );
    expect(getByTestId("modal")).toBeTruthy();
    expect(getByText("Hello")).toBeTruthy();
    expect(getByText("body")).toBeTruthy();
  });

  it("close button triggers onClose", () => {
    const onClose = mock(() => {});
    const { getByLabelText } = render(
      <Modal open onClose={onClose} title="Hi">body</Modal>,
    );
    fireEvent.click(getByLabelText("Close dialog"));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("backdrop click closes by default", () => {
    const onClose = mock(() => {});
    const { getByTestId } = render(
      <Modal open onClose={onClose}>body</Modal>,
    );
    fireEvent.click(getByTestId("modal-backdrop"));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("dismissOnBackdrop=false suppresses backdrop close", () => {
    const onClose = mock(() => {});
    const { getByTestId } = render(
      <Modal open onClose={onClose} dismissOnBackdrop={false}>body</Modal>,
    );
    fireEvent.click(getByTestId("modal-backdrop"));
    expect(onClose).not.toHaveBeenCalled();
  });

  it("ESC key closes the modal", () => {
    const onClose = mock(() => {});
    render(<Modal open onClose={onClose}>body</Modal>);
    fireEvent.keyDown(document, { key: "Escape" });
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});
