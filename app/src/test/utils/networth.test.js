import { describe, it, expect } from "vitest";
import { computeNetWorth } from "../../utils/networth";

describe("computeNetWorth", () => {
  it("returns 0 for empty or invalid inputs", () => {
    expect(computeNetWorth([])).toBe(0);
    expect(computeNetWorth(undefined)).toBe(0);
  });

  it("sums account balances", () => {
    const accounts = [
      { id: "1", balance: 100 },
      { id: "2", balance: 200.5 },
    ];
    expect(computeNetWorth(accounts)).toBe(300.5);
  });

  it("includes market values from the secondary map", () => {
    const accounts = [{ id: "1", balance: 100 }];
    const marketValues = { 1: 50 };
    // 100 + 50 = 150
    expect(computeNetWorth(accounts, marketValues)).toBe(150);
  });

  it("handles exchange rates", () => {
    const accounts = [
      { id: "1", balance: 100, exchange_rate: 1.5 }, // 150
      { id: "2", balance: 200, exchange_rate: 0.5 }, // 100
    ];
    // 150 + 100 = 250
    expect(computeNetWorth(accounts)).toBe(250);
  });

  it("applies exchange rate to both balance and market value", () => {
    const accounts = [{ id: "1", balance: 100, exchange_rate: 2 }];
    const marketValues = { 1: 50 };
    // (100 + 50) * 2 = 300
    expect(computeNetWorth(accounts, marketValues)).toBe(300);
  });

  it("handles missing or invalid balances gracefully", () => {
    const accounts = [
      { id: "1", balance: null },
      { id: "2", balance: "invalid" },
      { id: "3", balance: 100 },
    ];
    expect(computeNetWorth(accounts)).toBe(100);
  });

  it("ignores invalid market values", () => {
    const accounts = [{ id: "1", balance: 100 }];
    const marketValues = { 1: "invalid" };
    expect(computeNetWorth(accounts, marketValues)).toBe(100);
  });
});
