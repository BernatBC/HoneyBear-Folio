import { describe, it, expect } from "vitest";
import {
  buildHoldingsFromTransactions,
  mergeHoldingsWithQuotes,
  computePortfolioTotals,
} from "../../utils/investments";

describe("Investment Utils", () => {
  const mockTransactions = [
    {
      date: "2023-01-01",
      ticker: "AAPL",
      shares: 10,
      price_per_share: 150,
      fee: 5,
    },
    {
      date: "2023-02-01",
      ticker: "GOOGL",
      shares: 5,
      price_per_share: 2000,
      fee: 10,
    },
    {
      date: "2023-03-01",
      ticker: "AAPL",
      shares: 5,
      price_per_share: 160,
      fee: 5,
    },
    {
      date: "2023-04-01",
      ticker: "AAPL",
      shares: -2, 
      price_per_share: 170, // Selling price doesn't affect cost basis logic directly in simple average cost usually, but let's test result
    },
  ];

  describe("buildHoldingsFromTransactions", () => {
    it("aggregates holdings correctly", () => {
      const { currentHoldings, firstTradeDate } =
        buildHoldingsFromTransactions(mockTransactions);

      expect(new Date(firstTradeDate).toISOString().slice(0, 10)).toBe(
        "2023-01-01",
      );

      // AAPL:
      // Buy 10 @ 150 + 5 fee = 1505
      // Buy 5 @ 160 + 5 fee = 805
      // Total Shares: 15, Total Cost: 2310, Avg: 154
      // Sell 2: Cost removal = 2 * 154 = 308
      // Remaining Cost: 2310 - 308 = 2002
      // Remaining Shares: 13
      const aapl = currentHoldings.find((h) => h.ticker === "AAPL");
      expect(aapl).toBeDefined();
      expect(aapl.shares).toBe(13);
      expect(aapl.costBasis).toBeCloseTo(2002);

      // GOOGL:
      // Buy 5 @ 2000 + 10 fee = 10010
      const googl = currentHoldings.find((h) => h.ticker === "GOOGL");
      expect(googl).toBeDefined();
      expect(googl.shares).toBe(5);
      expect(googl.costBasis).toBe(10010);
    });
  });

  describe("mergeHoldingsWithQuotes", () => {
    it("merges quotes and calculates value and ROI", () => {
      const holdings = [
        { ticker: "AAPL", shares: 10, costBasis: 1500 },
        { ticker: "GOOGL", shares: 5, costBasis: 5000 },
      ];
      const quotes = [
        {
          symbol: "AAPL",
          regularMarketPrice: 200,
          regularMarketChangePercent: 1.5,
          quoteType: "EQUITY",
        },
        // GOOGL missing quote
      ];

      const merged = mergeHoldingsWithQuotes(holdings, quotes);

      // AAPL
      // Value: 10 * 200 = 2000
      // ROI: (2000 - 1500) / 1500 = 0.333... -> 33.33%
      const aapl = merged.find((h) => h.ticker === "AAPL");
      expect(aapl.price).toBe(200);
      expect(aapl.currentValue).toBe(2000);
      expect(aapl.roi).toBeCloseTo(33.33);

      // GOOGL (missing quote)
      // Price 0
      const googl = merged.find((h) => h.ticker === "GOOGL");
      expect(googl.price).toBe(0);
      expect(googl.currentValue).toBe(0);
      expect(googl.roi).toBe(-100);
    });
  });

  describe("computePortfolioTotals", () => {
    it("sums up values correctly", () => {
      const holdings = [
        { currentValue: 2000, costBasis: 1500 },
        { currentValue: 0, costBasis: 5000 },
      ];
      const totals = computePortfolioTotals(holdings);
      expect(totals.totalValue).toBe(2000);
      expect(totals.totalCostBasis).toBe(6500);
    });
  });
});
