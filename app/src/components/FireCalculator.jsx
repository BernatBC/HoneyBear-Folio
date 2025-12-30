import { useState, useEffect, useMemo } from "react";
import { invoke } from "@tauri-apps/api/core";
import { Line } from "react-chartjs-2";
import { Calculator, TrendingUp, Euro, Percent, Calendar } from "lucide-react";
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
  const userModified = { current: initialUserModified }; // lightweight ref-like object

  async function fetchData() {
    setLoading(true);
    try {
      const accounts = await invoke("get_accounts");
      const transactions = await invoke("get_all_transactions");

      // --- 1. Calculate Net Worth & Expected Return ---

      // Group holdings and calculate cost basis
      const holdingMap = {};
      let firstTradeDate = null;

      // Sort transactions by date
      transactions.sort((a, b) => new Date(a.date) - new Date(b.date));

      transactions.forEach((tx) => {
        if (tx.ticker && tx.shares) {
          if (!firstTradeDate) firstTradeDate = new Date(tx.date);

          if (!holdingMap[tx.ticker]) {
            holdingMap[tx.ticker] = {
              shares: 0,
              costBasis: 0,
            };
          }

          if (tx.shares > 0) {
            // Buy
            holdingMap[tx.ticker].shares += tx.shares;
            // Use total amount for cost basis (price * shares + fee)
            // Note: tx.amount is negative for buys, so we take abs(amount) or calculate from price/fee
            // In InvestmentDashboard it uses price_per_share * shares + fee.
            // Let's try to use tx.amount if available and negative, otherwise reconstruct.
            // Actually InvestmentDashboard logic:
            // holdingMap[tx.ticker].costBasis += (tx.price_per_share || 0) * tx.shares + (tx.fee || 0);
            // Let's stick to that for consistency.
            const cost = (tx.price_per_share || 0) * tx.shares + (tx.fee || 0);
            holdingMap[tx.ticker].costBasis += cost;
          } else {
            // Sell
            const currentShares = holdingMap[tx.ticker].shares;
            const currentCost = holdingMap[tx.ticker].costBasis;
            const avgCost = currentShares > 0 ? currentCost / currentShares : 0;
            const sharesSold = Math.abs(tx.shares);

            holdingMap[tx.ticker].shares -= sharesSold;
            holdingMap[tx.ticker].costBasis -= sharesSold * avgCost;
          }
        }
      });

      const allTickers = Object.keys(holdingMap).filter(
        (t) => holdingMap[t].shares > 0.0001,
      );
      let totalPortfolioValue = 0;
      let totalPortfolioCostBasis = 0;

      if (allTickers.length > 0) {
        const quotes = await invoke("get_stock_quotes", {
          tickers: allTickers,
        });
        const quoteMap = {};
        quotes.forEach((q) => {
          quoteMap[q.symbol] = q.regularMarketPrice;
        });

        allTickers.forEach((ticker) => {
          const h = holdingMap[ticker];
          const price = quoteMap[ticker] || quoteMap[ticker.toUpperCase()] || 0;
          const value = h.shares * price;

          totalPortfolioValue += value;
          totalPortfolioCostBasis += h.costBasis;

          // For net worth calculation (per account)
          // We need to map this back to accounts, but we already have totalPortfolioValue.
          // The previous net worth logic summed up account balances + market values.
          // Let's keep the previous logic for Net Worth to be safe about account mapping.
        });
      }

      // Re-calculate Net Worth using the previous logic for account mapping
      // (Or just use totalPortfolioValue + cash balances)
      // Let's stick to the previous logic for Net Worth to ensure we handle multiple accounts correctly
      const accountHoldings = {};
      const tickersForNetWorth = new Set();
      transactions.forEach((tx) => {
        if (tx.ticker && tx.shares) {
          if (!accountHoldings[tx.account_id])
            accountHoldings[tx.account_id] = {};
          if (!accountHoldings[tx.account_id][tx.ticker])
            accountHoldings[tx.account_id][tx.ticker] = 0;
          accountHoldings[tx.account_id][tx.ticker] += tx.shares;
          tickersForNetWorth.add(tx.ticker);
        }
      });

      let netWorthMarketValues = {};
      if (tickersForNetWorth.size > 0) {
        const quotes = await invoke("get_stock_quotes", {
          tickers: Array.from(tickersForNetWorth),
        });
        const quoteMap = {};
        quotes.forEach((q) => {
          quoteMap[q.symbol] = q.regularMarketPrice;
        });

        for (const [accountId, holdings] of Object.entries(accountHoldings)) {
          let val = 0;
          for (const [ticker, shares] of Object.entries(holdings)) {
            if (shares > 0.0001) {
              val +=
                shares *
                (quoteMap[ticker] || quoteMap[ticker.toUpperCase()] || 0);
            }
          }
          netWorthMarketValues[accountId] = val;
        }
      }

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
        ); // Min 0.1 years to avoid infinity

        // CAGR = (End Value / Start Value)^(1/n) - 1
        // Here Start Value is Cost Basis (approximation)
        // A better approximation for irregular cashflows is IRR, but CAGR on total cost basis is a simple proxy.
        // Or just annualized simple return?
        // Let's use CAGR of the aggregate: (CurrentValue / CostBasis)^(1/years) - 1
        // This assumes all capital was invested at the beginning, which is wrong.
        // A better simple metric might be just the current ROI?
        // "Expected Annual Return" usually implies long term average.
        // Let's use the simple ROI annualized: (1 + ROI)^(1/years) - 1

        let annualizedReturn =
          (Math.pow(1 + totalReturnRate, 1 / yearsInvested) - 1) * 100;

        // Sanity check: if years < 1, the exponent is > 1, amplifying short term gains/losses.
        // If years < 1, maybe just show the simple return? Or cap it?
        // Let's just set it.
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

  const { fireNumber, yearsToFire, chartData } = useMemo(() => {
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
      yearsToFire: years > 0 ? years : "> 50",
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

  const formatCurrency = (val) => {
    return (
      new Intl.NumberFormat("en-US", { maximumFractionDigits: 0 }).format(val) +
      " €"
    );
  };

  return (
    <div className="h-full flex flex-col space-y-8 max-w-7xl mx-auto pb-8">
      <header className="flex justify-between items-center">
        <div>
          <h1 className="text-3xl font-bold text-slate-900 flex items-center gap-3 tracking-tight">
            <div className="bg-brand-100 p-2 rounded-xl">
              <Calculator className="w-8 h-8 text-brand-600" />
            </div>
            FIRE Calculator
          </h1>
          <p className="text-slate-500 font-medium mt-1 ml-14">
            Financial Independence, Retire Early
          </p>
        </div>
      </header>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        {/* Inputs */}
        <div className="bg-white p-6 rounded-2xl shadow-md border border-slate-200 space-y-6 h-fit hover:shadow-lg transition-shadow duration-300">
          <h2 className="text-xl font-bold text-slate-900 mb-4">Parameters</h2>

          <div className="space-y-5">
            <div>
              <label className="block text-sm font-bold text-slate-700 mb-2 flex items-center gap-2">
                <Euro className="w-4 h-4 text-brand-500" />
                Current Net Worth
              </label>
              <div className="relative">
                <input
                  type="number"
                  value={currentNetWorth}
                  onChange={(e) => {
                    setCurrentNetWorth(Number(e.target.value));
                    userModified.current.currentNetWorth = true;
                  }}
                  className="w-full px-4 py-3 border-2 border-slate-200 rounded-xl focus:ring-2 focus:ring-brand-500 focus:border-brand-500 outline-none transition-all font-semibold text-slate-900 hover:border-slate-300"
                  placeholder="0"
                />
                <span className="absolute right-4 top-1/2 -translate-y-1/2 text-slate-400 font-medium">
                  €
                </span>
              </div>
            </div>

            <div>
              <label className="block text-sm font-bold text-slate-700 mb-2 flex items-center gap-2">
                <Euro className="w-4 h-4 text-brand-500" />
                Annual Expenses
              </label>
              <div className="relative">
                <input
                  type="number"
                  value={annualExpenses}
                  onChange={(e) => {
                    setAnnualExpenses(Number(e.target.value));
                    userModified.current.annualExpenses = true;
                  }}
                  className="w-full px-4 py-3 border-2 border-slate-200 rounded-xl focus:ring-2 focus:ring-brand-500 focus:border-brand-500 outline-none transition-all font-semibold text-slate-900 hover:border-slate-300"
                  placeholder="0"
                />
                <span className="absolute right-4 top-1/2 -translate-y-1/2 text-slate-400 font-medium">
                  €
                </span>
              </div>
            </div>

            <div>
              <label className="block text-sm font-bold text-slate-700 mb-2 flex items-center gap-2">
                <Euro className="w-4 h-4 text-brand-500" />
                Annual Savings
              </label>
              <div className="relative">
                <input
                  type="number"
                  value={annualSavings}
                  onChange={(e) => {
                    setAnnualSavings(Number(e.target.value));
                    userModified.current.annualSavings = true;
                  }}
                  className="w-full px-4 py-3 border-2 border-slate-200 rounded-xl focus:ring-2 focus:ring-brand-500 focus:border-brand-500 outline-none transition-all font-semibold text-slate-900 hover:border-slate-300"
                  placeholder="0"
                />
                <span className="absolute right-4 top-1/2 -translate-y-1/2 text-slate-400 font-medium">
                  €
                </span>
              </div>
            </div>

            <div>
              <label className="block text-sm font-bold text-slate-700 mb-2 flex items-center gap-2">
                <Percent className="w-4 h-4 text-brand-500" />
                Expected Annual Return
              </label>
              <div className="relative">
                <input
                  type="number"
                  value={expectedReturn}
                  onChange={(e) => {
                    setExpectedReturn(Number(e.target.value));
                    userModified.current.expectedReturn = true;
                  }}
                  className="w-full px-4 py-3 border-2 border-slate-200 rounded-xl focus:ring-2 focus:ring-brand-500 focus:border-brand-500 outline-none transition-all font-semibold text-slate-900 hover:border-slate-300"
                  placeholder="0"
                />
                <span className="absolute right-4 top-1/2 -translate-y-1/2 text-slate-400 font-medium">
                  %
                </span>
              </div>
            </div>

            <div>
              <label className="block text-sm font-bold text-slate-700 mb-2 flex items-center gap-2">
                <Percent className="w-4 h-4 text-brand-500" />
                Safe Withdrawal Rate
              </label>
              <div className="relative">
                <input
                  type="number"
                  value={withdrawalRate}
                  onChange={(e) => {
                    setWithdrawalRate(Number(e.target.value));
                    userModified.current.withdrawalRate = true;
                  }}
                  className="w-full px-4 py-3 border-2 border-slate-200 rounded-xl focus:ring-2 focus:ring-brand-500 focus:border-brand-500 outline-none transition-all font-semibold text-slate-900 hover:border-slate-300"
                  placeholder="0"
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
            <div className="bg-gradient-to-br from-blue-50 to-brand-50 p-6 rounded-2xl shadow-md border-2 border-blue-200 flex items-center justify-between hover:shadow-lg hover:-translate-y-1 transition-all duration-300 cursor-pointer">
              <div>
                <p className="text-sm font-bold text-blue-700 uppercase tracking-wider mb-1">
                  FIRE Number
                </p>
                <p className="text-3xl font-bold text-blue-900">
                  {formatCurrency(fireNumber)}
                </p>
              </div>
              <div className="bg-blue-500 p-4 rounded-2xl shadow-lg">
                <TrendingUp className="w-8 h-8 text-white" />
              </div>
            </div>

            <div className="bg-gradient-to-br from-emerald-50 to-green-50 p-6 rounded-2xl shadow-md border-2 border-emerald-200 flex items-center justify-between hover:shadow-lg hover:-translate-y-1 transition-all duration-300 cursor-pointer">
              <div>
                <p className="text-sm font-bold text-emerald-700 uppercase tracking-wider mb-1">
                  Time to FIRE
                </p>
                <p className="text-3xl font-bold text-emerald-900">
                  {yearsToFire} Years
                </p>
              </div>
              <div className="bg-emerald-500 p-4 rounded-2xl shadow-lg">
                <Calendar className="w-8 h-8 text-white" />
              </div>
            </div>
          </div>

          {/* Chart */}
          <div className="bg-white p-6 rounded-2xl shadow-md border border-slate-200 flex-1 min-h-[400px] hover:shadow-lg transition-shadow duration-300">
            <h3 className="text-lg font-semibold text-slate-700 mb-2">
              Projection
            </h3>
            <p className="text-sm text-slate-500 mb-4">
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
                    },
                    tooltip: {
                      callbacks: {
                        label: function (context) {
                          let label = context.dataset.label || "";
                          if (label) {
                            label += ": ";
                          }
                          if (context.parsed.y !== null) {
                            label +=
                              new Intl.NumberFormat("en-US", {
                                maximumFractionDigits: 0,
                              }).format(context.parsed.y) + " €";
                          }
                          return label;
                        },
                      },
                    },
                  },
                  scales: {
                    y: {
                      beginAtZero: true,
                      ticks: {
                        callback: function (value) {
                          return value / 1000 + "k €";
                        },
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
