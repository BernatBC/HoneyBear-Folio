import { useState, useEffect, useMemo, useRef } from "react";
import { invoke } from "@tauri-apps/api/core";
import { Line } from "react-chartjs-2";
import {
  TrendingUp,
  Banknote,
  Percent,
  Calendar,
  RotateCw,
} from "lucide-react";
import { useFormatNumber } from "../../utils/format";
import MaskedNumber from "../../components/ui/MaskedNumber";
import { usePrivacy } from "../../contexts/privacy";
import useIsDark from "../../hooks/useIsDark";
import { t } from "../../i18n/i18n";
import {
  buildHoldingsFromTransactions,
  mergeHoldingsWithQuotes,
  computePortfolioTotals,
  computeNetWorthMarketValues,
} from "../../utils/investments";
import NumberInput from "../../components/ui/NumberInput";
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
} from "chart.js";

ChartJS.register(
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  Title,
  Tooltip,
  Legend,
  Filler,
);

export default function FireCalculator() {
  // Initialize state from sessionStorage if available (persists for the lifetime of the browser/tab session, including reloads, and is cleared when the tab or window is closed)
  const savedState = useMemo(() => {
    const saved = sessionStorage.getItem("fireCalculatorState");
    if (saved) {
      try {
        return JSON.parse(saved);
      } catch (e) {
        console.error("Failed to parse saved state:", e);
      }
    }
    return null;
  }, []);

  const [currentNetWorth, setCurrentNetWorth] = useState(
    savedState?.currentNetWorth ?? 0,
  );
  const [annualExpenses, setAnnualExpenses] = useState(
    savedState?.annualExpenses ?? 40000,
  );
  const [expectedReturn, setExpectedReturn] = useState(
    savedState?.expectedReturn ?? 7,
  );
  const [withdrawalRate, setWithdrawalRate] = useState(
    savedState?.withdrawalRate ?? 4,
  );
  const [annualSavings, setAnnualSavings] = useState(
    savedState?.annualSavings ?? 20000,
  );
  const [loading, setLoading] = useState(!savedState);
  const isDark = useIsDark();
  const { isPrivacyMode } = usePrivacy();

  // Track which fields the user has manually edited during the session so
  // computed backend updates don't overwrite them while the app is open. We
  // persist these flags in sessionStorage alongside values so switching
  // tabs/remounts keep user edits intact.
  const initialUserModified = savedState?.userModified ?? {
    currentNetWorth: false,
    annualExpenses: false,
    expectedReturn: false,
    withdrawalRate: false,
    annualSavings: false,
  };
  const userModified = useRef(initialUserModified); // keep as ref so it doesn't trigger effects

  async function fetchData() {
    setLoading(true);
    try {
      const accounts = await invoke("get_accounts");
      const transactions = await invoke("get_all_transactions");

      // Build holdings and first trade date
      const { currentHoldings, firstTradeDate } =
        buildHoldingsFromTransactions(transactions);

      // Fetch quotes for holdings once
      const tickers = currentHoldings.map((h) => h.ticker);
      let quotes = [];
      if (tickers.length > 0) {
        quotes = await invoke("get_stock_quotes", { tickers });
      }

      // Compute portfolio totals
      const finalHoldings = mergeHoldingsWithQuotes(currentHoldings, quotes);
      const {
        totalValue: totalPortfolioValue,
        totalCostBasis: totalPortfolioCostBasis,
      } = computePortfolioTotals(finalHoldings);

      // Compute market values per account used for net worth (re-uses quotes fetched earlier)
      const netWorthMarketValues = computeNetWorthMarketValues(
        transactions,
        quotes,
      );

      const totalBalance = accounts.reduce((sum, acc) => {
        if (acc.kind === "brokerage") {
          return (
            sum +
            (netWorthMarketValues[acc.id] !== undefined
              ? netWorthMarketValues[acc.id]
              : acc.balance)
          );
        }
        return sum + acc.balance;
      }, 0);

      if (!userModified.current.currentNetWorth) {
        setCurrentNetWorth(Math.round(totalBalance));
      }

      // Calculate Expected Return (CAGR)
      if (totalPortfolioCostBasis > 0 && firstTradeDate) {
        const totalReturnRate =
          (totalPortfolioValue - totalPortfolioCostBasis) /
          totalPortfolioCostBasis;
        const now = new Date();
        const yearsInvested = Math.max(
          (now - firstTradeDate) / (1000 * 60 * 60 * 24 * 365.25),
          0.1,
        );

        let annualizedReturn =
          (Math.pow(1 + totalReturnRate, 1 / yearsInvested) - 1) * 100;

        if (
          isFinite(annualizedReturn) &&
          !userModified.current.expectedReturn
        ) {
          setExpectedReturn(parseFloat(annualizedReturn.toFixed(2)));
        }
      }

      // --- 2. Calculate Annual Expenses & Savings ---
      const oneYearAgo = new Date();
      oneYearAgo.setFullYear(oneYearAgo.getFullYear() - 1);

      const lastYearTransactions = transactions.filter(
        (tx) => new Date(tx.date) >= oneYearAgo,
      );

      let expenses = 0;
      let income = 0;

      lastYearTransactions.forEach((tx) => {
        const isTrade = tx.ticker && tx.shares;
        const isTransfer = tx.category === "Transfer";

        if (!isTrade && !isTransfer) {
          if (tx.amount < 0) {
            expenses += Math.abs(tx.amount);
          } else {
            income += tx.amount;
          }
        }
      });

      if (!userModified.current.annualExpenses) {
        setAnnualExpenses(Math.round(expenses));
      }
      if (!userModified.current.annualSavings) {
        setAnnualSavings(Math.round(income - expenses));
      }

      setLoading(false);
    } catch (e) {
      console.error("Failed to fetch data:", e);
      setLoading(false);
    }
  }

  useEffect(() => {
    if (!savedState) {
      fetchData();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!loading) {
      const state = {
        currentNetWorth,
        annualExpenses,
        expectedReturn,
        withdrawalRate,
        annualSavings,
        userModified: userModified.current,
      };
      sessionStorage.setItem("fireCalculatorState", JSON.stringify(state));
    }
  }, [
    currentNetWorth,
    annualExpenses,
    expectedReturn,
    withdrawalRate,
    annualSavings,
    loading,
  ]);

  // Reset calculation to defaults computed from historic data
  function resetToHistoric() {
    // Remove any saved session so fetchData recomputes defaults from historic data
    try {
      sessionStorage.removeItem("fireCalculatorState");
    } catch {
      // ignore
    }

    userModified.current = {
      currentNetWorth: false,
      annualExpenses: false,
      expectedReturn: false,
      withdrawalRate: false,
      annualSavings: false,
    };

    // Reset withdrawal rate to the default value as it's not computed from history
    setWithdrawalRate(4);

    // Re-fetch data which will set the computed defaults
    fetchData();
  }

  // Ensure the saved session state is cleared when the window is closed
  useEffect(() => {
    const onBeforeUnload = () => {
      // sessionStorage is usually cleared on window close, but remove explicitly to be safe
      sessionStorage.removeItem("fireCalculatorState");
    };
    window.addEventListener("beforeunload", onBeforeUnload);
    return () => window.removeEventListener("beforeunload", onBeforeUnload);
  }, []);

  // Also listen to Tauri close event in case beforeunload doesn't fire in some environments
  useEffect(() => {
    let unlisten;
    (async () => {
      try {
        const { listen } = await import("@tauri-apps/api/event");
        unlisten = await listen("tauri://close-requested", () => {
          sessionStorage.removeItem("fireCalculatorState");
        });
      } catch (e) {
        // If Tauri event API isn't available, that's fine — beforeunload handles it
        console.debug("Tauri event listener not available:", e);
      }
    })();
    return () => {
      if (typeof unlisten === "function") {
        unlisten();
      }
    };
  }, []);

  const { fireNumber, yearsToFire, chartData, neverReached } = useMemo(() => {
    const fireNum = annualExpenses / (withdrawalRate / 100);

    let years = 0;
    let balance = currentNetWorth;
    const dataPoints = [balance];
    const labels = ["Year 0"];

    // Simulate up to 50 years
    for (let i = 1; i <= 50; i++) {
      const returns = balance * (expectedReturn / 100);
      balance = balance + returns + annualSavings;
      dataPoints.push(balance);
      labels.push(`Year ${i}`);

      if (balance >= fireNum && years === 0) {
        years = i;
      }
    }

    return {
      fireNumber: fireNum,
      yearsToFire: years > 0 ? years : null,
      neverReached: years === 0,
      chartData: {
        labels,
        datasets: [
          {
            label: "Projected Net Worth",
            data: dataPoints,
            borderColor: "rgb(59, 130, 246)",
            backgroundColor: "rgba(59, 130, 246, 0.1)",
            fill: true,
            tension: 0.4,
          },
          {
            label: "FIRE Target",
            data: Array(labels.length).fill(fireNum),
            borderColor: "rgb(239, 68, 68)",
            borderDash: [5, 5],
            pointRadius: 0,
            fill: false,
          },
        ],
      },
    };
  }, [
    currentNetWorth,
    annualExpenses,
    expectedReturn,
    withdrawalRate,
    annualSavings,
  ]);

  const formatNumber = useFormatNumber();
  const formatCurrency = (val) =>
    formatNumber(val, {
      style: "currency",
      maximumFractionDigits: 0,
      minimumFractionDigits: 0,
    });

  return (
    <div className="page-container fire-calculator-container">
      <header className="hb-header-container">
        <div>
          <h1 className="hb-header-title">FIRE Calculator</h1>
          <p className="hb-header-subtitle">
            Financial Independence, Retire Early
          </p>
        </div>
      </header>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        {/* Inputs */}
        <div className="bg-white dark:bg-slate-800 p-6 rounded-2xl shadow-md border border-slate-200 dark:border-slate-700 space-y-6 h-fit hover:shadow-lg transition-shadow duration-300">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-xl font-bold text-slate-900 dark:text-slate-100">
              Parameters
            </h2>
            <button
              type="button"
              onClick={resetToHistoric}
              title="Reset to suggested defaults — computed from your historic data: net worth & expected return from accounts/portfolio; expenses & savings from the last 12 months"
              className="inline-flex items-center gap-2 px-3 py-2 text-sm font-medium text-slate-700 dark:text-slate-300 bg-slate-100 dark:bg-slate-700/30 border border-slate-200 dark:border-slate-600 rounded-lg hover:bg-slate-200 dark:hover:bg-slate-700 transition"
            >
              <RotateCw className="w-4 h-4" />
              Reset
            </button>
          </div>

          <div className="space-y-5">
            <div>
              <label className="block text-sm font-bold text-slate-700 dark:text-slate-300 mb-2 flex items-center gap-2">
                <Banknote className="w-4 h-4 text-brand-500 dark:text-brand-400" />
                Current Net Worth
              </label>
              <div className="relative">
                <NumberInput
                  value={currentNetWorth}
                  onChange={(num) => {
                    setCurrentNetWorth(Number.isNaN(num) ? 0 : Math.round(num));
                    userModified.current.currentNetWorth = true;
                  }}
                  className="w-full px-4 py-3 border-2 border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 rounded-xl focus:ring-2 focus:ring-brand-500 focus:border-brand-500 outline-none transition-all font-semibold text-slate-900 dark:text-slate-100 hover:border-slate-300 dark:hover:border-slate-600"
                  placeholder="0"
                  maximumFractionDigits={0}
                  minimumFractionDigits={0}
                  useGrouping={false}
                />
              </div>
            </div>

            <div>
              <label className="block text-sm font-bold text-slate-700 dark:text-slate-300 mb-2 flex items-center gap-2">
                <Banknote className="w-4 h-4 text-brand-500 dark:text-brand-400" />
                Annual Expenses
              </label>
              <div className="relative">
                <NumberInput
                  value={annualExpenses}
                  onChange={(num) => {
                    setAnnualExpenses(Number.isNaN(num) ? 0 : Math.round(num));
                    userModified.current.annualExpenses = true;
                  }}
                  className="w-full px-4 py-3 border-2 border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 rounded-xl focus:ring-2 focus:ring-brand-500 focus:border-brand-500 outline-none transition-all font-semibold text-slate-900 dark:text-slate-100 hover:border-slate-300 dark:hover:border-slate-600"
                  placeholder="0"
                  maximumFractionDigits={0}
                  minimumFractionDigits={0}
                  useGrouping={false}
                />
              </div>
            </div>

            <div>
              <label className="block text-sm font-bold text-slate-700 dark:text-slate-300 mb-2 flex items-center gap-2">
                <Banknote className="w-4 h-4 text-brand-500 dark:text-brand-400" />
                Annual Savings
              </label>
              <div className="relative">
                <NumberInput
                  value={annualSavings}
                  onChange={(num) => {
                    setAnnualSavings(Number.isNaN(num) ? 0 : Math.round(num));
                    userModified.current.annualSavings = true;
                  }}
                  className="w-full px-4 py-3 border-2 border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 rounded-xl focus:ring-2 focus:ring-brand-500 focus:border-brand-500 outline-none transition-all font-semibold text-slate-900 dark:text-slate-100 hover:border-slate-300 dark:hover:border-slate-600"
                  placeholder="0"
                  maximumFractionDigits={0}
                  minimumFractionDigits={0}
                  useGrouping={false}
                />
              </div>
            </div>

            <div>
              <label className="block text-sm font-bold text-slate-700 dark:text-slate-300 mb-2 flex items-center gap-2">
                <Percent className="w-4 h-4 text-brand-500 dark:text-brand-400" />
                Expected Annual Return
              </label>
              <div className="relative">
                <NumberInput
                  value={expectedReturn}
                  onChange={(num) => {
                    setExpectedReturn(Number.isNaN(num) ? 0 : num);
                    userModified.current.expectedReturn = true;
                  }}
                  className="w-full px-4 py-3 border-2 border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 rounded-xl focus:ring-2 focus:ring-brand-500 focus:border-brand-500 outline-none transition-all font-semibold text-slate-900 dark:text-slate-100 hover:border-slate-300 dark:hover:border-slate-600"
                  placeholder="0"
                  maximumFractionDigits={2}
                  minimumFractionDigits={0}
                  useGrouping={false}
                />
              </div>
            </div>

            <div>
              <label className="block text-sm font-bold text-slate-700 dark:text-slate-300 mb-2 flex items-center gap-2">
                <Percent className="w-4 h-4 text-brand-500 dark:text-brand-400" />
                Safe Withdrawal Rate
              </label>
              <div className="relative">
                <NumberInput
                  value={withdrawalRate}
                  onChange={(num) => {
                    setWithdrawalRate(Number.isNaN(num) ? 0 : num);
                    userModified.current.withdrawalRate = true;
                  }}
                  className="w-full px-4 py-3 border-2 border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 rounded-xl focus:ring-2 focus:ring-brand-500 focus:border-brand-500 outline-none transition-all font-semibold text-slate-900 dark:text-slate-100 hover:border-slate-300 dark:hover:border-slate-600"
                  placeholder="0"
                  maximumFractionDigits={2}
                  minimumFractionDigits={0}
                  useGrouping={false}
                />
                <span className="absolute right-4 top-1/2 -translate-y-1/2 text-slate-400 font-medium">
                  %
                </span>
              </div>
            </div>
          </div>
        </div>

        {/* Results & Chart */}
        <div className="lg:col-span-2 space-y-6">
          {/* Key Metrics */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="bg-gradient-to-br from-blue-50 to-brand-50 dark:from-blue-900/20 dark:to-brand-900/20 p-6 rounded-2xl shadow-md border-2 border-blue-200 dark:border-blue-800 flex items-center justify-between transition-all duration-300">
              <div>
                <p className="text-sm font-bold text-blue-700 dark:text-blue-300 uppercase tracking-wider mb-1">
                  FIRE Number
                </p>
                <p className="text-3xl font-bold text-blue-900 dark:text-blue-100">
                  <MaskedNumber
                    value={fireNumber}
                    options={{
                      style: "currency",
                      maximumFractionDigits: 0,
                      minimumFractionDigits: 0,
                    }}
                  />
                </p>
              </div>
              <div className="bg-blue-500 dark:bg-blue-600 p-4 rounded-2xl shadow-lg">
                <TrendingUp className="w-8 h-8 text-white" />
              </div>
            </div>

            <div className="bg-gradient-to-br from-emerald-50 to-green-50 dark:from-emerald-900/20 dark:to-green-900/20 p-6 rounded-2xl shadow-md border-2 border-emerald-200 dark:border-emerald-800 flex items-center justify-between transition-all duration-300">
              <div>
                <p className="text-sm font-bold text-emerald-700 dark:text-emerald-300 uppercase tracking-wider mb-1">
                  Time to FIRE
                </p><MaskedNumber value={yearsToFire} />
                {neverReached ? (
                  <p className="text-xl font-medium text-emerald-900 dark:text-emerald-100">
                    {t("fire.never_retire")}
                  </p>
                ) : (
                  <p className="text-3xl font-bold text-emerald-900 dark:text-emerald-100">
                    {yearsToFire} Years
                  </p>
                )}
              </div>
              <div className="bg-emerald-500 dark:bg-emerald-600 p-4 rounded-2xl shadow-lg">
                <Calendar className="w-8 h-8 text-white" />
              </div>
            </div>
          </div>

          {/* Chart */}
          <div className="bg-white dark:bg-slate-800 p-6 rounded-2xl shadow-md border border-slate-200 dark:border-slate-700 flex-1 min-h-[400px] hover:shadow-lg transition-shadow duration-300">
            <h3 className="text-lg font-semibold text-slate-700 dark:text-slate-200 mb-2">
              Projection
            </h3>
            <p className="text-sm text-slate-500 dark:text-slate-400 mb-4">
              Path to financial independence
            </p>
            <div className="h-[350px]">
              <Line
                data={chartData}
                options={{
                  responsive: true,
                  maintainAspectRatio: false,
                  plugins: {
                    legend: {
                      position: "top",
                      labels: {
                        color: isDark ? "#cbd5e1" : "#475569",
                      },
                    },
                    tooltip: {
                      callbacks: {
                        label: function (context) {
                          let label = context.dataset.label || "";
                          if (label) {
                            label += ": ";
                          }

                          const value =
                            (context.parsed &&
                              (context.parsed.y ?? context.parsed)) ??
                            context.raw ??
                            (context.dataset &&
                            context.dataset.data &&
                            context.dataIndex != null
                              ? context.dataset.data[context.dataIndex]
                              : undefined);

                          if (
                            value !== undefined &&
                            value !== null &&
                            !Number.isNaN(Number(value))
                          ) {
                            label += formatNumber(Number(value), {
                              style: "currency",
                              ignorePrivacy: true
                            });
                          }

                          return label;
                        },
                      },
                    },
                  },
                  scales: {
                    y: {
                      beginAtZero: true,
                      grid: {
                        color: isDark ? "#334155" : "#e2e8f0",
                      },
                      ticks: {
                        color: isDark ? "#94a3b8" : "#64748b",
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
                        color: isDark ? "#334155" : "#e2e8f0",
                      },
                      ticks: {
                        color: isDark ? "#94a3b8" : "#64748b",
                      },
                    },
                  },
                }}
              />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
