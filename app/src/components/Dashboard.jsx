import { useState, useEffect, useMemo, useCallback } from "react";
import { invoke } from "@tauri-apps/api/core";
import DatePicker from "react-datepicker";
import "react-datepicker/dist/react-datepicker.css";
import "../styles/datepicker.css";
import { Calendar } from "lucide-react";
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
import {
  useFormatNumber,
  useFormatDate,
  getDatePickerFormat,
} from "../utils/format";
import { buildHoldingsFromTransactions } from "../utils/investments";
import { useNumberFormat } from "../contexts/number-format";
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

// useIsDark moved to a shared hook at src/hooks/useIsDark.js
import useIsDark from "../hooks/useIsDark";
import SankeyDiagram from "./SankeyDiagram";

export default function Dashboard({
  accounts: propAccounts = [],
  marketValues = {},
}) {
  const [accounts, setAccounts] = useState(propAccounts);
  const [transactions, setTransactions] = useState([]);
  const [dailyPrices, setDailyPrices] = useState({});
  const [quotes, setQuotes] = useState([]);
  const [timeRange, setTimeRange] = useState("1Y"); // 1M, 3M, 6M, YTD, 1Y, ALL, CUSTOM
  const [customStartDate, setCustomStartDate] = useState(
    new Date(new Date().setFullYear(new Date().getFullYear() - 1)),
  );
  const [customEndDate, setCustomEndDate] = useState(new Date());

  const isDark = useIsDark();

  const formatNumber = useFormatNumber();
  const formatDate = useFormatDate();
  const {
    dateFormat,
    firstDayOfWeek,
    currency: appCurrency,
  } = useNumberFormat();

  const accountMap = useMemo(() => {
    const map = {};
    accounts.forEach((acc) => {
      map[acc.id] = acc;
    });
    return map;
  }, [accounts]);

  useEffect(() => {
    const fetchData = async () => {
      try {
        const txs = await invoke("get_all_transactions");
        setTransactions(txs);

        // If parent passed accounts, use them; otherwise fetch from backend
        if (propAccounts && propAccounts.length > 0) {
          setAccounts(propAccounts);
        } else {
          const accs = await invoke("get_accounts");
          setAccounts(accs);
        }
      } catch (e) {
        console.error("Failed to fetch data:", e);
      }
    };
    fetchData();
  }, [propAccounts]);

  useEffect(() => {
    const fetchQuotes = async () => {
      if (transactions.length === 0) return;
      const { currentHoldings } = buildHoldingsFromTransactions(transactions);
      if (currentHoldings.length === 0) {
        setQuotes([]);
        return;
      }
      const tickers = currentHoldings.map((h) => h.ticker);
      const uniqueTickers = [...new Set(tickers)];
      try {
        const qs = await invoke("get_stock_quotes", { tickers: uniqueTickers });
        setQuotes(qs);
      } catch (e) {
        console.error("Failed to fetch quotes:", e);
      }
    };
    fetchQuotes();
  }, [transactions]);

  useEffect(() => {
    const fetchDailyPrices = async () => {
      const tickers = new Set();
      const appCurrency = localStorage.getItem("hb_currency") || "USD";

      // Include all tickers from transactions
      transactions.forEach((t) => {
        if (t.ticker) tickers.add(t.ticker);
      });

      // Also include currency pairs for multi-currency support
      const accountMap = {};
      accounts.forEach((a) => (accountMap[a.id] = a));

      transactions.forEach((t) => {
        const acc = accountMap[t.account_id];
        const accCurrency = acc?.currency || appCurrency;
        const txCurrency = t.currency || accCurrency;

        if (txCurrency !== accCurrency) {
          tickers.add(`${txCurrency}${accCurrency}=X`);
        }
      });

      accounts.forEach((acc) => {
        const accCurrency = acc.currency || appCurrency;
        if (accCurrency !== appCurrency) {
          tickers.add(`${accCurrency}${appCurrency}=X`);
        }
      });

      if (tickers.size === 0) return;

      try {
        // Trigger update first
        await invoke("update_daily_stock_prices", {
          tickers: Array.from(tickers),
        });

        // Then fetch
        const pricesMap = {};
        for (const ticker of tickers) {
          const prices = await invoke("get_daily_stock_prices", { ticker });
          // Sort prices by date ascending to ensure getPrice binary search/linear scan works
          prices.sort((a, b) => (a.date > b.date ? 1 : -1));

          // Convert to map for faster lookup: date -> price
          const priceByDate = {};
          prices.forEach((p) => {
            priceByDate[p.date] = p.price;
          });
          pricesMap[ticker] = { list: prices, map: priceByDate };
        }
        setDailyPrices(pricesMap);
      } catch (e) {
        console.error("Failed to fetch daily prices:", e);
      }
    };

    if (transactions.length > 0) {
      fetchDailyPrices();
    }
  }, [transactions, accounts, propAccounts]);

  // Helper to get price
  const getPrice = useCallback(
    (ticker, date) => {
      if (!dailyPrices[ticker]) return 0;
      const { list, map } = dailyPrices[ticker];
      if (map[date]) return map[date];
      // Find last available price
      let lastPrice = 0;
      for (const p of list) {
        if (p.date > date) break;
        lastPrice = p.price;
      }
      return lastPrice;
    },
    [dailyPrices],
  );

  const chartData = useMemo(() => {
    // Require accounts and at least one transaction to render the net worth evolution chart
    if (accounts.length === 0 || transactions.length === 0) return null;

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
    const now = new Date();
    let cutoffDate = new Date();
    let endDate = new Date();
    endDate.setHours(0, 0, 0, 0);

    if (timeRange === "1M") cutoffDate.setMonth(now.getMonth() - 1);
    else if (timeRange === "3M") cutoffDate.setMonth(now.getMonth() - 3);
    else if (timeRange === "6M") cutoffDate.setMonth(now.getMonth() - 6);
    else if (timeRange === "YTD")
      cutoffDate = new Date(now.getFullYear(), 0, 1);
    else if (timeRange === "1Y") cutoffDate.setFullYear(now.getFullYear() - 1);
    else if (timeRange === "CUSTOM") {
      cutoffDate = new Date(customStartDate);
      endDate = new Date(customEndDate);
    } else cutoffDate = new Date(0); // ALL

    cutoffDate.setHours(0, 0, 0, 0);
    endDate.setHours(0, 0, 0, 0);

    // If ALL, find the first transaction date
    if (timeRange === "ALL" && transactions.length > 0) {
      const firstTxDate = new Date(
        transactions.reduce(
          (min, t) => (t.date < min ? t.date : min),
          transactions[0].date,
        ),
      );
      cutoffDate = firstTxDate;
      cutoffDate.setHours(0, 0, 0, 0);
    } else if (timeRange === "ALL") {
      cutoffDate.setFullYear(now.getFullYear() - 1); // Default to 1Y if no txs
      cutoffDate.setHours(0, 0, 0, 0);
    }

    // Ensure we never show dates earlier than the first transaction — start chart at firstTxDate
    if (transactions.length > 0) {
      const firstTxDate = new Date(
        transactions.reduce(
          (min, t) => (t.date < min ? t.date : min),
          transactions[0].date,
        ),
      );
      // Normalize to midnight for consistent comparisons
      firstTxDate.setHours(0, 0, 0, 0);
      if (firstTxDate > cutoffDate && timeRange !== "CUSTOM")
        cutoffDate = new Date(firstTxDate);
    }

    const sortedDates = [];
    let d = new Date(cutoffDate);
    d.setHours(0, 0, 0, 0);

    while (d <= endDate) {
      // Use local date components to avoid UTC conversion issues that can
      // shift the date to the previous day for users in negative timezones.
      const localDate = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(
        2,
        "0",
      )}-${String(d.getDate()).padStart(2, "0")}`;
      sortedDates.push(localDate);
      d.setDate(d.getDate() + 1);
    }

    // Index ticker currencies from transactions
    const tickerCurrencies = {};
    transactions.forEach((t) => {
      if (t.ticker && t.currency) {
        tickerCurrencies[t.ticker] = t.currency;
      }
    });

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
        const accCurrency = acc.currency || appCurrency;
        const initial = accountInitialBalances[acc.id];
        const accTxs = transactions.filter(
          (t) => t.account_id === acc.id && t.date <= date,
        );
        // Include all transactions (even stock buys/sells) to get correct cash balance
        const cashChange = accTxs.reduce((sum, t) => sum + t.amount, 0);
        const cashBalance = initial + cashChange;

        const holdings = {};
        accTxs.forEach((t) => {
          if (t.ticker && t.shares) {
            holdings[t.ticker] = (holdings[t.ticker] || 0) + t.shares;
          }
        });

        let stockValue = 0;
        for (const [ticker, shares] of Object.entries(holdings)) {
          if (Math.abs(shares) > 0.0001) {
            const price = getPrice(ticker, date);
            const tickerCurr = tickerCurrencies[ticker] || accCurrency;
            const rateToAcc =
              tickerCurr === accCurrency
                ? 1.0
                : getPrice(`${tickerCurr}${accCurrency}=X`, date) || 1.0;
            stockValue += shares * price * rateToAcc;
          }
        }

        const rateToApp =
          accCurrency === appCurrency
            ? 1.0
            : getPrice(`${accCurrency}${appCurrency}=X`, date) || 1.0;
        total += (cashBalance + stockValue) * rateToApp;
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
      const accCurrency = acc.currency || appCurrency;

      // Build both the native (account currency) and converted (app currency) series
      const accDataNative = [];
      const accDataConverted = [];

      sortedDates.forEach((date) => {
        const initial = accountInitialBalances[acc.id];
        const accTxs = transactions.filter(
          (t) => t.account_id === acc.id && t.date <= date,
        );
        // Include all transactions (even stock buys/sells) to get correct cash balance
        const cashChange = accTxs.reduce((sum, t) => sum + t.amount, 0);
        const cashBalance = initial + cashChange;

        const holdings = {};
        accTxs.forEach((t) => {
          if (t.ticker && t.shares) {
            holdings[t.ticker] = (holdings[t.ticker] || 0) + t.shares;
          }
        });

        let stockValue = 0;
        for (const [ticker, shares] of Object.entries(holdings)) {
          if (Math.abs(shares) > 0.0001) {
            const price = getPrice(ticker, date);
            const tickerCurr = tickerCurrencies[ticker] || accCurrency;
            const rateToAcc =
              tickerCurr === accCurrency
                ? 1.0
                : getPrice(`${tickerCurr}${accCurrency}=X`, date) || 1.0;
            stockValue += shares * price * rateToAcc;
          }
        }

        const nativeVal = cashBalance + stockValue;
        const rateToApp =
          accCurrency === appCurrency
            ? 1.0
            : getPrice(`${accCurrency}${appCurrency}=X`, date) || 1.0;
        const convertedVal = nativeVal * rateToApp;

        accDataNative.push(nativeVal);
        accDataConverted.push(convertedVal);
      });

      const color = colors[index % colors.length];

      datasets.push({
        label: acc.name,
        data: accDataConverted,
        originalData: accDataNative,
        accountCurrency: accCurrency,
        borderColor: color,
        backgroundColor: "transparent",
        borderWidth: 2,
        tension: 0.4,
        fill: false,
        pointRadius: 0,
        pointHoverRadius: 4,
        borderDash: [5, 5], // Dashed lines for individual accounts to reduce noise
        hidden: true, // Hide individual accounts by default to keep it clean
        accountId: acc.id,
        _color: color, // helper for legend rendering
      });
    });

    return {
      labels: sortedDates.map((d) => formatDate(d)),
      datasets: datasets,
    };
  }, [
    accounts,
    transactions,
    timeRange,
    customStartDate,
    customEndDate,
    marketValues,
    formatDate,
    appCurrency,
    getPrice,
  ]);

  // Track user toggles for account visibility; derive the actual visibility from accounts + toggles
  const [toggledAccounts, setToggledAccounts] = useState(() => ({}));

  const visibleAccounts = useMemo(() => {
    const map = {};
    accounts.forEach((a) => {
      map[a.id] = !!toggledAccounts[a.id];
    });
    return map;
  }, [accounts, toggledAccounts]);

  const toggleAccountVisibility = (accountId) => {
    setToggledAccounts((prev) => ({ ...prev, [accountId]: !prev[accountId] }));
  };

  const setAllAccountsVisibility = (visible) => {
    const map = {};
    accounts.forEach((a) => (map[a.id] = visible));
    setToggledAccounts(map);
  };

  const chartDataVisible = useMemo(() => {
    if (!chartData) return null;
    const datasets = chartData.datasets.map((ds) => {
      if (ds.accountId) {
        const isVisible = !!visibleAccounts[ds.accountId];
        return { ...ds, hidden: !isVisible };
      }
      return ds;
    });
    return { ...chartData, datasets };
  }, [chartData, visibleAccounts]);

  const doughnutData = useMemo(() => {
    if (accounts.length === 0) return null;

    const assetTypes = {};

    // Helper to determine asset type
    const getAssetType = (ticker) => {
      const q = quotes.find(
        (q) => q.symbol.toLowerCase() === ticker.toLowerCase(),
      );
      if (!q || !q.quoteType) return "Stock";

      const type = q.quoteType.toUpperCase();
      if (type === "EQUITY") return "Stock";
      if (type === "ETF") return "ETF";
      if (type === "CRYPTOCURRENCY") return "Crypto";
      if (type === "MUTUALFUND") return "Mutual Fund";
      if (type === "FUTURE") return "Future";
      if (type === "INDEX") return "Index";
      if (type === "COMMODITY") return "Commodities";
      return "Stock";
    };

    accounts.forEach((acc) => {
      let kind = acc.kind || "cash";
      let accKindLower = kind.toLowerCase();
      const exchangeRate = acc.exchange_rate || 1.0;

      // Check if this account has any holdings (transactions with ticker)
      // If it does, we treat it as an investment capable account regardless of 'kind'
      const accTxs = transactions.filter((t) => t.account_id === acc.id);
      const { currentHoldings } = buildHoldingsFromTransactions(accTxs);

      if (currentHoldings.length > 0) {
        accKindLower = "brokerage";
      }

      if (accKindLower === "brokerage") {
        // Calculate holdings for this account
        let holdingsValue = 0;

        currentHoldings.forEach((h) => {
          // Find price
          let price = 0;
          const quote = quotes.find(
            (q) => q.symbol.toLowerCase() === h.ticker.toLowerCase(),
          );
          if (quote) {
            price = quote.regularMarketPrice;
          } else if (dailyPrices[h.ticker]) {
            const { list } = dailyPrices[h.ticker];
            if (list.length > 0) price = list[list.length - 1].price;
          }

          const val = h.shares * price * exchangeRate;
          holdingsValue += val;

          const type = getAssetType(h.ticker);
          assetTypes[type] = (assetTypes[type] || 0) + val;
        });

        // Remainder is Cash
        // Calculate the cash component from the account balance
        // We assume acc.balance correctly tracks the cash balance of the account (money in - money out - buys + sells)
        const cashBalanceConverted = (acc.balance || 0) * exchangeRate;
        const cashValue = cashBalanceConverted;

        // Add to Cash if significant
        if (
          holdingsValue === 0 &&
          currentHoldings.length === 0 &&
          Math.abs(cashBalanceConverted) > 1.0
        ) {
          // Case: Account marked as brokerage manually but no holdings transactions entered.
          // Treat all balance as "Stock" because presumably the user is tracking total value manually in the balance field.
          assetTypes["Stock"] =
            (assetTypes["Stock"] || 0) + cashBalanceConverted;
        } else if (Math.abs(cashValue) > 1.0) {
          assetTypes["Cash"] = (assetTypes["Cash"] || 0) + cashValue;
        }
      } else {
        // Non-Brokerage (e.g. Cash, Savings)
        // If they have no holdings (otherwise they'd be in the 'if' above),
        // Then the value is just the balance.
        const value = (acc.balance || 0) * exchangeRate;

        if (accKindLower === "cash") kind = "Cash";
        else kind = kind.charAt(0).toUpperCase() + kind.slice(1);

        assetTypes[kind] = (assetTypes[kind] || 0) + value;
      }
    });

    const labels = Object.keys(assetTypes);
    const rawData = Object.values(assetTypes);
    const data = rawData.map((v) => Math.abs(v));

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
          originalData: rawData,
          backgroundColor: rawData.map((v, i) => {
            if (v < 0) return "transparent";
            return colors[i % colors.length];
          }),
          borderColor: isDark ? "rgb(30, 41, 59)" : "#ffffff",
          borderWidth: 4,
          borderDash: (ctx) => {
            const val = rawData[ctx.dataIndex];
            return val < 0 ? [5, 5] : [];
          },
          hoverOffset: 4,
        },
      ],
    };
  }, [accounts, transactions, quotes, dailyPrices, isDark]);

  const expensesByCategoryData = useMemo(() => {
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

    const startStr = startDate.toISOString().split("T")[0];
    const endStr = endDate.toISOString().split("T")[0];

    const expenses = transactions.filter(
      (t) =>
        t.amount < 0 &&
        t.category !== "Transfer" &&
        !t.ticker && // Exclude investment transactions
        t.date >= startStr &&
        t.date <= endStr,
    );

    // No expense transactions — return an explicit empty marker so the UI
    // can show a friendly message instead of a blank chart
    if (expenses.length === 0) return { empty: true };

    const categoryTotals = {};

    expenses.forEach((t) => {
      const cat = t.category || "Uncategorized";
      const acc = accountMap[t.account_id];
      const accCurrency = acc?.currency || appCurrency;
      const rateToApp =
        accCurrency === appCurrency
          ? 1.0
          : getPrice(`${accCurrency}${appCurrency}=X`, t.date) || 1.0;
      const convertedAmount = Math.abs(t.amount) * rateToApp;
      categoryTotals[cat] = (categoryTotals[cat] || 0) + convertedAmount;
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
          borderColor: isDark ? "rgb(30, 41, 59)" : "#ffffff",
          borderWidth: 4,
          hoverOffset: 4,
        },
      ],
    };
  }, [
    transactions,
    timeRange,
    customStartDate,
    customEndDate,
    isDark,
    accountMap,
    getPrice,
    appCurrency,
  ]);

  const incomeVsExpensesData = useMemo(() => {
    if (transactions.length === 0) return null;

    const now = new Date();
    const keys = []; // keys for matching (YYYY-MM-DD for days or YYYY-MM for months)
    const labels = [];

    const isDayBucket =
      timeRange === "1M" ||
      (timeRange === "CUSTOM" &&
        (customEndDate - customStartDate) / (1000 * 60 * 60 * 24) <= 31);

    if (isDayBucket) {
      // Last 30 days or custom range <= 31 days
      const end =
        timeRange === "CUSTOM" ? new Date(customEndDate) : new Date(now);
      const start =
        timeRange === "CUSTOM" ? new Date(customStartDate) : new Date(now);
      if (timeRange === "1M") start.setDate(now.getDate() - 29);

      start.setHours(0, 0, 0, 0);
      end.setHours(0, 0, 0, 0);

      const d = new Date(start);
      while (d <= end) {
        const key = d.toISOString().slice(0, 10);
        keys.push(key);
        labels.push(formatDate(key));
        d.setDate(d.getDate() + 1);
      }
    } else {
      // Use months for 3M, 6M, 1Y, ALL and CUSTOM > 31 days
      let end = new Date(now);
      let start = new Date(now);

      if (timeRange === "3M") start.setMonth(now.getMonth() - 2);
      else if (timeRange === "6M") start.setMonth(now.getMonth() - 5);
      else if (timeRange === "YTD") start = new Date(now.getFullYear(), 0, 1);
      else if (timeRange === "1Y") start.setFullYear(now.getFullYear() - 1);
      else if (timeRange === "ALL") {
        const txDates = transactions.map((t) => t.date).sort();
        start = new Date(txDates[0]);
      } else if (timeRange === "CUSTOM") {
        start = new Date(customStartDate);
        end = new Date(customEndDate);
      }

      start.setDate(1); // Start of month
      const d = new Date(start);
      while (d <= end) {
        const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(
          2,
          "0",
        )}`;
        keys.push(key);
        const opts = { month: "short" };
        // If the range spans more than a year, show the year
        const monthsDiff =
          (end.getFullYear() - start.getFullYear()) * 12 +
          (end.getMonth() - start.getMonth());
        if (monthsDiff >= 12) opts.year = "numeric";
        labels.push(d.toLocaleDateString(undefined, opts));
        d.setMonth(d.getMonth() + 1);
      }
    }

    const incomeData = new Array(keys.length).fill(0);
    const expenseData = new Array(keys.length).fill(0);

    transactions.forEach((t) => {
      if (t.category === "Transfer" || t.ticker) return; // Exclude transfers and investments
      const key = isDayBucket ? t.date : t.date.slice(0, 7);
      const index = keys.indexOf(key);
      if (index !== -1) {
        const acc = accountMap[t.account_id];
        const accCurrency = acc?.currency || appCurrency;
        const rateToApp =
          accCurrency === appCurrency
            ? 1.0
            : getPrice(`${accCurrency}${appCurrency}=X`, t.date) || 1.0;
        const amount = t.amount * rateToApp;

        if (amount > 0) incomeData[index] += amount;
        else expenseData[index] += Math.abs(amount);
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
  }, [
    transactions,
    timeRange,
    customStartDate,
    customEndDate,
    formatDate,
    accountMap,
    getPrice,
    appCurrency,
  ]);

  const doughnutOptions = useMemo(
    () => ({
      responsive: true,
      maintainAspectRatio: false,
      cutout: "65%",
      borderRadius: 4,
      plugins: {
        legend: {
          position: "right",
          labels: {
            usePointStyle: true,
            boxWidth: 8,
            padding: 20,
            color: isDark ? "rgb(148, 163, 184)" : "rgb(100, 116, 139)",
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
          backgroundColor: isDark
            ? "rgba(15, 23, 42, 0.9)"
            : "rgba(255, 255, 255, 0.9)",
          titleColor: isDark ? "rgb(255, 255, 255)" : "rgb(15, 23, 42)",
          bodyColor: isDark ? "rgb(255, 255, 255)" : "rgb(15, 23, 42)",
          padding: 12,
          cornerRadius: 8,
          titleFont: { family: "Inter", size: 13 },
          bodyFont: { family: "Inter", size: 12 },
          callbacks: {
            label: function (context) {
              const value = context.dataset.originalData
                ? context.dataset.originalData[context.dataIndex]
                : context.raw;

              let label = context.label || "";
              if (label) {
                label += ": ";
              }
              if (value !== null && value !== undefined) {
                label += formatNumber(value, { style: "currency" });
              }
              return label;
            },
            labelColor: function (context) {
              const dataset = context.dataset;
              const index = context.dataIndex;
              const tooltipBg = isDark
                ? "rgba(15, 23, 42, 0.9)"
                : "rgba(255, 255, 255, 0.9)";

              const bg =
                Array.isArray(dataset.backgroundColor) &&
                dataset.backgroundColor[index] !== undefined
                  ? dataset.backgroundColor[index]
                  : dataset.backgroundColor;
              const border =
                Array.isArray(dataset.borderColor) &&
                dataset.borderColor[index] !== undefined
                  ? dataset.borderColor[index]
                  : dataset.borderColor;

              const backgroundColor =
                bg === "transparent" || bg === "rgba(0, 0, 0, 0)"
                  ? tooltipBg
                  : bg;

              return {
                borderColor: border,
                backgroundColor,
                borderWidth: 2,
              };
            },
          },
        },
      },
    }),
    [isDark, formatNumber],
  );

  const expensesOptions = useMemo(
    () => ({
      responsive: true,
      maintainAspectRatio: false,
      cutout: "65%",
      borderRadius: 4,
      plugins: {
        legend: {
          position: "right",
          labels: {
            usePointStyle: true,
            boxWidth: 8,
            padding: 20,
            color: isDark ? "rgb(148, 163, 184)" : "rgb(100, 116, 139)",
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
          backgroundColor: isDark
            ? "rgba(15, 23, 42, 0.9)"
            : "rgba(255, 255, 255, 0.9)",
          titleColor: isDark ? "rgb(255, 255, 255)" : "rgb(15, 23, 42)",
          bodyColor: isDark ? "rgb(255, 255, 255)" : "rgb(15, 23, 42)",
          padding: 12,
          cornerRadius: 8,
          titleFont: { family: "Inter", size: 13 },
          bodyFont: { family: "Inter", size: 12 },
          callbacks: {
            label: function (context) {
              const value = context.raw ?? context.parsed ?? 0;

              let label = context.label || "";
              if (label) label += ": ";
              label += formatNumber(Number(value) || 0, { style: "currency" });
              return label;
            },
            labelColor: function (context) {
              const dataset = context.dataset;
              const index = context.dataIndex;
              const tooltipBg = isDark
                ? "rgba(15, 23, 42, 0.9)"
                : "rgba(255, 255, 255, 0.9)";

              const bg =
                Array.isArray(dataset.backgroundColor) &&
                dataset.backgroundColor[index] !== undefined
                  ? dataset.backgroundColor[index]
                  : dataset.backgroundColor;
              const border = dataset.borderColor;

              const backgroundColor =
                bg === "transparent" || bg === "rgba(0, 0, 0, 0)"
                  ? tooltipBg
                  : bg;

              return {
                borderColor: border,
                backgroundColor,
                borderWidth: 2,
              };
            },
          },
        },
      },
    }),
    [isDark, formatNumber],
  );

  const barOptions = useMemo(() => {
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
            color: isDark ? "rgb(148, 163, 184)" : "rgb(100, 116, 139)",
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
        },
      },
      scales: {
        y: {
          beginAtZero: true,
          border: {
            display: false,
          },
          grid: {
            color: isDark
              ? "rgba(51, 65, 85, 0.6)"
              : "rgba(226, 232, 240, 0.6)",
            borderDash: [4, 4],
            drawBorder: false,
          },
          ticks: {
            font: {
              family: "Inter",
              size: 11,
            },
            color: isDark ? "rgb(148, 163, 184)" : "rgb(100, 116, 139)",
            padding: 10,
            callback: function (value) {
              const num = Number(value);
              if (Number.isNaN(num)) return value;
              return formatNumber(num, {
                style: "currency",
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
            color: isDark ? "rgb(148, 163, 184)" : "rgb(100, 116, 139)",
          },
        },
      },
    };
  }, [formatNumber, isDark]);

  const options = useMemo(
    () => ({
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
          mode: "index",
          intersect: false,
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
          displayColors: false,
          callbacks: {
            label: function (context) {
              let label = context.dataset.label || "";
              if (label) {
                label += ": ";
              }
              if (context.parsed.y !== null) {
                // If this dataset represents an individual account, prefer
                // showing the value in the account's native currency when available.
                if (context.dataset && context.dataset.accountCurrency) {
                  const nativeVal =
                    context.dataset.originalData &&
                    context.dataset.originalData[context.dataIndex];
                  if (nativeVal !== undefined && nativeVal !== null) {
                    label += formatNumber(nativeVal, {
                      style: "currency",
                      currency: context.dataset.accountCurrency,
                    });
                  } else {
                    label += formatNumber(context.parsed.y, {
                      style: "currency",
                    });
                  }
                } else {
                  label += formatNumber(context.parsed.y, {
                    style: "currency",
                  });
                }
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
            color: isDark
              ? "rgba(51, 65, 85, 0.6)"
              : "rgba(226, 232, 240, 0.6)",
            borderDash: [4, 4],
            drawBorder: false,
          },
          ticks: {
            font: {
              family: "Inter",
              size: 11,
            },
            color: isDark ? "rgb(148, 163, 184)" : "rgb(100, 116, 139)",
            padding: 10,
            callback: function (value) {
              const num = Number(value);
              if (Number.isNaN(num)) return value;
              return formatNumber(num, {
                style: "currency",
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
            color: isDark ? "rgb(148, 163, 184)" : "rgb(100, 116, 139)",
            maxRotation: 0,
            autoSkip: true,
            maxTicksLimit: 8,
          },
        },
      },
    }),
    [formatNumber, isDark],
  );

  return (
    <div className="page-container dashboard-container">
      <div className="hb-header-container">
        <div>
          <h2 className="hb-header-title">{t("dashboard.title")}</h2>
          <p className="hb-header-subtitle">
            Overview of your financial performance
          </p>
        </div>

        <div className="flex flex-col sm:flex-row items-start sm:items-center gap-3">
          <div className="time-range-selector">
            {["1M", "3M", "6M", "1Y", "YTD", "ALL", "CUSTOM"].map((range) => (
              <button
                key={range}
                onClick={() => setTimeRange(range)}
                className={`time-range-button ${
                  timeRange === range
                    ? "time-range-button-active"
                    : "time-range-button-inactive"
                }`}
              >
                {range === "CUSTOM" ? t("dashboard.custom") : range}
              </button>
            ))}
          </div>

          {timeRange === "CUSTOM" && (
            <div className="flex items-center gap-2 bg-white dark:bg-slate-800 p-1.5 rounded-xl border border-slate-200 dark:border-slate-700 shadow-sm">
              <div className="flex items-center gap-2 px-2">
                <Calendar className="w-4 h-4 text-slate-400" />
                <DatePicker
                  selected={customStartDate}
                  onChange={(date) => {
                    setCustomStartDate(date);
                    if (date && customEndDate && date > customEndDate) {
                      setCustomEndDate(date);
                    }
                  }}
                  selectsStart
                  startDate={customStartDate}
                  endDate={customEndDate}
                  maxDate={new Date()}
                  showPopperArrow={false}
                  dateFormat={getDatePickerFormat(dateFormat)}
                  calendarStartDay={firstDayOfWeek}
                  className="w-24 bg-transparent text-xs font-medium focus:outline-none text-slate-700 dark:text-slate-200"
                />
              </div>
              <div className="h-4 w-px bg-slate-200 dark:bg-slate-700" />
              <div className="flex items-center gap-2 px-2">
                <DatePicker
                  selected={customEndDate}
                  onChange={(date) => setCustomEndDate(date)}
                  selectsEnd
                  startDate={customStartDate}
                  endDate={customEndDate}
                  minDate={customStartDate}
                  maxDate={new Date()}
                  showPopperArrow={false}
                  dateFormat={getDatePickerFormat(dateFormat)}
                  calendarStartDay={firstDayOfWeek}
                  className="w-24 bg-transparent text-xs font-medium focus:outline-none text-slate-700 dark:text-slate-200"
                />
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Summary Cards */}
      <div className="summary-cards-grid">
        <div className="summary-card">
          <h3 className="summary-card-title">
            {t("dashboard.current_net_worth")}
          </h3>
          <p className="summary-card-value">
            {formatNumber(computeNetWorth(accounts, marketValues), {
              style: "currency",
            })}
          </p>
        </div>
        <div className="summary-card">
          <h3 className="summary-card-title">
            {t("dashboard.total_accounts")}
          </h3>
          <p className="summary-card-value">{accounts.length}</p>
        </div>
        <div className="summary-card">
          <h3 className="summary-card-title">
            {t("dashboard.total_transactions")}
          </h3>
          <p className="summary-card-value">{transactions.length}</p>
        </div>
      </div>

      {transactions.length === 0 ? null : (
        <div className="chart-container">
          <div className="chart-header">
            <h3 className="chart-title">{t("dashboard.networth_evolution")}</h3>
            <p className="chart-subtitle">
              Track your financial growth over time
            </p>

            <div className="account-visibility mt-4">
              <div className="flex items-center gap-3 mb-2">
                <button
                  className="toggle-all text-sm"
                  onClick={() => setAllAccountsVisibility(true)}
                >
                  Show all
                </button>
                <button
                  className="toggle-all text-sm"
                  onClick={() => setAllAccountsVisibility(false)}
                >
                  Hide all
                </button>
              </div>
              <div className="account-list flex flex-wrap gap-3">
                {accounts.map((acc) => {
                  const ds = chartData?.datasets.find(
                    (d) => d.accountId === acc.id,
                  );
                  const color = ds?._color || "rgb(148, 163, 184)";
                  return (
                    <label
                      key={acc.id}
                      className="account-item inline-flex items-center gap-2 bg-white dark:bg-slate-700 px-3 py-1 rounded-lg border border-slate-200 dark:border-slate-700 text-sm"
                    >
                      <input
                        type="checkbox"
                        className="account-checkbox"
                        checked={!!visibleAccounts[acc.id]}
                        onChange={() => toggleAccountVisibility(acc.id)}
                        aria-label={acc.name}
                        style={{ ["--hb-account-color"]: color }}
                      />
                      <span
                        className="account-dot w-3 h-3 rounded-full"
                        style={{ backgroundColor: color }}
                      />
                      <span className="account-name">{acc.name}</span>
                      <span className="account-balance ml-2 text-slate-500 dark:text-slate-400">
                        {formatNumber(
                          marketValues && marketValues[acc.id] !== undefined
                            ? (acc.balance || 0) + marketValues[acc.id]
                            : acc.balance || 0,
                          {
                            style: "currency",
                            currency: acc.currency || appCurrency,
                          },
                        )}
                      </span>
                    </label>
                  );
                })}
              </div>
            </div>
          </div>
          <div className="chart-wrapper">
            <div className="chart-body">
              {chartDataVisible ? (
                <Line options={options} data={chartDataVisible} />
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
      )}

      <div className="charts-grid">
        {transactions.length === 0 ? (
          <div className="col-span-full flex-1 flex flex-col items-center justify-center text-slate-400 dark:text-slate-500 py-16">
            <div className="bg-slate-100 dark:bg-slate-800 p-6 rounded-2xl mb-4">
              <svg
                className="w-16 h-16 text-slate-300 dark:text-slate-600"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z"
                />
              </svg>
            </div>
            <p className="text-lg font-semibold text-slate-600 dark:text-slate-400 mb-2">
              {t("dashboard.no_transactions_title")}
            </p>
            <p className="text-sm text-slate-400 dark:text-slate-500">
              {t("dashboard.no_transactions_body")}
            </p>
          </div>
        ) : (
          <>
            {/* Income vs Expenses */}
            <div className="chart-card chart-card-full">
              <div className="chart-header">
                <h3 className="chart-title">
                  {t("dashboard.income_vs_expenses")}
                </h3>
                <p className="chart-subtitle">Monthly income vs expenses</p>
              </div>
              <div className="chart-body">
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
            </div>

            {/* Cash Flow Sankey */}
            <div
              className="chart-card chart-card-full"
              style={{ height: "500px" }}
            >
              <div className="chart-header">
                <h3 className="chart-title">{t("dashboard.cash_flow")}</h3>
                <p className="chart-subtitle">Income and expense flow</p>
              </div>
              <div className="chart-body">
                <SankeyDiagram
                  transactions={transactions}
                  timeRange={timeRange}
                  customStartDate={customStartDate}
                  customEndDate={customEndDate}
                  accountMap={accountMap}
                  getPrice={getPrice}
                  appCurrency={appCurrency}
                />
              </div>
            </div>

            {/* Asset Allocation */}
            <div className="chart-card">
              <div className="chart-header">
                <h3 className="chart-title">
                  {t("dashboard.asset_allocation")}
                </h3>
                <p className="chart-subtitle">Distribution of your assets</p>
              </div>
              <div className="chart-body">
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
            </div>

            {/* Expenses by Category */}
            <div className="chart-card">
              <div className="chart-header">
                <h3 className="chart-title">
                  {t("dashboard.expenses_by_category")}
                </h3>
                <p className="chart-subtitle">Where your money goes</p>
              </div>
              <div className="chart-body">
                {expensesByCategoryData === null ? (
                  <div className="loading-container">
                    <div className="loading-content">
                      <div className="loading-spinner"></div>
                      <span className="loading-text">
                        {t("loading.loading_data")}
                      </span>
                    </div>
                  </div>
                ) : expensesByCategoryData.empty ? (
                  <div className="col-span-full flex-1 flex flex-col items-center justify-center text-slate-400 dark:text-slate-500 py-8">
                    <div className="bg-slate-100 dark:bg-slate-800 p-4 rounded-xl mb-3">
                      <svg
                        className="w-12 h-12 text-slate-300 dark:text-slate-600"
                        fill="none"
                        viewBox="0 0 24 24"
                        stroke="currentColor"
                      >
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          strokeWidth={2}
                          d="M13 16h-1v-4h-1m4 4v-4m-6 8h6a2 2 0 002-2V7a2 2 0 00-2-2h-6l-2 2v11a2 2 0 002 2z"
                        />
                      </svg>
                    </div>
                    <p className="text-sm font-semibold text-slate-600 dark:text-slate-400 mb-1">
                      {t("dashboard.no_expenses_title")}
                    </p>
                    <p className="text-xs text-slate-400 dark:text-slate-500">
                      {t("dashboard.no_expenses_body")}
                    </p>
                  </div>
                ) : (
                  <Doughnut
                    options={expensesOptions}
                    data={expensesByCategoryData}
                  />
                )}
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

Dashboard.propTypes = {
  accounts: PropTypes.array,
  marketValues: PropTypes.object,
};
