import { render, screen } from "@testing-library/react";
import { describe, it, expect, vi } from "vitest";
import { NumberFormatContext, useNumberFormat } from "../../contexts/number-format";

// Test component to consume context
function TestComponent() {
  const { locale, currency, formatNumber } = useNumberFormat();
  return (
    <div>
      <span data-testid="locale">{locale}</span>
      <span data-testid="currency">{currency}</span>
      <span data-testid="formatted">{formatNumber(1234.56)}</span>
    </div>
  );
}

describe("NumberFormatContext", () => {
  describe("useNumberFormat", () => {
    it("throws error when used outside NumberFormatProvider", () => {
      // Suppress console.error for expected error
      const consoleSpy = vi.spyOn(console, "error").mockImplementation(() => {});
      
      expect(() => render(<TestComponent />)).toThrow(
        "useNumberFormat must be used within NumberFormatProvider"
      );
      
      consoleSpy.mockRestore();
    });

    it("returns context value when used inside provider", () => {
      const mockFormatNumber = vi.fn().mockReturnValue("1,234.56");
      const contextValue = {
        locale: "en-US",
        currency: "USD",
        formatNumber: mockFormatNumber,
      };

      render(
        <NumberFormatContext.Provider value={contextValue}>
          <TestComponent />
        </NumberFormatContext.Provider>
      );

      expect(screen.getByTestId("locale")).toHaveTextContent("en-US");
      expect(screen.getByTestId("currency")).toHaveTextContent("USD");
      expect(screen.getByTestId("formatted")).toHaveTextContent("1,234.56");
      expect(mockFormatNumber).toHaveBeenCalledWith(1234.56);
    });

    it("works with different locales", () => {
      const contextValue = {
        locale: "de-DE",
        currency: "EUR",
        formatNumber: (n) => n.toLocaleString("de-DE"),
      };

      render(
        <NumberFormatContext.Provider value={contextValue}>
          <TestComponent />
        </NumberFormatContext.Provider>
      );

      expect(screen.getByTestId("locale")).toHaveTextContent("de-DE");
      expect(screen.getByTestId("currency")).toHaveTextContent("EUR");
    });
  });
});
