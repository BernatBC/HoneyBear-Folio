import { render, screen } from "@testing-library/react";
import { describe, it, expect, vi } from "vitest";
import { PrivacyContext, usePrivacy } from "../../contexts/privacy";

// Test component to consume context
function TestComponent() {
  const { isPrivacyMode, togglePrivacyMode } = usePrivacy();
  return (
    <div>
      <span data-testid="privacy-mode">{isPrivacyMode ? "on" : "off"}</span>
      <button onClick={togglePrivacyMode}>Toggle</button>
    </div>
  );
}

describe("PrivacyContext", () => {
  describe("default context value", () => {
    it("has isPrivacyMode defaulting to false", () => {
      render(<TestComponent />);

      expect(screen.getByTestId("privacy-mode")).toHaveTextContent("off");
    });

    it("has togglePrivacyMode as a noop function", () => {
      render(<TestComponent />);

      // Should not throw when clicking toggle
      expect(() => screen.getByRole("button").click()).not.toThrow();
    });
  });

  describe("usePrivacy", () => {
    it("returns context values when used inside provider", () => {
      const mockToggle = vi.fn();
      const contextValue = {
        isPrivacyMode: true,
        togglePrivacyMode: mockToggle,
      };

      render(
        <PrivacyContext.Provider value={contextValue}>
          <TestComponent />
        </PrivacyContext.Provider>,
      );

      expect(screen.getByTestId("privacy-mode")).toHaveTextContent("on");

      screen.getByRole("button").click();
      expect(mockToggle).toHaveBeenCalled();
    });

    it("can toggle privacy mode off", () => {
      const mockToggle = vi.fn();
      const contextValue = {
        isPrivacyMode: false,
        togglePrivacyMode: mockToggle,
      };

      render(
        <PrivacyContext.Provider value={contextValue}>
          <TestComponent />
        </PrivacyContext.Provider>,
      );

      expect(screen.getByTestId("privacy-mode")).toHaveTextContent("off");
    });
  });
});
