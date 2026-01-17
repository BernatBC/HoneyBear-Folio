import { useState, useEffect } from "react";
import { invoke } from "@tauri-apps/api/core";
import Sidebar from "./components/Sidebar";
import { computeNetWorth } from "./utils/networth";
import AccountDetails from "./components/AccountDetails";
import Dashboard from "./components/Dashboard";
import InvestmentDashboard from "./components/InvestmentDashboard";
import FireCalculator from "./components/FireCalculator";
import { Wallet, PanelLeftOpen } from "lucide-react";
import "./styles/App.css";
import { ToastProvider } from "./components/Toast";
import { ConfirmDialogProvider } from "./components/ConfirmDialog";
import ErrorBoundary from "./components/ErrorBoundary";
import { NumberFormatProvider } from "./contexts/NumberFormatContext";
import { ThemeProvider } from "./contexts/ThemeContext";
import { PrivacyProvider } from "./contexts/PrivacyContext";
import ChartNumberFormatSync from "./components/ChartNumberFormatSync";
import UpdateNotification from "./components/UpdateNotification";
import WelcomeWindow from "./components/WelcomeWindow";
import DevTools from "./components/DevTools";

function App() {
  const [selectedAccountId, setSelectedAccountId] = useState("dashboard");
  const [isSidebarOpen, setIsSidebarOpen] = useState(true);
  const [refreshTrigger, setRefreshTrigger] = useState(0);
  const [accounts, setAccounts] = useState([]);
  const [marketValues, setMarketValues] = useState({});

  const handleAccountUpdate = () => {
    setRefreshTrigger((prev) => prev + 1);
  };

  async function fetchAccounts() {
    try {
      const currency = localStorage.getItem("hb_currency") || "USD";
      const accs = await invoke("get_accounts", { targetCurrency: currency });
      accs.sort((a, b) => b.balance - a.balance);
      setAccounts(accs);
      return accs;
    } catch (e) {
      console.error("Failed to fetch accounts:", e);
      return [];
    }
  }

  async function fetchMarketValues(currentAccounts = []) {
    try {
      const transactions = await invoke("get_all_transactions");
      const appCurrency = localStorage.getItem("hb_currency") || "USD";

      const accountCcyMap = {};
      if (currentAccounts && currentAccounts.length) {
        currentAccounts.forEach((acc) => {
          if (acc.currency) accountCcyMap[acc.id] = acc.currency;
        });
      }

      // Group holdings by account
      const accountHoldings = {};
      const allTickers = new Set();

      transactions.forEach((tx) => {
        if (tx.ticker && tx.shares) {
          if (!accountHoldings[tx.account_id]) {
            accountHoldings[tx.account_id] = {};
          }
          if (!accountHoldings[tx.account_id][tx.ticker]) {
            accountHoldings[tx.account_id][tx.ticker] = 0;
          }
          accountHoldings[tx.account_id][tx.ticker] += tx.shares;
          allTickers.add(tx.ticker);
        }
      });

      if (allTickers.size === 0) {
        setMarketValues({});
        return;
      }

      const quotes = await invoke("get_stock_quotes", {
        tickers: Array.from(allTickers),
      });

      const quoteMap = {};
      quotes.forEach((q) => {
        quoteMap[q.symbol] = q;
      });

      // Determine required exchange rates
      const ratesToFetch = new Set();
      for (const [accountId, holdings] of Object.entries(accountHoldings)) {
        const targetCcy = accountCcyMap[Number(accountId)] || appCurrency;
        for (const ticker of Object.keys(holdings)) {
          const q = quoteMap[ticker] || quoteMap[ticker.toUpperCase()];
          if (q && q.currency && q.currency !== targetCcy) {
            ratesToFetch.add(`${q.currency}${targetCcy}=X`);
          }
        }
      }

      // Fetch rates
      const exchangeRates = {};
      if (ratesToFetch.size > 0) {
        const rateTickers = Array.from(ratesToFetch);
        const rateQuotes = await invoke("get_stock_quotes", {
          tickers: rateTickers,
        });
        rateQuotes.forEach((q) => {
          exchangeRates[q.symbol] = q.regularMarketPrice;
        });
      }

      const newMarketValues = {};
      for (const [accountId, holdings] of Object.entries(accountHoldings)) {
        let totalValue = 0;
        const targetCcy = accountCcyMap[Number(accountId)] || appCurrency;

        for (const [ticker, shares] of Object.entries(holdings)) {
          if (shares > 0.0001) {
            const q = quoteMap[ticker] || quoteMap[ticker.toUpperCase()];
            if (q) {
              let price = q.regularMarketPrice || 0;
              if (q.currency && q.currency !== targetCcy) {
                const pair = `${q.currency}${targetCcy}=X`;
                if (exchangeRates[pair]) {
                  price = price * exchangeRates[pair];
                }
              }
              totalValue += shares * price;
            }
          }
        }
        newMarketValues[accountId] = totalValue;
      }
      setMarketValues(newMarketValues);
    } catch (e) {
      console.error("Failed to fetch market values:", e);
    }
  }

  useEffect(() => {
    const loadData = async () => {
      const accs = await fetchAccounts();
      await fetchMarketValues(accs);
    };
    loadData();
  }, [refreshTrigger]);

  // Clear saved FIRE calculator state at app startup so user inputs reset after the
  // app is closed and re-opened. We keep session persistence during the running
  // session (switching tabs) since `sessionStorage` is still used by the
  // `FireCalculator` component.
  useEffect(() => {
    try {
      sessionStorage.removeItem("fireCalculatorState");
    } catch (e) {
      // sessionStorage may be unavailable in some environments; ignore errors
      console.debug("Could not clear fireCalculatorState on startup:", e);
    }
  }, []);

  useEffect(() => {
    try {
      const stored = localStorage.getItem("hb_font_size");
      const fontSize = stored ? parseFloat(stored) : 1.0;
      document.documentElement.style.setProperty(
        "--hb-font-size",
        String(fontSize),
      );
    } catch (e) {
      console.debug("Failed to apply font size:", e);
    }
  }, []);

  // Calculate total balance

  const totalBalance = computeNetWorth(accounts, marketValues);

  const totalCashBalance = accounts.reduce((sum, acc) => {
    const balance = Number(acc.balance) || 0;
    const rate = acc.exchange_rate || 1.0;
    return sum + balance * rate;
  }, 0);

  // Derive selectedAccount
  let selectedAccount = null;
  if (selectedAccountId === "dashboard") {
    selectedAccount = { id: "dashboard", name: "Dashboard" };
  } else if (selectedAccountId === "investment-dashboard") {
    selectedAccount = { id: "investment-dashboard", name: "Investments" };
  } else if (selectedAccountId === "fire-calculator") {
    selectedAccount = { id: "fire-calculator", name: "FIRE Calculator" };
  } else if (selectedAccountId === "all") {
    selectedAccount = {
      id: "all",
      name: "All Transactions",
      balance: totalCashBalance,
      totalValue: totalBalance,
    };
  } else {
    const acc = accounts.find((a) => a.id === selectedAccountId);
    if (acc) {
      selectedAccount = {
        ...acc,
        balance: Number(acc.balance),
        totalValue:
          marketValues[acc.id] !== undefined
            ? Number(acc.balance) + Number(marketValues[acc.id])
            : Number(acc.balance),
      };
    }
  }

  // Global error overlay state
  const [globalError, setGlobalError] = useState(null);

  // Install global handlers to catch uncaught errors and promise rejections
  useEffect(() => {
    function handleWindowError(event) {
      console.error("Window error:", event.error || event.message, event);
      setGlobalError(event.error || event.message || "Unknown error");
    }

    function handleRejection(event) {
      console.error("Unhandled rejection:", event.reason || event);
      setGlobalError(event.reason || "Unhandled promise rejection");
    }

    window.addEventListener("error", handleWindowError);
    window.addEventListener("unhandledrejection", handleRejection);

    return () => {
      window.removeEventListener("error", handleWindowError);
      window.removeEventListener("unhandledrejection", handleRejection);
    };
  }, []);

  return (
    <NumberFormatProvider>
      <ThemeProvider>
        <PrivacyProvider>
          <ToastProvider>
            <ConfirmDialogProvider>
              <ErrorBoundary>
                <ChartNumberFormatSync />
                <UpdateNotification />
                <div className="flex h-screen bg-slate-50 dark:bg-slate-900 text-slate-900 dark:text-slate-100 font-sans overflow-hidden">
                  <div
                    className={`transition-all duration-300 ease-in-out overflow-hidden flex-shrink-0 ${
                      isSidebarOpen ? "w-80" : "w-0"
                    }`}
                  >
                    <div className="w-80 h-full">
                      <Sidebar
                        accounts={accounts}
                        marketValues={marketValues}
                        selectedId={selectedAccountId}
                        onSelectAccount={setSelectedAccountId}
                        onUpdate={handleAccountUpdate}
                        onClose={() => setIsSidebarOpen(false)}
                      />
                    </div>
                  </div>

                  <main className="flex-1 min-w-0 p-4 md:p-8 overflow-y-auto bg-slate-50 dark:bg-slate-900 relative">
                    <div
                      className={`absolute top-4 left-4 z-20 transition-all duration-300 ${
                        !isSidebarOpen
                          ? "opacity-100 translate-x-0"
                          : "opacity-0 -translate-x-4 pointer-events-none"
                      }`}
                    >
                      <button
                        onClick={() => setIsSidebarOpen(true)}
                        className="p-2 bg-white dark:bg-slate-800 text-slate-500 hover:text-brand-600 rounded-lg shadow-md border border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-700 transition-colors cursor-pointer"
                        title="Show Sidebar"
                        aria-label="Show Sidebar"
                      >
                        <PanelLeftOpen size={20} />
                      </button>
                    </div>
                    <div className="max-w-7xl mx-auto">
                      {selectedAccountId === "dashboard" ? (
                        <Dashboard
                          accounts={accounts}
                          marketValues={marketValues}
                        />
                      ) : selectedAccountId === "investment-dashboard" ? (
                        <InvestmentDashboard />
                      ) : selectedAccountId === "fire-calculator" ? (
                        <FireCalculator />
                      ) : selectedAccount ? (
                        <AccountDetails
                          key={selectedAccount.id}
                          account={selectedAccount}
                          onUpdate={handleAccountUpdate}
                        />
                      ) : (
                        <div className="flex flex-col items-center justify-center h-[80vh] text-slate-400">
                          <div className="bg-white dark:bg-slate-800 p-8 rounded-2xl shadow-xl shadow-slate-200/50 dark:shadow-none mb-8 animate-in fade-in zoom-in duration-500">
                            <Wallet className="w-16 h-16 text-brand-500" />
                          </div>
                          <h2 className="text-3xl font-bold mb-3 text-slate-800 dark:text-slate-100 tracking-tight">
                            Welcome to HoneyBear Folio
                          </h2>
                          <p className="text-lg text-slate-500 dark:text-slate-400 max-w-md text-center leading-relaxed">
                            Select an account from the sidebar to view details,
                            or create a new one to get started.
                          </p>
                        </div>
                      )}
                    </div>
                  </main>
                </div>

                {globalError && (
                  <div className="fixed inset-4 z-60 p-6 rounded-lg bg-rose-50 dark:bg-rose-900/20 border border-rose-200 dark:border-rose-800 text-rose-800 dark:text-rose-200">
                    <h3 className="text-lg font-bold mb-2">
                      An unexpected error occurred
                    </h3>
                    <pre className="text-sm max-h-60 overflow-auto whitespace-pre-wrap">
                      {typeof globalError === "string"
                        ? globalError
                        : (globalError && globalError.stack) ||
                          String(globalError)}
                    </pre>
                    <div className="mt-3 flex gap-2">
                      <button
                        className="bg-white dark:bg-slate-700 text-sm px-3 py-1 rounded border"
                        onClick={() => {
                          console.clear();
                          setGlobalError(null);
                        }}
                      >
                        Dismiss
                      </button>
                      <button
                        className="bg-slate-700 text-white text-sm px-3 py-1 rounded"
                        onClick={() => window.location.reload()}
                      >
                        Reload
                      </button>
                    </div>
                  </div>
                )}
              </ErrorBoundary>
              <WelcomeWindow />
              <DevTools />
            </ConfirmDialogProvider>
          </ToastProvider>{" "}
        </PrivacyProvider>
      </ThemeProvider>{" "}
    </NumberFormatProvider>
  );
}

export default App;
