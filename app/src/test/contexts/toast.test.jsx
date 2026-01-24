import React from "react";
import { render, screen } from "@testing-library/react";
import { describe, it, expect, vi } from "vitest";
import { ToastContext, useToast } from "../../contexts/toast";

// Test component to consume context
function TestComponent() {
  const { showToast } = useToast();
  return (
    <div>
      <button onClick={() => showToast("Test message")}>Show Toast</button>
    </div>
  );
}

describe("ToastContext", () => {
  describe("useToast", () => {
    it("returns noop showToast when used outside provider", () => {
      // Should not throw
      render(<TestComponent />);

      // Should render without crashing
      expect(screen.getByRole("button")).toBeInTheDocument();
    });

    it("noop showToast does not throw when called", () => {
      const capturedShowToastRef = { current: null };
      function CaptureComponent() {
        const { showToast } = useToast();
        // assign to ref property inside effect (no mutation during render)
        React.useEffect(() => {
          capturedShowToastRef.current = showToast;
        }, [showToast]);
        return null;
      }

      render(<CaptureComponent />);

      // Calling noop should not throw
      expect(() => capturedShowToastRef.current("message")).not.toThrow();
      expect(() => capturedShowToastRef.current()).not.toThrow();
    });

    it("returns context value when used inside provider", () => {
      const mockShowToast = vi.fn();
      const contextValue = { showToast: mockShowToast };

      function TestWithProvider() {
        const { showToast } = useToast();
        return <button onClick={() => showToast("Hello")}>Click</button>;
      }

      render(
        <ToastContext.Provider value={contextValue}>
          <TestWithProvider />
        </ToastContext.Provider>,
      );

      screen.getByRole("button").click();
      expect(mockShowToast).toHaveBeenCalledWith("Hello");
    });
  });
});
