import { useState, useEffect, useMemo } from "react";
import { invoke } from "@tauri-apps/api/core";
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  Title,
  Tooltip,
  Legend,
  Filler,
  ArcElement,
  BarElement,
} from "chart.js";
import { Line, Doughnut, Bar } from "react-chartjs-2";
import "../styles/Dashboard.css";
import PropTypes from "prop-types";
import { computeNetWorth } from "../utils/networth";
import { useFormatNumber, useFormatDate } from "../utils/format";
import { t } from "../i18n/i18n";

ChartJS.register(
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  Title,
  Tooltip,
  Legend,
  Filler,
  ArcElement,
  BarElement,
);

export default function Dashboard({
  accounts: propAccounts = [],
  marketValues = {},
}) {
  const [accounts, setAccounts] = useState(propAccounts);
  const [transactions, setTransactions] = useState([]);
  const [timeRange, setTimeRange] = useState("1Y"); // 1M, 3M, 6M, 1Y, ALL

  const formatNumber = useFormatNumber();
  const formatDate = useFormatDate();

  useEffect(() => {
    const fetchData = async () => {
      try {
        const txs = await invoke("get_all_transactions");
        setTransactions(txs);
        // If parent did not pass accounts, fetch accounts from backend
        if (!propAccounts || propAccounts.length === 0) {
          const accs = await invoke("get_accounts");
          setAccounts(accs);
        }
      } catch (e) {
        console.error("Failed to fetch data:", e);
      }
    };
    fetchData();
  }, [propAccounts]);

  const chartData = useMemo(() => {
    if (accounts.length === 0) return null;

    // 1. Calculate initial balances for each account
    // current_balance = initial_balance + sum(transactions)
    // initial_balance = current_balance - sum(transactions)
    const accountInitialBalances = {};
    accounts.forEach((acc) => {
      const accTxs = transactions.filter((t) => t.account_id === acc.id);
      const totalChange = accTxs.reduce((sum, t) => sum + t.amount, 0);
      accountInitialBalances[acc.id] = acc.balance - totalChange;
    });

    // 2. Collect all relevant dates
    const allDates = new Set();
    const today = new Date().toISOString().split("T")[0];
    allDates.add(today);
    transactions.forEach((t) => allDates.add(t.date));

    let sortedDates = Array.from(allDates).sort();

    // Filter dates based on timeRange
    const now = new Date();
    let cutoffDate = new Date();
    if (timeRange === "1M") cutoffDate.setMonth(now.getMonth() - 1);
    else if (timeRange === "3M") cutoffDate.setMonth(now.getMonth() - 3);
    else if (timeRange === "6M") cutoffDate.setMonth(now.getMonth() - 6);
    else if (timeRange === "1Y") cutoffDate.setFullYear(now.getFullYear() - 1);
    else cutoffDate = new Date(0); // ALL

    sortedDates = sortedDates.filter((d) => new Date(d) >= cutoffDate);

    // Ensure we have at least the cutoff date (or first transaction date) if it's not in the list
    // But for simplicity, we just use the transaction dates + today.
    // If the range starts before the first transaction, we should ideally show a flat line.
    // Let's just stick to the dates we have for now.

    // 3. Calculate balances for each date
    // We need a map of date -> balance for each account and total.

    const datasets = [];

    // Helper to get color
    const colors = [
      "rgb(59, 130, 246)", // blue
      "rgb(16, 185, 129)", // green
      "rgb(245, 158, 11)", // amber
      "rgb(239, 68, 68)", // red
      "rgb(139, 92, 246)", // violet
      "rgb(236, 72, 153)", // pink
      "rgb(14, 165, 233)", // sky
      "rgb(249, 115, 22)", // orange
    ];

    // Total Net Worth Dataset
    const totalData = sortedDates.map((date) => {
      let total = 0;
      accounts.forEach((acc) => {
        const initial = accountInitialBalances[acc.id];
        const accTxs = transactions.filter(
          (t) => t.account_id === acc.id && t.date <= date,
        );
        const change = accTxs.reduce((sum, t) => sum + t.amount, 0);
        total += initial + change;
      });
      return total;
    });

    // Ensure current (last) data point uses current market values (same as Sidebar/Investments)
    if (totalData.length > 0) {
      const currentTotal = computeNetWorth(accounts, marketValues);
      totalData[totalData.length - 1] = currentTotal;
    }

    datasets.push({
      label: "Total Net Worth",
      data: totalData,
      borderColor: "rgb(37, 99, 235)", // brand-600
      backgroundColor: (context) => {
        const ctx = context.chart.ctx;
        const gradient = ctx.createLinearGradient(0, 0, 0, 400);
        gradient.addColorStop(0, "rgba(37, 99, 235, 0.2)");
        gradient.addColorStop(1, "rgba(37, 99, 235, 0)");
        return gradient;
      },
      borderWidth: 3,
      tension: 0.4,
      fill: true,
      pointRadius: 0,
      pointHoverRadius: 6,
      pointHoverBackgroundColor: "rgb(37, 99, 235)",
      pointHoverBorderColor: "#fff",
      pointHoverBorderWidth: 2,
    });

    // Individual Account Datasets
    accounts.forEach((acc, index) => {
      const accData = sortedDates.map((date) => {
        const initial = accountInitialBalances[acc.id];
        const accTxs = transactions.filter(
          (t) => t.account_id === acc.id && t.date <= date,
        );
        const change = accTxs.reduce((sum, t) => sum + t.amount, 0);
        return initial + change;
      });

      const color = colors[index % colors.length];

      datasets.push({
        label: acc.name,
        data: accData,
        borderColor: color,
        backgroundColor: "transparent",
        borderWidth: 2,
        tension: 0.4,
        fill: false,
        pointRadius: 0,
        pointHoverRadius: 4,
        borderDash: [5, 5], // Dashed lines for individual accounts to reduce noise
        hidden: true, // Hide individual accounts by default to keep it clean
      });
    });

    return {
      labels: sortedDates.map((d) => formatDate(d)),
      datasets: datasets,
    };
  }, [accounts, transactions, timeRange, marketValues, formatDate]);

  const doughnutData = useMemo(() => {
    if (accounts.length === 0) return null;

    const assetTypes = {};
    accounts.forEach((acc) => {
      let kind = acc.kind || "cash";
      const accKindLower = kind.toLowerCase();

      // Use current market value for brokerage accounts when available
      const value =
        accKindLower === "brokerage" &&
        marketValues &&
        marketValues[acc.id] !== undefined
          ? marketValues[acc.id]
          : acc.balance || 0;

      if (accKindLower === "brokerage") kind = "Stock";
      else if (accKindLower === "cash") kind = "Cash";
      else kind = kind.charAt(0).toUpperCase() + kind.slice(1);

      assetTypes[kind] = (assetTypes[kind] || 0) + value;
    });

    const labels = Object.keys(assetTypes);
    const data = Object.values(assetTypes);

    const colors = [
      "rgb(59, 130, 246)", // blue-500
      "rgb(16, 185, 129)", // emerald-500
      "rgb(245, 158, 11)", // amber-500
      "rgb(244, 63, 94)", // rose-500
      "rgb(139, 92, 246)", // violet-500
      "rgb(6, 182, 212)", // cyan-500
      "rgb(99, 102, 241)", // indigo-500
      "rgb(249, 115, 22)", // orange-500
    ];

    return {
      labels: labels,
      datasets: [
        {
          data: data,
          backgroundColor: labels.map((_, i) => colors[i % colors.length]),
          borderColor: "transparent",
          borderWidth: 0,
          hoverOffset: 4,
        },
      ],
    };
  }, [accounts, marketValues]);

  const expensesByCategoryData = useMemo(() => {
    if (transactions.length === 0) return null;

    const expenses = transactions.filter(
      (t) => t.amount < 0 && t.category !== "Transfer",
    );
    const categoryTotals = {};

    expenses.forEach((t) => {
      const cat = t.category || "Uncategorized";
      categoryTotals[cat] = (categoryTotals[cat] || 0) + Math.abs(t.amount);
    });

    const sortedCategories = Object.entries(categoryTotals).sort(
      ([, a], [, b]) => b - a,
    );

    const colors = [
      "rgb(244, 63, 94)", // rose-500
      "rgb(249, 115, 22)", // orange-500
      "rgb(245, 158, 11)", // amber-500
      "rgb(16, 185, 129)", // emerald-500
      "rgb(6, 182, 212)", // cyan-500
      "rgb(59, 130, 246)", // blue-500
      "rgb(139, 92, 246)", // violet-500
      "rgb(236, 72, 153)", // pink-500
    ];

    return {
      labels: sortedCategories.map(([cat]) => cat),
      datasets: [
        {
          data: sortedCategories.map(([, amount]) => amount),
          backgroundColor: sortedCategories.map(
            (_, i) => colors[i % colors.length],
          ),
          borderColor: "transparent",
          borderWidth: 0,
          hoverOffset: 4,
        },
      ],
    };
  }, [transactions]);

  const incomeVsExpensesData = useMemo(() => {
    if (transactions.length === 0) return null;

    const now = new Date();
    const keys = []; // keys for matching (YYYY-MM-DD for days or YYYY-MM for months)
    const labels = [];

    if (timeRange === "1M") {
      // Last 30 days
      for (let i = 29; i >= 0; i--) {
        const d = new Date(now);
        d.setDate(now.getDate() - i);
        const key = d.toISOString().slice(0, 10);
        keys.push(key);
        labels.push(formatDate(key));
      }
    } else {
      // Use months for 3M, 6M, 1Y and ALL
      let monthsCount = 6; // default
      if (timeRange === "3M") monthsCount = 3;
      else if (timeRange === "6M") monthsCount = 6;
      else if (timeRange === "1Y") monthsCount = 12;
      else if (timeRange === "ALL") {
        const txDates = transactions.map((t) => t.date).sort();
        const first = new Date(txDates[0]);
        monthsCount =
          (now.getFullYear() - first.getFullYear()) * 12 +
          (now.getMonth() - first.getMonth()) +
          1;
        if (monthsCount < 1) monthsCount = 1;
      }

      for (let i = monthsCount - 1; i >= 0; i--) {
        const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
        const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(
          2,
          "0",
        )}`;
        keys.push(key);
        const opts = { month: "short" };
        if (monthsCount > 12) opts.year = "numeric";
        labels.push(d.toLocaleDateString(undefined, opts));
      }
    }

    const incomeData = new Array(keys.length).fill(0);
    const expenseData = new Array(keys.length).fill(0);

    transactions.forEach((t) => {
      if (t.category === "Transfer") return;
      const key = timeRange === "1M" ? t.date : t.date.slice(0, 7);
      const index = keys.indexOf(key);
      if (index !== -1) {
        if (t.amount > 0) incomeData[index] += t.amount;
        else expenseData[index] += Math.abs(t.amount);
      }
    });

    return {
      labels,
      datasets: [
        {
          label: "Income",
          data: incomeData,
          backgroundColor: "rgb(16, 185, 129)", // emerald-500
          borderRadius: 6,
          barPercentage: 0.6,
          categoryPercentage: 0.8,
        },
        {
          label: "Expenses",
          data: expenseData,
          backgroundColor: "rgb(244, 63, 94)", // rose-500
          borderRadius: 6,
          barPercentage: 0.6,
          categoryPercentage: 0.8,
        },
      ],
    };
  }, [transactions, timeRange, formatDate]);

  const doughnutOptions = {
    responsive: true,
    maintainAspectRatio: false,
    cutout: "75%",
    borderRadius: 8,
    plugins: {
      legend: {
        position: "right",
        labels: {
          usePointStyle: true,
          boxWidth: 8,
          padding: 20,
          font: {
            family: "Inter",
            size: 12,
          },
        },
      },
      title: {
        display: false,
      },
    },
  };

  const expensesOptions = {
    responsive: true,
    maintainAspectRatio: false,
    cutout: "75%",
    borderRadius: 8,
    plugins: {
      legend: {
        position: "right",
        labels: {
          usePointStyle: true,
          boxWidth: 8,
          padding: 20,
          font: {
            family: "Inter",
            size: 12,
          },
        },
      },
      title: {
        display: false,
      },
    },
  };

  const barOptions = useMemo(() => {
    const labelMap = {
      "1M": "Last 1 Month",
      "3M": "Last 3 Months",
      "6M": "Last 6 Months",
      "1Y": "Last 1 Year",
      ALL: "All time",
    };
    const titleText = `Income vs Expenses (${labelMap[timeRange] || timeRange})`;

    return {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: {
          position: "top",
          align: "end",
          labels: {
            usePointStyle: true,
            boxWidth: 8,
            font: {
              family: "Inter",
              size: 12,
            },
          },
        },
        title: {
          display: false,
        },
        tooltip: {
          backgroundColor: "rgba(15, 23, 42, 0.9)",
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
        },
      },
      scales: {
        y: {
          beginAtZero: true,
          border: {
            display: false,
          },
          grid: {
            color: "rgba(226, 232, 240, 0.6)",
            borderDash: [4, 4],
            drawBorder: false,
          },
          ticks: {
            font: {
              family: "Inter",
              size: 11,
            },
            color: "rgb(100, 116, 139)",
            padding: 10,
            callback: function (value) {
              const num = Number(value);
              if (Number.isNaN(num)) return value;
              return formatNumber(num, {
                style: "currency",
                minimumFractionDigits: 0,
                maximumFractionDigits: 0,
              });
            },
          },
        },
        x: {
          grid: {
            display: false,
            drawBorder: false,
          },
          ticks: {
            font: {
              family: "Inter",
              size: 11,
            },
            color: "rgb(100, 116, 139)",
          },
        },
      },
    };
  }, [timeRange, formatNumber]);

  const options = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: {
        display: false,
      },
      title: {
        display: false,
      },
      tooltip: {
        backgroundColor: "rgba(15, 23, 42, 0.9)",
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
        displayColors: false,
        callbacks: {
          label: function (context) {
            let label = context.dataset.label || "";
            if (label) {
              label += ": ";
            }
            if (context.parsed.y !== null) {
              label += formatNumber(context.parsed.y, {
                style: "currency",
                minimumFractionDigits: 0,
                maximumFractionDigits: 0,
              });
            }
            return label;
          },
        },
      },
    },
    scales: {
      y: {
        beginAtZero: false,
        border: {
          display: false,
        },
        grid: {
          color: "rgba(226, 232, 240, 0.6)",
          borderDash: [4, 4],
          drawBorder: false,
        },
        ticks: {
          font: {
            family: "Inter",
            size: 11,
          },
          color: "rgb(100, 116, 139)",
          padding: 10,
          callback: function (value) {
            const num = Number(value);
            if (Number.isNaN(num)) return value;
            return formatNumber(num, {
              style: "currency",
              minimumFractionDigits: 0,
              maximumFractionDigits: 0,
            });
          },
        },
      },
      x: {
        grid: {
          display: false,
          drawBorder: false,
        },
        ticks: {
          font: {
            family: "Inter",
            size: 11,
          },
          color: "rgb(100, 116, 139)",
          maxRotation: 0,
          autoSkip: true,
          maxTicksLimit: 8,
        },
      },
    },
  };

  return (
    <div className="dashboard-container">
      <div className="dashboard-header">
        <div>
          <h2 className="dashboard-title">{t("dashboard.title")}</h2>
          <p className="dashboard-subtitle">
            Overview of your financial performance
          </p>
        </div>

        <div className="flex items-center gap-3">
          <div className="time-range-selector">
            {["1M", "3M", "6M", "1Y", "ALL"].map((range) => (
              <button
                key={range}
                onClick={() => setTimeRange(range)}
                className={`time-range-button ${
                  timeRange === range
                    ? "time-range-button-active"
                    : "time-range-button-inactive"
                }`}
              >
                {range}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Summary Cards */}
      <div className="summary-cards-grid">
        <div className="summary-card group">
          <h3 className="summary-card-title">
            {t("dashboard.current_net_worth")}
          </h3>
          <p className="summary-card-value">
            {formatNumber(computeNetWorth(accounts, marketValues), {
              style: "currency",
            })}
          </p>
        </div>
        <div className="summary-card group">
          <h3 className="summary-card-title">
            {t("dashboard.total_accounts")}
          </h3>
          <p className="summary-card-value">{accounts.length}</p>
        </div>
        <div className="summary-card group">
          <h3 className="summary-card-title">
            {t("dashboard.total_transactions")}
          </h3>
          <p className="summary-card-value">{transactions.length}</p>
        </div>
      </div>

      <div className="chart-container">
        <div className="chart-header">
          <h3 className="chart-title">{t("dashboard.networth_evolution")}</h3>
          <p className="chart-subtitle">
            Track your financial growth over time
          </p>
        </div>
        <div className="chart-wrapper">
          {chartData ? (
            <Line options={options} data={chartData} />
          ) : (
            <div className="loading-container">
              <div className="loading-content">
                <div className="loading-spinner"></div>
                <span className="loading-text">
                  {t("loading.loading_data")}
                </span>
              </div>
            </div>
          )}
        </div>
      </div>

      <div className="charts-grid">
        {/* Income vs Expenses */}
        <div className="chart-card chart-card-full">
          {incomeVsExpensesData ? (
            <Bar options={barOptions} data={incomeVsExpensesData} />
          ) : (
            <div className="loading-container">
              <div className="loading-content">
                <div className="loading-spinner"></div>
                <span className="loading-text">
                  {t("loading.loading_data")}
                </span>
              </div>
            </div>
          )}
        </div>

        {/* Asset Allocation */}
        <div className="chart-card">
          {doughnutData ? (
            <Doughnut options={doughnutOptions} data={doughnutData} />
          ) : (
            <div className="loading-container">
              <div className="loading-content">
                <div className="loading-spinner"></div>
                <span className="loading-text">Loading data...</span>
              </div>
            </div>
          )}
        </div>

        {/* Expenses by Category */}
        <div className="chart-card">
          {expensesByCategoryData ? (
            <Doughnut options={expensesOptions} data={expensesByCategoryData} />
          ) : (
            <div className="loading-container">
              <div className="loading-content">
                <div className="loading-spinner"></div>
                <span className="loading-text">
                  {t("loading.loading_data")}
                </span>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

Dashboard.propTypes = {
  accounts: PropTypes.array,
  marketValues: PropTypes.object,
};
