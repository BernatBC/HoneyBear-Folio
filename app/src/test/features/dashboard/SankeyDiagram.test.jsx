import { render } from "@testing-library/react";
import { describe, it, expect, vi } from "vitest";

// Mock dependencies BEFORE import
vi.mock("react-chartjs-2", () => ({
  Chart: () => <div data-testid="sankey-chart">Sankey Chart</div>
}));

vi.mock("chart.js", () => ({
  Chart: { register: vi.fn() },
  Tooltip: {},
  Legend: {},
  Title: {},
  LinearScale: {}
}));

vi.mock("chartjs-chart-sankey", () => ({
  SankeyController: {},
  Flow: {}
}));

vi.mock("../../../utils/format", () => ({
  useFormatNumber: () => (val) => `${val}`
}));

vi.mock("../../../i18n/i18n", () => ({
  t: (k) => k
}));

vi.mock("../../../hooks/useIsDark", () => ({
  default: () => false
}));

// Import component AFTER mocks
import SankeyDiagram from "../../../features/dashboard/SankeyDiagram";

describe("SankeyDiagram", () => {
  it("renders without crashing", () => {
    const transactions = [];
    render(<SankeyDiagram transactions={transactions} />);
    expect(true).toBe(true);
  });
});
