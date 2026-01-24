import { render, screen } from "@testing-library/react";
import { describe, it, expect, vi } from "vitest";
import { ThemeContext, useTheme } from "../../contexts/theme-core";

// Test component to consume context
function TestComponent() {
  const { theme, setTheme } = useTheme();
  return (
    <div>
      <span data-testid="theme">{theme}</span>
      <button onClick={() => setTheme("dark")}>Set Dark</button>
    </div>
  );
}

describe("ThemeContext", () => {
  describe("useTheme", () => {
    it("throws error when used outside ThemeProvider", () => {
      // Suppress console.error for expected error
      const consoleSpy = vi
        .spyOn(console, "error")
        .mockImplementation(() => {});

      expect(() => render(<TestComponent />)).toThrow(
        "useTheme must be used within a ThemeProvider",
      );

      consoleSpy.mockRestore();
    });

    it("returns context value when used inside provider", () => {
      const mockSetTheme = vi.fn();
      const contextValue = { theme: "light", setTheme: mockSetTheme };

      render(
        <ThemeContext.Provider value={contextValue}>
          <TestComponent />
        </ThemeContext.Provider>,
      );

      expect(screen.getByTestId("theme")).toHaveTextContent("light");
    });

    it("can call setTheme from context", () => {
      const mockSetTheme = vi.fn();
      const contextValue = { theme: "light", setTheme: mockSetTheme };

      render(
        <ThemeContext.Provider value={contextValue}>
          <TestComponent />
        </ThemeContext.Provider>,
      );

      screen.getByRole("button").click();
      expect(mockSetTheme).toHaveBeenCalledWith("dark");
    });

    it("works with dark theme value", () => {
      const contextValue = { theme: "dark", setTheme: vi.fn() };

      render(
        <ThemeContext.Provider value={contextValue}>
          <TestComponent />
        </ThemeContext.Provider>,
      );

      expect(screen.getByTestId("theme")).toHaveTextContent("dark");
    });

    it("works with system theme value", () => {
      const contextValue = { theme: "system", setTheme: vi.fn() };

      render(
        <ThemeContext.Provider value={contextValue}>
          <TestComponent />
        </ThemeContext.Provider>,
      );

      expect(screen.getByTestId("theme")).toHaveTextContent("system");
    });
  });
});
