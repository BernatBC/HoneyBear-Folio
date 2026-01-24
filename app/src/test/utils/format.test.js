import { describe, it, expect, vi } from "vitest";
import {
  formatNumberWithLocale,
  parseNumberWithLocale,
} from "../../utils/format";

// Mock currencies for testing
vi.mock("../../utils/currencies", () => ({
  CURRENCIES: [
    { code: "USD", symbol: "$", position: "left" },
    { code: "EUR", symbol: "€", position: "right" },
  ],
}));

describe("formatNumberWithLocale", () => {
  it("formats standard numbers correctly", () => {
    // Basic US locale test
    expect(formatNumberWithLocale(1234.56, "en-US")).toBe("1,234.56");
    // Basic DE locale test (comma decimal)
    expect(formatNumberWithLocale(1234.56, "de-DE")).toBe("1.234,56");
  });

  it("handles empty or invalid inputs", () => {
    expect(formatNumberWithLocale(null)).toBe("");
    expect(formatNumberWithLocale(undefined)).toBe("");
    expect(formatNumberWithLocale(NaN)).toBe("");
    expect(formatNumberWithLocale("invalid")).toBe("");
  });

  it("formats currency with correct position (left)", () => {
    // USD is left-aligned in our mock
    const result = formatNumberWithLocale(100, "en-US", {
      style: "currency",
      currency: "USD",
    });
    // Expected: $100.00 (check for exact match including potential non-breaking spaces if any, though here it's likely standard)
    expect(result).toBe("$100.00");
  });

  it("formats currency with correct position (right)", () => {
    // EUR is right-aligned in our mock
    const result = formatNumberWithLocale(100, "de-DE", {
      style: "currency",
      currency: "EUR",
    });
    // Expected: 100,00 € (with non-breaking space)
    expect(result).toMatch(/100,00\s€/);
  });

  it("handles negative currency values correctly", () => {
    const usd = formatNumberWithLocale(-50.5, "en-US", {
      style: "currency",
      currency: "USD",
    });
    expect(usd).toBe("-$50.50");

    const eur = formatNumberWithLocale(-50.5, "de-DE", {
      style: "currency",
      currency: "EUR",
    });
    expect(eur).toMatch(/-50,50\s€/);
  });

  it("falls back gracefully if locale is unsupported", () => {
    // Should still produce a formatted number
    const result = formatNumberWithLocale(1000, "invalid-locale");
    // Depending on system implementation, usually falls back to system locale (likely en-US in test env)
    expect(result).not.toBe("");
    expect(result).toContain("1");
  });
});

describe("parseNumberWithLocale", () => {
  it("parses simple integers", () => {
    expect(parseNumberWithLocale("123", "en-US")).toBe(123);
  });

  it("parses decimals with dot separator (US)", () => {
    expect(parseNumberWithLocale("123.45", "en-US")).toBe(123.45);
  });

  it("parses decimals with comma separator (DE)", () => {
    expect(parseNumberWithLocale("123,45", "de-DE")).toBe(123.45);
  });

  it("ignores grouping separators (US)", () => {
    expect(parseNumberWithLocale("1,234.56", "en-US")).toBe(1234.56);
  });

  it("ignores grouping separators (DE)", () => {
    expect(parseNumberWithLocale("1.234,56", "de-DE")).toBe(1234.56);
  });

  it("handles currency symbols and whitespace", () => {
    expect(parseNumberWithLocale("$1,234.00", "en-US")).toBe(1234);
    expect(parseNumberWithLocale("1.234,00 €", "de-DE")).toBe(1234);
  });

  it("returns NaN for invalid inputs", () => {
    expect(parseNumberWithLocale(null)).toBe(NaN);
    expect(parseNumberWithLocale("abc")).toBe(NaN);
    expect(parseNumberWithLocale("")).toBe(NaN);
  });
});
