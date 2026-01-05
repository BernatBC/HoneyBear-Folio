import { useEffect } from "react";
import ChartJS from "chart.js/auto";
import { useFormatNumber } from "../utils/format";

export default function ChartNumberFormatSync() {
  const formatNumber = useFormatNumber();

  useEffect(() => {
    // Tooltip label: tries to handle line/bar (parsed.y), doughnut (raw), or dataset data
    ChartJS.defaults.plugins.tooltip.callbacks.label = function (ctx) {
      const label = ctx.dataset?.label ? ctx.dataset.label + ": " : "";

      // Try several places to get the numeric value
      const value =
        (ctx.parsed && (ctx.parsed.y ?? ctx.parsed)) ??
        ctx.raw ??
        (ctx.dataset && ctx.dataset.data && ctx.dataIndex != null
          ? ctx.dataset.data[ctx.dataIndex]
          : undefined);

      if (value == null || Number.isNaN(Number(value))) return label;

      // Use currency style so grouping and decimal separators follow the app locale
      return (
        label +
        formatNumber(Number(value), {
          style: "currency",
        })
      );
    };

    // Linear scales (y axes) ticks
    if (ChartJS.defaults.scales && ChartJS.defaults.scales.linear) {
      ChartJS.defaults.scales.linear.ticks.callback = function (v) {
        // v might be a string (Chart passes numbers or strings)
        const num = Number(v);
        if (Number.isNaN(num)) return v;
        return formatNumber(num, {
          style: "currency",
        });
      };
    }
  }, [formatNumber]);

  return null;
}
