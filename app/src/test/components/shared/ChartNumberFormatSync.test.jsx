import { render } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import ChartNumberFormatSync from "../../../components/shared/ChartNumberFormatSync";
import ChartJS from "chart.js/auto";

// Mock format utility
const mockFormatNumber = vi.fn((value, _options) => `$${value.toFixed(2)}`);
vi.mock("../../../utils/format", () => ({
  useFormatNumber: () => mockFormatNumber,
}));

describe("ChartNumberFormatSync", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Reset Chart.js defaults
    if (ChartJS.defaults.plugins.tooltip.callbacks) {
      delete ChartJS.defaults.plugins.tooltip.callbacks.label;
    }
    if (ChartJS.defaults.scales?.linear?.ticks) {
      delete ChartJS.defaults.scales.linear.ticks.callback;
    }
  });

  it("renders nothing (null)", () => {
    const { container } = render(<ChartNumberFormatSync />);

    expect(container.firstChild).toBeNull();
  });

  it("sets up tooltip label callback on Chart.js defaults", () => {
    render(<ChartNumberFormatSync />);

    expect(ChartJS.defaults.plugins.tooltip.callbacks.label).toBeDefined();
    expect(typeof ChartJS.defaults.plugins.tooltip.callbacks.label).toBe(
      "function",
    );
  });

  it("sets up linear scale tick callback on Chart.js defaults", () => {
    render(<ChartNumberFormatSync />);

    expect(ChartJS.defaults.scales.linear.ticks.callback).toBeDefined();
    expect(typeof ChartJS.defaults.scales.linear.ticks.callback).toBe(
      "function",
    );
  });

  it("tooltip callback formats parsed.y value", () => {
    render(<ChartNumberFormatSync />);

    const callback = ChartJS.defaults.plugins.tooltip.callbacks.label;
    const ctx = {
      dataset: { label: "Revenue" },
      parsed: { y: 1234.56 },
    };

    const _result = callback(ctx);

    expect(mockFormatNumber).toHaveBeenCalledWith(1234.56, {
      style: "currency",
    });
    expect(_result).toContain("Revenue:");
  });

  it("tooltip callback handles doughnut chart raw values", () => {
    render(<ChartNumberFormatSync />);

    const callback = ChartJS.defaults.plugins.tooltip.callbacks.label;
    const ctx = {
      dataset: { label: "Category" },
      parsed: null,
      raw: 500,
    };

    callback(ctx);

    expect(mockFormatNumber).toHaveBeenCalledWith(500, { style: "currency" });
  });

  it("tooltip callback returns label without value for NaN", () => {
    render(<ChartNumberFormatSync />);

    const callback = ChartJS.defaults.plugins.tooltip.callbacks.label;
    const ctx = {
      dataset: { label: "Test" },
      parsed: null,
      raw: "not a number",
    };

    const _result = callback(ctx);

    expect(_result).toBe("Test: ");
  });

  it("tick callback formats numeric values", () => {
    render(<ChartNumberFormatSync />);

    const callback = ChartJS.defaults.scales.linear.ticks.callback;
    callback(1000);

    expect(mockFormatNumber).toHaveBeenCalledWith(1000, { style: "currency" });
  });

  it("tick callback returns original value for NaN", () => {
    render(<ChartNumberFormatSync />);

    const callback = ChartJS.defaults.scales.linear.ticks.callback;
    const result = callback("not a number");

    expect(result).toBe("not a number");
  });
});
