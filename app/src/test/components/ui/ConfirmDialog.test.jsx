import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { ConfirmDialogProvider } from "../../../components/ui/ConfirmDialog";
import { useConfirm } from "../../../contexts/confirm";

const TestComponent = ({ onResult }) => {
  const confirm = useConfirm();

  const handleAction = async () => {
    const result = await confirm("Are you sure?");
    onResult(result);
  };

  return <button onClick={handleAction}>Trigger Confirm</button>;
};

describe("ConfirmDialogProvider", () => {
  it("shows dialog when confirm is called", async () => {
    const onResult = vi.fn();
    render(
      <ConfirmDialogProvider>
        <TestComponent onResult={onResult} />
      </ConfirmDialogProvider>
    );

    fireEvent.click(screen.getByText("Trigger Confirm"));

    expect(await screen.findByText("Are you sure?")).toBeInTheDocument();
  });

  it("resolves to true when confirmed", async () => {
    const onResult = vi.fn();
    render(
      <ConfirmDialogProvider>
        <TestComponent onResult={onResult} />
      </ConfirmDialogProvider>
    );

    fireEvent.click(screen.getByText("Trigger Confirm"));
    
    // Default OK label is "Confirm", but it might depend on localization
    // The code defaults to t("confirm.ok") but defaults are processed.
    // Let's look for a button that is NOT the cancel button.
    // Or just look for the class "modal-action-button" logic? 
    // Easier: find button with "Confirm" or checking the code defaults
    
    const confirmBtn = await screen.findByRole("button", { name: "OK" });
    fireEvent.click(confirmBtn);

    await waitFor(() => expect(onResult).toHaveBeenCalledWith(true));
  });

  it("resolves to false when canceled", async () => {
    const onResult = vi.fn();
    render(
      <ConfirmDialogProvider>
        <TestComponent onResult={onResult} />
      </ConfirmDialogProvider>
    );

    fireEvent.click(screen.getByText("Trigger Confirm"));

    const cancelBtn = await screen.findByRole("button", { name: /cancel|no/i });
    fireEvent.click(cancelBtn);

    await waitFor(() => expect(onResult).toHaveBeenCalledWith(false));
  });
});
