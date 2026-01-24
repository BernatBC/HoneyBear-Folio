import { render, screen, waitFor } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import InvestmentDashboard from "../../../features/investments/InvestmentDashboard";
import { invoke } from "@tauri-apps/api/core";

// Mock dependencies
vi.mock("../../../i18n/i18n", () => ({ t: (k) => k }));
vi.mock("../../../hooks/useIsDark", () => ({ default: () => false }));

// Mock utils
vi.mock("../../../utils/format", () => ({
  useFormatNumber: () => (val) => `fmt-${val}`
}));

vi.mock("../../../utils/investments", () => ({
  buildHoldingsFromTransactions: (txs) => ({
    currentHoldings: txs.length > 0 ? [{ ticker: "AAPL", qty: 10 }] : []
  }),
  mergeHoldingsWithQuotes: (holdings, quotes) => holdings.map(h => ({
    ...h,
    currentValue: 1500, // 10 * 150
    price: 150
  }))
}));

// Mock Chart
vi.mock("react-chartjs-2", () => ({
  Doughnut: () => <div data-testid="doughnut-chart">Doughnut Chart</div>
}));
vi.mock("chart.js", () => ({
  Chart: { register: vi.fn() },
  ArcElement: {},
  Tooltip: {},
  Legend: {}
}));

describe("InvestmentDashboard", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("fetches data and renders chart when holdings exist", async () => {
    invoke.mockImplementation((cmd) => {
      if (cmd === "get_all_transactions") return Promise.resolve([1]); // Dummy tx
      if (cmd === "get_stock_quotes") return Promise.resolve({ AAPL: { price: 150 } });
      return Promise.resolve(null);
    });

    render(<InvestmentDashboard />);

    await waitFor(() => {
      expect(invoke).toHaveBeenCalledWith("get_all_transactions");
      expect(invoke).toHaveBeenCalledWith("get_stock_quotes", expect.anything());
    });

    expect(screen.getByTestId("doughnut-chart")).toBeInTheDocument();
    // multiple uses of this formatted number is visible (Total value, Top Performer value)
    expect(screen.getAllByText(/fmt-1500/).length).toBeGreaterThan(0);
  });

  it("handles empty state", async () => {
    invoke.mockImplementation((cmd) => {
      if (cmd === "get_all_transactions") return Promise.resolve([]);
      return Promise.resolve(null);
    });
    
    // We need to mock buildHoldings to return empty
    // But vi.mock is hoisted. So we conditionalize in the mock or override logic?
    // The mock above returns items if txs.length > 0.
    // So passing empty array for transactions works.

    render(<InvestmentDashboard />);

    await waitFor(() => {
      expect(invoke).toHaveBeenCalledWith("get_all_transactions");
    });

    // Check for empty state text (assuming component renders something specific, 
    // usually logic would prevent chart or show "No holdings")
    // If buildHoldings returns empty, setLoading(false) is called.
    // Dashboard likely renders empty state. I'll check what it renders in code... 
    // but code snippet stopped at allocationData. 
    // Let's assume there's no chart or specific message.
    // For now, assertion: no chart.
    
    expect(screen.queryByTestId("doughnut-chart")).not.toBeInTheDocument();
  });
});
