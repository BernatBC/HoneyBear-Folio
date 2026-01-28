import { useState, useEffect, useMemo, useRef, useCallback } from "react";
import { invoke } from "@tauri-apps/api/core";
import { Line } from "react-chartjs-2";
import {
  TrendingUp,
  Banknote,
  Percent,
  Calendar,
  RotateCw,
  ChevronDown,
  ChevronRight,
  User,
  Target,
  Clock,
  Activity,
  Settings2,
} from "lucide-react";
import { useFormatNumber } from "../../utils/format";
import MaskedNumber from "../../components/ui/MaskedNumber";
import {
  runMonteCarloSimulation,
  calculateDeterministicProjection,
} from "../../utils/fire";
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
  // New fields
  const [inflation, setInflation] = useState(savedState?.inflation ?? 2);
  const [currentAge, setCurrentAge] = useState(savedState?.currentAge ?? 30);
  const [retirementAge, setRetirementAge] = useState(
    savedState?.retirementAge ?? 65,
  );
  const [retirementDuration, setRetirementDuration] = useState(
    savedState?.retirementDuration ?? 30,
  );
  // Advanced Monte Carlo parameters
  const [showAdvanced, setShowAdvanced] = useState(
    savedState?.showAdvanced ?? false,
  );
  const [volatility, setVolatility] = useState(savedState?.volatility ?? 15);
  const [simulationCount, setSimulationCount] = useState(
    savedState?.simulationCount ?? 1000,
  );

  const [loading, setLoading] = useState(!savedState);
  const isDark = useIsDark();

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
    inflation: false,
    currentAge: false,
    retirementAge: false,
    retirementDuration: false,
    volatility: false,
    simulationCount: false,
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
        inflation,
        currentAge,
        retirementAge,
        retirementDuration,
        showAdvanced,
        volatility,
        simulationCount,
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
    inflation,
    currentAge,
    retirementAge,
    retirementDuration,
    showAdvanced,
    volatility,
    simulationCount,
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
      inflation: false,
      currentAge: false,
      retirementAge: false,
      retirementDuration: false,
      volatility: false,
      simulationCount: false,
    };

    // Reset fields that are not computed from history to their defaults
    setWithdrawalRate(4);
    setInflation(2);
    setCurrentAge(30);
    setRetirementAge(65);
    setRetirementDuration(30);
    setVolatility(15);
    setSimulationCount(1000);
    setShowAdvanced(false);

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

  // Deterministic projection (inflation-adjusted)
  const { fireNumber, yearsToFire, projectionData, neverReached } =
    useMemo(() => {
      // Ensure deterministic projection covers the full chart horizon
      const yearsToRetirement = Math.max(0, retirementAge - currentAge);
      const totalYears = yearsToRetirement + retirementDuration;

      return calculateDeterministicProjection({
        currentNetWorth,
        annualSavings,
        annualExpenses,
        expectedReturn,
        inflation,
        withdrawalRate,
        maxYears: totalYears,
      });
    }, [
      currentNetWorth,
      annualSavings,
      annualExpenses,
      expectedReturn,
      inflation,
      withdrawalRate,
      currentAge,
      retirementAge,
      retirementDuration,
    ]);

  // Monte Carlo simulation (debounced to avoid excessive recalculation)
  const [monteCarloResult, setMonteCarloResult] = useState(null);

  const runSimulation = useCallback(() => {
    const result = runMonteCarloSimulation({
      currentNetWorth,
      annualSavings,
      annualExpenses,
      expectedReturn,
      inflation,
      volatility,
      currentAge,
      retirementAge,
      retirementDuration,
      simulationCount,
    });
    setMonteCarloResult(result);
  }, [
    currentNetWorth,
    annualSavings,
    annualExpenses,
    expectedReturn,
    inflation,
    volatility,
    currentAge,
    retirementAge,
    retirementDuration,
    simulationCount,
  ]);

  // Debounce Monte Carlo calculation
  useEffect(() => {
    const timer = setTimeout(() => {
      runSimulation();
    }, 300);
    return () => clearTimeout(timer);
  }, [runSimulation]);

  // Build chart data combining deterministic and Monte Carlo results
  const chartData = useMemo(() => {
    const yearsToRetirement = Math.max(0, retirementAge - currentAge);
    const totalYears = yearsToRetirement + retirementDuration;
    const labels = Array.from({ length: totalYears + 1 }, (_, i) => {
      if (i === 0) return `Age ${currentAge}`;
      if (i === yearsToRetirement) return `Age ${retirementAge} (Retire)`;
      return `Age ${currentAge + i}`;
    });

    const datasets = [];

    // Monte Carlo percentile bands (if available)
    if (monteCarloResult) {
      const { percentiles } = monteCarloResult;

      // 10th-90th percentile band (outer)
      datasets.push({
        label: "90th Percentile",
        data: percentiles.p90,
        borderColor: "rgba(34, 197, 94, 0.3)",
        backgroundColor: "rgba(34, 197, 94, 0.1)",
        fill: "+1",
        tension: 0.4,
        pointRadius: 0,
        borderWidth: 1,
      });

      datasets.push({
        label: "10th Percentile",
        data: percentiles.p10,
        borderColor: "rgba(34, 197, 94, 0.3)",
        backgroundColor: "transparent",
        fill: false,
        tension: 0.4,
        pointRadius: 0,
        borderWidth: 1,
      });

      // 25th-75th percentile band (inner)
      datasets.push({
        label: "75th Percentile",
        data: percentiles.p75,
        borderColor: "rgba(34, 197, 94, 0.5)",
        backgroundColor: "rgba(34, 197, 94, 0.15)",
        fill: "+1",
        tension: 0.4,
        pointRadius: 0,
        borderWidth: 1,
      });

      datasets.push({
        label: "25th Percentile",
        data: percentiles.p25,
        borderColor: "rgba(34, 197, 94, 0.5)",
        backgroundColor: "transparent",
        fill: false,
        tension: 0.4,
        pointRadius: 0,
        borderWidth: 1,
      });

      // Median (50th percentile)
      datasets.push({
        label: "Median Outcome",
        data: percentiles.p50,
        borderColor: "rgb(34, 197, 94)",
        backgroundColor: "transparent",
        fill: false,
        tension: 0.4,
        pointRadius: 0,
        borderWidth: 2,
      });
    }

    // Deterministic projection line
    datasets.push({
      label: "Deterministic Projection",
      data: projectionData.slice(0, totalYears + 1),
      borderColor: "rgb(59, 130, 246)",
      backgroundColor: "rgba(59, 130, 246, 0.1)",
      fill: !monteCarloResult, // Only fill if no Monte Carlo data
      tension: 0.4,
      pointRadius: 0,
      borderWidth: 2,
    });

    // FIRE target line
    datasets.push({
      label: "FIRE Target",
      data: Array(labels.length).fill(fireNumber),
      borderColor: "rgb(239, 68, 68)",
      borderDash: [5, 5],
      pointRadius: 0,
      fill: false,
      borderWidth: 2,
    });

    // Retirement marker (vertical line effect using segment)
    const retirementMarker = Array(labels.length).fill(null);
    if (yearsToRetirement > 0 && yearsToRetirement < labels.length) {
      // Create a point at retirement year
      retirementMarker[yearsToRetirement] = fireNumber * 1.5; // Extend above FIRE line
    }

    return { labels, datasets };
  }, [
    projectionData,
    fireNumber,
    monteCarloResult,
    currentAge,
    retirementAge,
    retirementDuration,
  ]);

  // Calculate retirement age when FIRE is reached
  const fireAge = yearsToFire ? currentAge + yearsToFire : null;

  const formatNumber = useFormatNumber();

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
              {t("fire.parameters")}
            </h2>
            <button
              type="button"
              onClick={resetToHistoric}
              title={t("fire.reset_tooltip")}
              className="inline-flex items-center gap-2 px-3 py-2 text-sm font-medium text-slate-700 dark:text-slate-300 bg-slate-100 dark:bg-slate-700/30 border border-slate-200 dark:border-slate-600 rounded-lg hover:bg-slate-200 dark:hover:bg-slate-700 transition"
            >
              <RotateCw className="w-4 h-4" />
              {t("fire.reset")}
            </button>
          </div>

          <div className="space-y-5">
            {/* Financial Parameters */}
            <div>
              <label className="block text-sm font-bold text-slate-700 dark:text-slate-300 mb-2 flex items-center gap-2">
                <Banknote className="w-4 h-4 text-brand-500 dark:text-brand-400" />
                {t("fire.current_net_worth")}
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
                {t("fire.annual_expenses")}
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
                {t("fire.annual_savings")}
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
                {t("fire.expected_return")}
              </label>
              <div className="relative">
                <NumberInput
                  value={expectedReturn}
                  onChange={(num) => {
                    setExpectedReturn(Number.isNaN(num) ? 0 : num);
                    userModified.current.expectedReturn = true;
                  }}
                  className="w-full px-4 py-3 pr-8 border-2 border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 rounded-xl focus:ring-2 focus:ring-brand-500 focus:border-brand-500 outline-none transition-all font-semibold text-slate-900 dark:text-slate-100 hover:border-slate-300 dark:hover:border-slate-600"
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

            <div>
              <label className="block text-sm font-bold text-slate-700 dark:text-slate-300 mb-2 flex items-center gap-2">
                <Percent className="w-4 h-4 text-brand-500 dark:text-brand-400" />
                {t("fire.inflation")}
              </label>
              <div className="relative">
                <NumberInput
                  value={inflation}
                  onChange={(num) => {
                    setInflation(Number.isNaN(num) ? 0 : num);
                    userModified.current.inflation = true;
                  }}
                  className="w-full px-4 py-3 pr-8 border-2 border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 rounded-xl focus:ring-2 focus:ring-brand-500 focus:border-brand-500 outline-none transition-all font-semibold text-slate-900 dark:text-slate-100 hover:border-slate-300 dark:hover:border-slate-600"
                  placeholder="2"
                  maximumFractionDigits={2}
                  minimumFractionDigits={0}
                  useGrouping={false}
                />
                <span className="absolute right-4 top-1/2 -translate-y-1/2 text-slate-400 font-medium">
                  %
                </span>
              </div>
            </div>

            <div>
              <label className="block text-sm font-bold text-slate-700 dark:text-slate-300 mb-2 flex items-center gap-2">
                <Percent className="w-4 h-4 text-brand-500 dark:text-brand-400" />
                {t("fire.withdrawal_rate")}
              </label>
              <div className="relative">
                <NumberInput
                  value={withdrawalRate}
                  onChange={(num) => {
                    setWithdrawalRate(Number.isNaN(num) ? 0 : num);
                    userModified.current.withdrawalRate = true;
                  }}
                  className="w-full px-4 py-3 pr-8 border-2 border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 rounded-xl focus:ring-2 focus:ring-brand-500 focus:border-brand-500 outline-none transition-all font-semibold text-slate-900 dark:text-slate-100 hover:border-slate-300 dark:hover:border-slate-600"
                  placeholder="4"
                  maximumFractionDigits={2}
                  minimumFractionDigits={0}
                  useGrouping={false}
                />
                <span className="absolute right-4 top-1/2 -translate-y-1/2 text-slate-400 font-medium">
                  %
                </span>
              </div>
            </div>

            {/* Age & Timeline Section */}
            <div className="pt-4 border-t border-slate-200 dark:border-slate-700">
              <h3 className="text-sm font-bold text-slate-600 dark:text-slate-400 mb-4 flex items-center gap-2">
                <User className="w-4 h-4" />
                {t("fire.age_timeline")}
              </h3>

              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-bold text-slate-700 dark:text-slate-300 mb-2 flex items-center gap-2">
                    <User className="w-4 h-4 text-brand-500 dark:text-brand-400" />
                    {t("fire.current_age")}
                  </label>
                  <div className="relative">
                    <NumberInput
                      value={currentAge}
                      onChange={(num) => {
                        setCurrentAge(
                          Number.isNaN(num) ? 0 : Math.round(num),
                        );
                        userModified.current.currentAge = true;
                      }}
                      className="w-full px-4 py-3 border-2 border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 rounded-xl focus:ring-2 focus:ring-brand-500 focus:border-brand-500 outline-none transition-all font-semibold text-slate-900 dark:text-slate-100 hover:border-slate-300 dark:hover:border-slate-600"
                      placeholder="30"
                      maximumFractionDigits={0}
                      minimumFractionDigits={0}
                      useGrouping={false}
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-bold text-slate-700 dark:text-slate-300 mb-2 flex items-center gap-2">
                    <Target className="w-4 h-4 text-brand-500 dark:text-brand-400" />
                    {t("fire.target_retirement_age")}
                  </label>
                  <div className="relative">
                    <NumberInput
                      value={retirementAge}
                      onChange={(num) => {
                        setRetirementAge(
                          Number.isNaN(num) ? 0 : Math.round(num),
                        );
                        userModified.current.retirementAge = true;
                      }}
                      className="w-full px-4 py-3 border-2 border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 rounded-xl focus:ring-2 focus:ring-brand-500 focus:border-brand-500 outline-none transition-all font-semibold text-slate-900 dark:text-slate-100 hover:border-slate-300 dark:hover:border-slate-600"
                      placeholder="65"
                      maximumFractionDigits={0}
                      minimumFractionDigits={0}
                      useGrouping={false}
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-bold text-slate-700 dark:text-slate-300 mb-2 flex items-center gap-2">
                    <Clock className="w-4 h-4 text-brand-500 dark:text-brand-400" />
                    {t("fire.retirement_duration")}
                  </label>
                  <div className="relative">
                    <NumberInput
                      value={retirementDuration}
                      onChange={(num) => {
                        setRetirementDuration(
                          Number.isNaN(num) ? 0 : Math.round(num),
                        );
                        userModified.current.retirementDuration = true;
                      }}
                      className="w-full px-4 py-3 border-2 border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 rounded-xl focus:ring-2 focus:ring-brand-500 focus:border-brand-500 outline-none transition-all font-semibold text-slate-900 dark:text-slate-100 hover:border-slate-300 dark:hover:border-slate-600"
                      placeholder="30"
                      maximumFractionDigits={0}
                      minimumFractionDigits={0}
                      useGrouping={false}
                    />
                    <span className="absolute right-4 top-1/2 -translate-y-1/2 text-slate-400 font-medium text-sm">
                      {t("fire.years")}
                    </span>
                  </div>
                </div>
              </div>
            </div>

            {/* Advanced Options Toggle */}
            <div className="pt-2">
              <button
                type="button"
                onClick={() => setShowAdvanced(!showAdvanced)}
                className="flex items-center gap-2 text-sm font-medium text-slate-600 dark:text-slate-400 hover:text-brand-600 dark:hover:text-brand-400 transition-colors"
              >
                {showAdvanced ? (
                  <ChevronDown className="w-4 h-4" />
                ) : (
                  <ChevronRight className="w-4 h-4" />
                )}
                <Settings2 className="w-4 h-4" />
                {showAdvanced
                  ? t("fire.hide_advanced")
                  : t("fire.show_advanced")}
              </button>
            </div>

            {/* Advanced Monte Carlo Parameters */}
            {showAdvanced && (
              <div className="space-y-4 pt-2 pl-4 border-l-2 border-slate-200 dark:border-slate-700">
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  {t("fire.advanced_description")}
                </p>

                <div>
                  <label className="block text-sm font-bold text-slate-700 dark:text-slate-300 mb-2 flex items-center gap-2">
                    <Activity className="w-4 h-4 text-brand-500 dark:text-brand-400" />
                    {t("fire.return_volatility")}
                  </label>
                  <div className="relative">
                    <NumberInput
                      value={volatility}
                      onChange={(num) => {
                        setVolatility(Number.isNaN(num) ? 0 : num);
                        userModified.current.volatility = true;
                      }}
                      className="w-full px-4 py-3 pr-8 border-2 border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 rounded-xl focus:ring-2 focus:ring-brand-500 focus:border-brand-500 outline-none transition-all font-semibold text-slate-900 dark:text-slate-100 hover:border-slate-300 dark:hover:border-slate-600"
                      placeholder="15"
                      maximumFractionDigits={1}
                      minimumFractionDigits={0}
                      useGrouping={false}
                    />
                    <span className="absolute right-4 top-1/2 -translate-y-1/2 text-slate-400 font-medium">
                      %
                    </span>
                  </div>
                  <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
                    {t("fire.volatility_hint")}
                  </p>
                </div>

                <div>
                  <label className="block text-sm font-bold text-slate-700 dark:text-slate-300 mb-2 flex items-center gap-2">
                    <Activity className="w-4 h-4 text-brand-500 dark:text-brand-400" />
                    {t("fire.simulation_count")}
                  </label>
                  <div className="relative">
                    <NumberInput
                      value={simulationCount}
                      onChange={(num) => {
                        setSimulationCount(
                          Number.isNaN(num)
                            ? 1000
                            : Math.max(100, Math.min(10000, Math.round(num))),
                        );
                        userModified.current.simulationCount = true;
                      }}
                      className="w-full px-4 py-3 border-2 border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 rounded-xl focus:ring-2 focus:ring-brand-500 focus:border-brand-500 outline-none transition-all font-semibold text-slate-900 dark:text-slate-100 hover:border-slate-300 dark:hover:border-slate-600"
                      placeholder="1000"
                      maximumFractionDigits={0}
                      minimumFractionDigits={0}
                      useGrouping={false}
                    />
                  </div>
                  <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
                    {t("fire.simulation_count_hint")}
                  </p>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Results & Chart */}
        <div className="lg:col-span-2 space-y-6">
          {/* Key Metrics */}
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4">
            <div className="bg-gradient-to-br from-blue-50 to-brand-50 dark:from-blue-900/20 dark:to-brand-900/20 p-5 rounded-2xl shadow-md border-2 border-blue-200 dark:border-blue-800 flex items-center justify-between transition-all duration-300">
              <div>
                <p className="text-xs font-bold text-blue-700 dark:text-blue-300 uppercase tracking-wider mb-1">
                  {t("fire.fire_number")}
                </p>
                <p className="text-2xl font-bold text-blue-900 dark:text-blue-100">
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
              <div className="bg-blue-500 dark:bg-blue-600 p-3 rounded-xl shadow-lg">
                <TrendingUp className="w-6 h-6 text-white" />
              </div>
            </div>

            <div className="bg-gradient-to-br from-emerald-50 to-green-50 dark:from-emerald-900/20 dark:to-green-900/20 p-5 rounded-2xl shadow-md border-2 border-emerald-200 dark:border-emerald-800 flex items-center justify-between transition-all duration-300">
              <div>
                <p className="text-xs font-bold text-emerald-700 dark:text-emerald-300 uppercase tracking-wider mb-1">
                  {t("fire.time_to_fire")}
                </p>
                {neverReached ? (
                  <p className="text-lg font-medium text-emerald-900 dark:text-emerald-100">
                    {t("fire.never_retire")}
                  </p>
                ) : (
                  <p className="text-2xl font-bold text-emerald-900 dark:text-emerald-100">
                    {yearsToFire} {t("fire.years")}
                  </p>
                )}
              </div>
              <div className="bg-emerald-500 dark:bg-emerald-600 p-3 rounded-xl shadow-lg">
                <Calendar className="w-6 h-6 text-white" />
              </div>
            </div>

            <div className="bg-gradient-to-br from-purple-50 to-violet-50 dark:from-purple-900/20 dark:to-violet-900/20 p-5 rounded-2xl shadow-md border-2 border-purple-200 dark:border-purple-800 flex items-center justify-between transition-all duration-300">
              <div>
                <p className="text-xs font-bold text-purple-700 dark:text-purple-300 uppercase tracking-wider mb-1">
                  {t("fire.retirement_age")}
                </p>
                {neverReached || !fireAge ? (
                  <p className="text-lg font-medium text-purple-900 dark:text-purple-100">
                    —
                  </p>
                ) : (
                  <p className="text-2xl font-bold text-purple-900 dark:text-purple-100">
                    {t("fire.age_value", { age: fireAge })}
                  </p>
                )}
              </div>
              <div className="bg-purple-500 dark:bg-purple-600 p-3 rounded-xl shadow-lg">
                <User className="w-6 h-6 text-white" />
              </div>
            </div>

            <div
              className={`bg-gradient-to-br p-5 rounded-2xl shadow-md border-2 flex items-center justify-between transition-all duration-300 ${
                monteCarloResult && monteCarloResult.successRate >= 80
                  ? "from-green-50 to-emerald-50 dark:from-green-900/20 dark:to-emerald-900/20 border-green-200 dark:border-green-800"
                  : monteCarloResult && monteCarloResult.successRate >= 50
                    ? "from-amber-50 to-yellow-50 dark:from-amber-900/20 dark:to-yellow-900/20 border-amber-200 dark:border-amber-800"
                    : "from-red-50 to-rose-50 dark:from-red-900/20 dark:to-rose-900/20 border-red-200 dark:border-red-800"
              }`}
            >
              <div>
                <p
                  className={`text-xs font-bold uppercase tracking-wider mb-1 ${
                    monteCarloResult && monteCarloResult.successRate >= 80
                      ? "text-green-700 dark:text-green-300"
                      : monteCarloResult && monteCarloResult.successRate >= 50
                        ? "text-amber-700 dark:text-amber-300"
                        : "text-red-700 dark:text-red-300"
                  }`}
                >
                  {t("fire.success_rate")}
                </p>
                <p
                  className={`text-2xl font-bold ${
                    monteCarloResult && monteCarloResult.successRate >= 80
                      ? "text-green-900 dark:text-green-100"
                      : monteCarloResult && monteCarloResult.successRate >= 50
                        ? "text-amber-900 dark:text-amber-100"
                        : "text-red-900 dark:text-red-100"
                  }`}
                >
                  {monteCarloResult
                    ? `${monteCarloResult.successRate.toFixed(1)}%`
                    : "—"}
                </p>
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
                  {t("fire.monte_carlo")}
                </p>
              </div>
              <div
                className={`p-3 rounded-xl shadow-lg ${
                  monteCarloResult && monteCarloResult.successRate >= 80
                    ? "bg-green-500 dark:bg-green-600"
                    : monteCarloResult && monteCarloResult.successRate >= 50
                      ? "bg-amber-500 dark:bg-amber-600"
                      : "bg-red-500 dark:bg-red-600"
                }`}
              >
                <Activity className="w-6 h-6 text-white" />
              </div>
            </div>
          </div>

          {/* Chart */}
          <div className="bg-white dark:bg-slate-800 p-6 rounded-2xl shadow-md border border-slate-200 dark:border-slate-700 flex-1 min-h-[400px] hover:shadow-lg transition-shadow duration-300">
            <div className="flex items-center justify-between mb-2">
              <div>
                <h3 className="text-lg font-semibold text-slate-700 dark:text-slate-200">
                  {t("fire.projection")}
                </h3>
                <p className="text-sm text-slate-500 dark:text-slate-400">
                  {t("fire.projection_subtitle")}
                </p>
              </div>
              {monteCarloResult && (
                <div className="text-right">
                  <p className="text-xs text-slate-500 dark:text-slate-400">
                    {t("fire.simulations_run", {
                      count: monteCarloResult.simulationCount,
                    })}
                  </p>
                </div>
              )}
            </div>
            <div className="h-[350px]">
              <Line
                data={chartData}
                options={{
                  responsive: true,
                  maintainAspectRatio: false,
                  interaction: {
                    mode: "index",
                    intersect: false,
                  },
                  plugins: {
                    legend: {
                      position: "top",
                      labels: {
                        color: isDark ? "#cbd5e1" : "#475569",
                        filter: (item) => {
                          // Hide some labels to reduce clutter
                          return ![
                            "10th Percentile",
                            "25th Percentile",
                            "75th Percentile",
                          ].includes(item.text);
                        },
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
                              ignorePrivacy: true,
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
                        maxTicksLimit: 10,
                      },
                    },
                  },
                }}
              />
            </div>

            {/* Chart Legend Explanation */}
            <div className="mt-4 pt-4 border-t border-slate-200 dark:border-slate-700">
              <p className="text-xs text-slate-500 dark:text-slate-400">
                {t("fire.chart_legend_explanation")}
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
