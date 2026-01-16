import { useMemo } from "react";
import {
  Chart as ChartJS,
  Tooltip,
  Legend,
  Title,
  LinearScale,
} from "chart.js";
import { SankeyController, Flow } from "chartjs-chart-sankey";
import { Chart } from "react-chartjs-2";
import PropTypes from "prop-types";
import { useFormatNumber } from "../utils/format";
import { t } from "../i18n/i18n";
import useIsDark from "../hooks/useIsDark";

// Register the controller and elements
ChartJS.register(SankeyController, Flow, Tooltip, Legend, Title, LinearScale);

export default function SankeyDiagram({
  transactions,
  timeRange,
  customStartDate,
  customEndDate,
  accountMap,
  getPrice,
  appCurrency,
}) {
  const isDark = useIsDark();
  const formatNumber = useFormatNumber();

  const data = useMemo(() => {
    if (transactions.length === 0) return null;

    const now = new Date();
    let startDate = new Date(0);
    let endDate = new Date();

    if (timeRange === "1M") {
      startDate = new Date(now);
      startDate.setDate(now.getDate() - 30);
    } else if (timeRange === "3M") {
      startDate = new Date(now);
      startDate.setMonth(now.getMonth() - 3);
    } else if (timeRange === "6M") {
      startDate = new Date(now);
      startDate.setMonth(now.getMonth() - 6);
    } else if (timeRange === "YTD") {
      startDate = new Date(now.getFullYear(), 0, 1);
    } else if (timeRange === "1Y") {
      startDate = new Date(now);
      startDate.setFullYear(now.getFullYear() - 1);
    } else if (timeRange === "CUSTOM") {
      startDate = new Date(customStartDate);
      endDate = new Date(customEndDate);
    }

    startDate.setHours(0, 0, 0, 0);
    endDate.setHours(23, 59, 59, 999);

    // Use local date components to avoid timezone shifts
    const startStr = `${startDate.getFullYear()}-${String(startDate.getMonth() + 1).padStart(2, "0")}-${String(startDate.getDate()).padStart(2, "0")}`;
    const endStr = `${endDate.getFullYear()}-${String(endDate.getMonth() + 1).padStart(2, "0")}-${String(endDate.getDate()).padStart(2, "0")}`;

    const relevantTransactions = transactions.filter(
      (t) =>
        t.category !== "Transfer" && t.date >= startStr && t.date <= endStr,
    );

    if (relevantTransactions.length === 0) return { empty: true };

    const incomeCategories = {};
    const expenseCategories = {};
    const investmentCategories = {};
    let totalIncome = 0;
    let totalExpense = 0;

    // Helper to detect investment-like categories
    const isInvestment = (cat) => {
      const lower = cat.toLowerCase();
      return (
        lower.includes("invest") ||
        lower.includes("savings") ||
        lower.includes("brokerage") ||
        lower.includes("deposit")
      );
    };

    relevantTransactions.forEach((t) => {
      const acc = accountMap[t.account_id];
      const accCurrency = acc?.currency || appCurrency;
      const rateToApp =
        accCurrency === appCurrency
          ? 1.0
          : getPrice(`${accCurrency}${appCurrency}=X`, t.date) || 1.0;
      const amount = t.amount * rateToApp;

      if (amount > 0) {
        const cat = t.category || t("general.uncategorized");
        incomeCategories[cat] = (incomeCategories[cat] || 0) + amount;
        totalIncome += amount;
      } else if (amount < 0) {
        const cat = t.category || t("general.uncategorized");
        const absAmount = Math.abs(amount);

        if (isInvestment(cat)) {
          investmentCategories[cat] =
            (investmentCategories[cat] || 0) + absAmount;
        } else {
          expenseCategories[cat] = (expenseCategories[cat] || 0) + absAmount;
        }
        totalExpense += absAmount;
      }
    });

    if (totalIncome === 0 && totalExpense === 0) return { empty: true };

    const flows = [];
    const labels = {};
    const priorityMap = {};

    // System Node IDs
    const ID_BUDGET = "sys:budget";
    const ID_EXPENSES_GROUP = "sys:expenses";
    const ID_INVESTMENTS_GROUP = "sys:investments";
    const ID_SURPLUS = "sys:surplus";
    const ID_DEFICIT = "sys:deficit";

    // Initialize labels for system nodes
    labels[ID_BUDGET] = "Budget";
    labels[ID_EXPENSES_GROUP] = "Expenses";
    labels[ID_INVESTMENTS_GROUP] = "Investments & Savings";
    labels[ID_SURPLUS] = "Savings";
    labels[ID_DEFICIT] = "Deficit";

    // Set priorities for system nodes to enforce vertical order
    priorityMap[ID_INVESTMENTS_GROUP] = 1000; // Top
    priorityMap[ID_SURPLUS] = 900; // Just below Inv Group
    priorityMap[ID_BUDGET] = 500; // Middle
    priorityMap[ID_DEFICIT] = 500; // Middle
    priorityMap[ID_EXPENSES_GROUP] = 1200; // Bottom relative to others

    // 1. Income -> Budget
    Object.entries(incomeCategories)
      .sort(([, a], [, b]) => b - a)
      .forEach(([cat, value]) => {
        const id = `inc:${cat}`;
        flows.push({ from: id, to: ID_BUDGET, flow: value });
        labels[id] = cat;
        priorityMap[id] = 600; // Left side, near Budget
      });

    // 2. Budget -> Intermediate Nodes
    let expensesTotal = 0;
    Object.values(expenseCategories).forEach((v) => (expensesTotal += v));

    let investmentsTotal = 0;
    Object.values(investmentCategories).forEach((v) => (investmentsTotal += v));

    let surplus = 0;
    let deficit = 0;

    if (totalIncome > totalExpense) {
      surplus = totalIncome - totalExpense;
    } else {
      deficit = totalExpense - totalIncome;
    }

    const totalInvestmentsAndSavings = investmentsTotal + surplus;

    if (totalInvestmentsAndSavings > 0) {
      flows.push({
        from: ID_BUDGET,
        to: ID_INVESTMENTS_GROUP,
        flow: totalInvestmentsAndSavings,
      });
    }

    if (expensesTotal > 0) {
      flows.push({
        from: ID_BUDGET,
        to: ID_EXPENSES_GROUP,
        flow: expensesTotal,
      });
    }

    // Handle Deficit
    if (deficit > 0) {
      flows.push({
        from: ID_DEFICIT,
        to: ID_BUDGET,
        flow: deficit,
      });
    }

    // 3. Intermediate -> Final Categories

    // Explicitly add "Savings" (Surplus) flow if there is any surplus
    if (surplus > 0) {
      flows.push({
        from: ID_INVESTMENTS_GROUP,
        to: ID_SURPLUS,
        flow: surplus,
      });
    }

    Object.entries(investmentCategories)
      .sort(([, a], [, b]) => b - a)
      .forEach(([cat, value]) => {
        const id = `inv:${cat}`;
        flows.push({ from: ID_INVESTMENTS_GROUP, to: id, flow: value });
        labels[id] = cat;
        priorityMap[id] = 800; // Right side, below Surplus
      });

    Object.entries(expenseCategories)
      .sort(([, a], [, b]) => b - a)
      .forEach(([cat, value]) => {
        const id = `exp:${cat}`;
        flows.push({ from: ID_EXPENSES_GROUP, to: id, flow: value });
        labels[id] = cat;
        priorityMap[id] = 1000; // Right side, bottom
      });

    // Node colors
    const getColor = (key) => {
      if (key === ID_BUDGET) return isDark ? "#475569" : "#94a3b8";
      if (key === ID_INVESTMENTS_GROUP) return isDark ? "#10b981" : "#10b981";
      if (key === ID_EXPENSES_GROUP) return isDark ? "#ef4444" : "#ef4444";
      if (key === ID_DEFICIT) return isDark ? "#ef4444" : "#ef4444";
      if (key === ID_SURPLUS) return isDark ? "#10b981" : "#34d399";

      if (key.startsWith("inc:")) {
        // We can check the original cat name if needed, but for now uniform color
        // const cat = key.substring(4);
        return isDark ? "#059669" : "#34d399";
      }
      if (key.startsWith("inv:")) {
        return isDark ? "#10b981" : "#34d399";
      }
      if (key.startsWith("exp:")) {
        return isDark ? "#e11d48" : "#fb7185";
      }

      return isDark ? "#475569" : "#94a3b8";
    };

    return {
      datasets: [
        {
          label: "Cash Flow",
          data: flows,
          colorFrom: (c) => getColor(c.dataset.data[c.dataIndex].from),
          colorTo: (c) => getColor(c.dataset.data[c.dataIndex].to),
          colorMode: "gradient",
          labels: labels,
          priority: priorityMap,

          // Styling
          size: "max",
          borderWidth: 0,
          color: isDark ? "#e2e8f0" : "#1e293b", // Text color: slate-200 : slate-800
          font: {
            family: "Inter",
            size: 12,
            weight: "500",
          },
        },
      ],
    };
  }, [
    transactions,
    timeRange,
    customStartDate,
    customEndDate,
    accountMap,
    getPrice,
    appCurrency,
    isDark, // Added isDark dependency
    // NOTE: `t` (i18n) is intentionally excluded from deps because it's an external stable function
  ]);

  const options = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: {
        display: false,
      },
      tooltip: {
        backgroundColor: isDark
          ? "rgba(15, 23, 42, 0.9)"
          : "rgba(255, 255, 255, 0.9)",
        titleColor: isDark ? "rgb(255, 255, 255)" : "rgb(15, 23, 42)",
        bodyColor: isDark ? "rgb(255, 255, 255)" : "rgb(15, 23, 42)",
        padding: 12,
        cornerRadius: 8,
        titleFont: {
          family: "Inter",
          size: 13,
        },
        bodyFont: {
          family: "Inter",
          size: 12,
        },
        callbacks: {
          label: function (context) {
            const item = context.raw;
            return `${item.from} -> ${item.to}: ${formatNumber(item.flow, { style: "currency" })}`;
          },
        },
      },
    },
    layout: {
      padding: 20,
    },
  };

  if (!data || data.empty) {
    return (
      <div className="col-span-full flex-1 flex flex-col items-center justify-center text-slate-400 dark:text-slate-500 py-8">
        <p className="text-sm font-semibold text-slate-600 dark:text-slate-400 mb-1">
          {t("dashboard.no_data_title") || "No Data"}
        </p>
        <p className="text-xs text-slate-400 dark:text-slate-500">
          {t("dashboard.no_data_body") ||
            "Not enough data to generate the diagram."}
        </p>
      </div>
    );
  }

  return <Chart type="sankey" data={data} options={options} />;
}

SankeyDiagram.propTypes = {
  transactions: PropTypes.array.isRequired,
  timeRange: PropTypes.string.isRequired,
  customStartDate: PropTypes.instanceOf(Date),
  customEndDate: PropTypes.instanceOf(Date),
  accountMap: PropTypes.object.isRequired,
  getPrice: PropTypes.func.isRequired,
  appCurrency: PropTypes.string,
};
