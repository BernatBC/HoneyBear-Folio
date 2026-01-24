import { render, screen, fireEvent } from "@testing-library/react";
import { describe, it, expect, vi } from "vitest";
import { Modal } from "../../../components/ui/Modal";

describe("Modal Component", () => {
  it("renders children when open", () => {
    render(
      <Modal onClose={vi.fn()}>
        <div data-testid="modal-content">Hello Modal</div>
      </Modal>,
    );

    expect(screen.getByTestId("modal-content")).toBeInTheDocument();
    expect(screen.getByText("Hello Modal")).toBeInTheDocument();
  });

  it("calls onClose when Escape key is pressed", () => {
    const handleClose = vi.fn();
    render(
      <Modal onClose={handleClose}>
        <div>Content</div>
      </Modal>,
    );

    fireEvent.keyDown(document, { key: "Escape" });
    expect(handleClose).toHaveBeenCalledTimes(1);
  });

  it("applies correct size classes", () => {
    render(
      <Modal onClose={vi.fn()} size="xl">
        <div>Content</div>
      </Modal>,
    );
    const modalContainer = screen.getByRole("dialog");
    expect(modalContainer).toHaveClass("max-w-xl");
  });

  it("locks body scroll when open", () => {
    render(
      <Modal onClose={vi.fn()}>
        <div>Content</div>
      </Modal>,
    );
    expect(document.body.style.overflow).toBe("hidden");
  });
});
