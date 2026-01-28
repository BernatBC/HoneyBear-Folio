import {
  render,
  screen,
  fireEvent,
  waitFor,
  cleanup,
} from "@testing-library/react";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import FireCalculator from "../../../features/fire/FireCalculator";
import { invoke } from "@tauri-apps/api/core";
import { NumberFormatContext } from "../../../contexts/number-format";

// Mock dependencies
vi.mock("react-chartjs-2", () => ({
  Line: () => <div data-testid="fire-chart">Chart</div>,
}));

vi.mock("chart.js", () => ({
  Chart: { register: vi.fn() },
  CategoryScale: {},
  LinearScale: {},
  PointElement: {},
  LineElement: {},
  Title: {},
  Tooltip: {},
  Legend: {},
  Filler: {},
}));

vi.mock("../../../hooks/useIsDark", () => ({
  default: () => false,
}));

vi.mock("../../../i18n/i18n", () => ({
  t: (key, params) => {
    const map = {
      "fire.current_net_worth": "Current Net Worth",
      "fire.annual_expenses": "Annual Expenses",
      "fire.expected_return": "Expected Annual Return",
      "fire.withdrawal_rate": "Safe Withdrawal Rate",
      "fire.annual_savings": "Annual Savings",
      "fire.fire_number": "FIRE Number",
      "fire.time_to_fire": "Time to FIRE",
      "fire.years_to_fire": "Years to FIRE",
      "fire.age_at_fire": "Age at FIRE",
      "fire.parameters": "Parameters",
      "fire.reset": "Reset",
      "fire.reset_tooltip": "Reset to defaults",
      "fire.inflation": "Inflation Rate",
      "fire.age_timeline": "Age & Timeline",
      "fire.current_age": "Current Age",
      "fire.target_retirement_age": "Target Retirement Age",
      "fire.retirement_duration": "Retirement Duration",
      "fire.years": "years",
      "fire.show_advanced": "Show advanced parameters",
      "fire.hide_advanced": "Hide advanced parameters",
      "fire.advanced_description": "Monte Carlo simulation parameters",
      "fire.return_volatility": "Return Volatility (Std Dev)",
      "fire.volatility_hint": "Typical: 15-20% for stocks",
      "fire.simulation_count": "Simulation Count",
      "fire.simulation_count_hint": "100-10,000 simulations",
      "fire.retirement_age": "Retirement Age",
      "fire.age_value": `Age ${params?.age || ""}`,
      "fire.success_rate": "Success Rate",
      "fire.monte_carlo": "Monte Carlo",
      "fire.projection": "Projection",
      "fire.projection_subtitle": "Path to financial independence",
      "fire.simulations_run": `${params?.count || ""} simulations`,
      "fire.chart_legend_explanation": "Chart explanation",
      "fire.never_retire": "Unlikely to reach FIRE",
    };
    return map[key] || key;
  },
}));

vi.mock("@tauri-apps/api/event", () => ({
  listen: vi.fn(() => Promise.resolve(() => {})),
}));

vi.mock("../../../utils/investments", () => ({
  buildHoldingsFromTransactions: () => ({
    currentHoldings: [],
    firstTradeDate: new Date(),
  }),
  mergeHoldingsWithQuotes: () => [],
  computePortfolioTotals: () => ({ totalValue: 50000 }), // Default mocked net worth from portfolio
  computeNetWorthMarketValues: () => [],
}));

vi.mock("../../../utils/fire", () => ({
  runMonteCarloSimulation: () => ({
    successRate: 85,
    percentiles: {
      p10: Array(51).fill(100000),
      p25: Array(51).fill(200000),
      p50: Array(51).fill(500000),
      p75: Array(51).fill(800000),
      p90: Array(51).fill(1200000),
    },
    yearsToRetirement: 25,
    totalYears: 55,
    simulationCount: 1000,
  }),
  calculateDeterministicProjection: ({ annualExpenses, withdrawalRate }) => ({
    fireNumber: annualExpenses / (withdrawalRate / 100),
    yearsToFire: 15,
    projectionData: Array(51)
      .fill(0)
      .map((_, i) => 50000 + i * 30000),
    neverReached: false,
  }),
}));

const renderWithContext = (ui) => {
  return render(
    <NumberFormatContext.Provider
      value={{
        formatNumber: (val) => String(val),
        parseNumber: (val) => Number(val),
      }}
    >
      {ui}
    </NumberFormatContext.Provider>,
  );
};

describe("FireCalculator", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    sessionStorage.clear();

    // Default invoke implementation
    vi.mocked(invoke).mockImplementation((cmd) => {
      if (cmd === "get_accounts")
        return Promise.resolve([
          {
            id: 1,
            name: "Test Acct",
            kind: "checking",
            balance: 50000,
            currency: "USD",
          },
        ]);
      if (cmd === "get_stock_quotes") return Promise.resolve([]);
      if (cmd === "get_all_transactions") return Promise.resolve([]);
      return Promise.resolve(null);
    });
  });

  afterEach(() => {
    cleanup();
  });

  it("renders with default values and loads data", async () => {
    renderWithContext(<FireCalculator />);

    expect(screen.getByText("Current Net Worth")).toBeInTheDocument();

    // Check for chart
    expect(screen.getByTestId("fire-chart")).toBeInTheDocument();

    // Wait for the async fetch to complete (loading state might trigger updates)
    await waitFor(() => {
      expect(invoke).toHaveBeenCalledWith("get_accounts");
    });
  });

  it.skip("calculates FIRE number based on expenses", async () => {
    renderWithContext(<FireCalculator />);

    // Inputs are not associated with labels via htmlFor/id, so we use order
    const inputs = screen.getAllByRole("textbox");
    const expensesInput = inputs[1]; // Annual Expenses is 2nd

    fireEvent.change(expensesInput, { target: { value: "50000" } });

    // Debug output if fails
    // screen.debug();

    await waitFor(() => {
      // Use regex to be more flexible with formatting
      expect(screen.getByText(/1250000/)).toBeInTheDocument();
    });
  });

  it("updates state from portfolio data on mount if not user modified", async () => {
    // We mocked computePortfolioTotals to return 50000
    renderWithContext(<FireCalculator />);

    const inputs = await screen.findAllByRole("textbox");
    const netWorthInput = inputs[0]; // Current Net Worth is 1st

    await waitFor(() => {
      expect(netWorthInput.value).toBe("50000");
    });
  });

  it.skip("persists state to sessionStorage", async () => {
    const { unmount } = renderWithContext(<FireCalculator />);

    const inputs = screen.getAllByRole("textbox");
    const expensesInput = inputs[1];
    fireEvent.change(expensesInput, { target: { value: "60000" } });

    // Wait for update
    await waitFor(() => {
      expect(screen.getByText("1500000")).toBeInTheDocument(); // 60000 / 0.04
    });

    // Unmount to simulate page leave
    unmount();

    // Render again
    renderWithContext(<FireCalculator />);

    // Should still be 60000
    const inputs2 = screen.getAllByRole("textbox");
    expect(inputs2[1].value).toBe("60000");
  });

  it.skip("respects user modifications over fetched data", async () => {
    // 1. Render and modify Net Worth manually
    const { unmount } = renderWithContext(<FireCalculator />);
    const inputs = await screen.findAllByRole("textbox");
    const netWorthInput = inputs[0];

    // Wait for initial fetch (50000 from mock)
    await waitFor(() => expect(netWorthInput.value).toBe("50000"));

    // User changes it to 75000
    fireEvent.change(netWorthInput, { target: { value: "75000" } });
    expect(netWorthInput.value).toBe("75000"); // Input updates immediately

    // Wait for effect to save to sessionStorage (debounce/async checks)
    await waitFor(() => {
      const saved = JSON.parse(sessionStorage.getItem("fireCalculatorState"));
      expect(saved).not.toBeNull();
      expect(saved.currentNetWorth).toBe(75000);
      expect(saved.userModified.currentNetWorth).toBe(true);
    });

    unmount();

    // 2. Render again.
    // Even if fetch returns 50000 (mock), it should stay 75000 because it was modified by user
    renderWithContext(<FireCalculator />);

    const inputs2 = await screen.findAllByRole("textbox");
    const netWorthInput2 = inputs2[0];

    await waitFor(() => {
      expect(netWorthInput2.value).toBe("75000");
    });
  });
});
