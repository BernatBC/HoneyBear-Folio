import { render, screen, fireEvent, act } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { ToastProvider } from "../../../components/ui/Toast";
import { useToast } from "../../../contexts/toast";

// Test component to consume context
function TestComponent({ onShowToast }) {
  const { showToast } = useToast();
  return (
    <div>
      <button onClick={() => {
        const id = showToast("Test message");
        onShowToast?.(id);
      }}>
        Info Toast
      </button>
      <button onClick={() => showToast("Success!", { type: "success" })}>
        Success Toast
      </button>
      <button onClick={() => showToast("Error!", { type: "error" })}>
        Error Toast
      </button>
      <button onClick={() => showToast("No auto-dismiss", { duration: 0 })}>
        Persistent Toast
      </button>
    </div>
  );
}

describe("ToastProvider", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("renders children", () => {
    render(
      <ToastProvider>
        <div data-testid="child">Hello</div>
      </ToastProvider>
    );

    expect(screen.getByTestId("child")).toBeInTheDocument();
  });

  it("provides showToast function to children", () => {
    render(
      <ToastProvider>
        <TestComponent />
      </ToastProvider>
    );

    expect(screen.getByText("Info Toast")).toBeInTheDocument();
  });

  it("shows info toast when showToast is called", () => {
    render(
      <ToastProvider>
        <TestComponent />
      </ToastProvider>
    );

    act(() => {
      fireEvent.click(screen.getByText("Info Toast"));
    });

    expect(screen.getByText("Test message")).toBeInTheDocument();
    expect(screen.getByRole("status")).toHaveClass("toast-info");
  });

  it("shows success toast with correct styling", () => {
    render(
      <ToastProvider>
        <TestComponent />
      </ToastProvider>
    );

    act(() => {
      fireEvent.click(screen.getByText("Success Toast"));
    });

    expect(screen.getByText("Success!")).toBeInTheDocument();
    expect(screen.getByRole("status")).toHaveClass("toast-success");
  });

  it("shows error toast with correct styling", () => {
    render(
      <ToastProvider>
        <TestComponent />
      </ToastProvider>
    );

    act(() => {
      fireEvent.click(screen.getByText("Error Toast"));
    });

    expect(screen.getByText("Error!")).toBeInTheDocument();
    expect(screen.getByRole("status")).toHaveClass("toast-error");
  });

  it("auto-dismisses toast after duration", () => {
    render(
      <ToastProvider>
        <TestComponent />
      </ToastProvider>
    );

    act(() => {
      fireEvent.click(screen.getByText("Info Toast"));
    });
    
    expect(screen.getByText("Test message")).toBeInTheDocument();

    // Fast-forward past the default 4000ms duration
    act(() => {
      vi.advanceTimersByTime(4500);
    });

    expect(screen.queryByText("Test message")).not.toBeInTheDocument();
  });

  it("does not auto-dismiss when duration is 0", () => {
    render(
      <ToastProvider>
        <TestComponent />
      </ToastProvider>
    );

    act(() => {
      fireEvent.click(screen.getByText("Persistent Toast"));
    });
    
    expect(screen.getByText("No auto-dismiss")).toBeInTheDocument();

    // Fast-forward way past normal duration
    act(() => {
      vi.advanceTimersByTime(10000);
    });

    // Should still be visible
    expect(screen.getByText("No auto-dismiss")).toBeInTheDocument();
  });

  it("removes toast when dismiss button is clicked", () => {
    render(
      <ToastProvider>
        <TestComponent />
      </ToastProvider>
    );

    act(() => {
      fireEvent.click(screen.getByText("Info Toast"));
    });
    
    expect(screen.getByText("Test message")).toBeInTheDocument();

    act(() => {
      fireEvent.click(screen.getByLabelText("Dismiss"));
    });

    expect(screen.queryByText("Test message")).not.toBeInTheDocument();
  });

  it("shows multiple toasts simultaneously", () => {
    render(
      <ToastProvider>
        <TestComponent />
      </ToastProvider>
    );

    act(() => {
      fireEvent.click(screen.getByText("Info Toast"));
      fireEvent.click(screen.getByText("Success Toast"));
      fireEvent.click(screen.getByText("Error Toast"));
    });

    expect(screen.getByText("Test message")).toBeInTheDocument();
    expect(screen.getByText("Success!")).toBeInTheDocument();
    expect(screen.getByText("Error!")).toBeInTheDocument();
  });

  it("returns toast id from showToast", () => {
    let toastId;
    render(
      <ToastProvider>
        <TestComponent onShowToast={(id) => { toastId = id; }} />
      </ToastProvider>
    );

    act(() => {
      fireEvent.click(screen.getByText("Info Toast"));
    });

    expect(toastId).toBeDefined();
    expect(typeof toastId).toBe("string");
  });

  it("has accessible toast container", () => {
    render(
      <ToastProvider>
        <TestComponent />
      </ToastProvider>
    );

    const container = document.querySelector(".toast-container");
    expect(container).toHaveAttribute("aria-live", "polite");
    expect(container).toHaveAttribute("aria-atomic", "true");
  });
});
