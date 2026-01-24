import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { describe, it, expect, beforeEach } from "vitest";
import { NumberFormatProvider } from "../../contexts/NumberFormatContext";
import { useNumberFormat } from "../../contexts/number-format";

// Test component to consume context
function TestComponent() {
  const { locale, setLocale, currency, setCurrency } = useNumberFormat();
  return (
    <div>
      <div data-testid="locale">{locale}</div>
      <div data-testid="currency">{currency}</div>
      <button onClick={() => setLocale("de-DE")}>Set Locale DE</button>
      <button onClick={() => setCurrency("EUR")}>Set Currency EUR</button>
    </div>
  );
}

describe("NumberFormatProvider", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it("uses default values if localStorage is empty", () => {
    render(
      <NumberFormatProvider>
        <TestComponent />
      </NumberFormatProvider>,
    );

    expect(screen.getByTestId("locale")).toHaveTextContent("en-US");
    expect(screen.getByTestId("currency")).toHaveTextContent("USD");
  });

  it("loads values from localStorage", () => {
    localStorage.setItem("hb_number_format", "fr-FR");
    localStorage.setItem("hb_currency", "GBP");

    render(
      <NumberFormatProvider>
        <TestComponent />
      </NumberFormatProvider>,
    );

    expect(screen.getByTestId("locale")).toHaveTextContent("fr-FR");
    expect(screen.getByTestId("currency")).toHaveTextContent("GBP");
  });

  it("updates state and persists to localStorage", async () => {
    render(
      <NumberFormatProvider>
        <TestComponent />
      </NumberFormatProvider>,
    );

    fireEvent.click(screen.getByText("Set Locale DE"));
    expect(screen.getByTestId("locale")).toHaveTextContent("de-DE");

    await waitFor(() => {
      expect(localStorage.getItem("hb_number_format")).toBe("de-DE");
    });

    fireEvent.click(screen.getByText("Set Currency EUR"));
    expect(screen.getByTestId("currency")).toHaveTextContent("EUR");

    await waitFor(() => {
      expect(localStorage.getItem("hb_currency")).toBe("EUR");
    });
  });
});
