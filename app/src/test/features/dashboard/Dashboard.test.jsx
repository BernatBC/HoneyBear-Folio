import { render, screen, waitFor } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import Dashboard from "../../../features/dashboard/Dashboard";
import { invoke } from "@tauri-apps/api/core";
import { NumberFormatContext } from "../../../contexts/number-format";

// Mock dependencies
vi.mock("../../../i18n/i18n", () => ({ t: (k) => k }));
vi.mock("../../../hooks/useIsDark", () => ({ default: () => false }));

// Mock Chart.js components to avoid canvas errors
vi.mock("react-chartjs-2", () => ({
  Line: () => <div data-testid="line-chart">Line Chart</div>,
  Doughnut: () => <div data-testid="doughnut-chart">Doughnut Chart</div>,
  Bar: () => <div data-testid="bar-chart">Bar Chart</div>,
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
  ArcElement: {},
  BarElement: {},
}));

// Mock format utils
vi.mock("../../../utils/format", () => ({
  useFormatNumber: () => (val) => `fmt-${val}`,
  useFormatDate: () => (date) => "formatted-date",
  getDatePickerFormat: () => "yyyy-MM-dd",
}));

// Mock child components
vi.mock("../../../features/dashboard/SankeyDiagram", () => ({
  default: () => <div data-testid="sankey">Sankey Diagram</div>,
}));
vi.mock("../../../components/ui/CustomSelect", () => ({
  default: () => <select data-testid="select" />,
}));

describe("Dashboard", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("fetches data and renders charts", async () => {
    // Mock data
    invoke.mockImplementation((cmd) => {
      if (cmd === "get_all_transactions")
        return Promise.resolve([
          {
            id: 1,
            date: "2023-01-01",
            amount: 100.0,
            payee: "Shop",
            category: "Food",
            account_id: 1,
            currency: "USD",
          },
        ]);
      if (cmd === "get_accounts")
        return Promise.resolve([
          { id: 1, name: "Checking", balance: 1000, currency: "USD" },
        ]);
      return Promise.resolve(null);
    });

    render(
      <NumberFormatContext.Provider
        value={{ dateFormat: "MM/dd/yyyy", firstDayOfWeek: 0, currency: "USD" }}
      >
        <Dashboard />
      </NumberFormatContext.Provider>,
    );

    await waitFor(() => {
      expect(invoke).toHaveBeenCalledWith("get_all_transactions");
      expect(invoke).toHaveBeenCalledWith("get_accounts");
    });

    expect(screen.getByTestId("line-chart")).toBeInTheDocument();
  });

  it("uses provided accounts prop if available", async () => {
    const propAccounts = [{ id: 99, name: "Prop Account", balance: 500 }];
    invoke.mockResolvedValue([]); // transactions

    render(
      <NumberFormatContext.Provider
        value={{ dateFormat: "MM/dd/yyyy", firstDayOfWeek: 0, currency: "USD" }}
      >
        <Dashboard accounts={propAccounts} />
      </NumberFormatContext.Provider>,
    );

    // Should fetch transactions but NOT accounts
    await waitFor(() => {
      expect(invoke).toHaveBeenCalledWith("get_all_transactions");
      expect(invoke).not.toHaveBeenCalledWith("get_accounts");
    });
  });
});
