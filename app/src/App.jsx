import { useState, useEffect } from "react";
import { invoke } from "@tauri-apps/api/core";
import Sidebar from "./components/Sidebar";
import { computeNetWorth } from "./utils/networth";
import AccountDetails from "./components/AccountDetails";
import Dashboard from "./components/Dashboard";
import InvestmentDashboard from "./components/InvestmentDashboard";
import FireCalculator from "./components/FireCalculator";
import { Wallet } from "lucide-react";
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

function App() {
  const [selectedAccountId, setSelectedAccountId] = useState("dashboard");
  const [refreshTrigger, setRefreshTrigger] = useState(0);
  const [accounts, setAccounts] = useState([]);
  const [marketValues, setMarketValues] = useState({});

  const handleAccountUpdate = () => {
    setRefreshTrigger((prev) => prev + 1);
  };

  async function fetchAccounts() {
    try {
      const accs = await invoke("get_accounts");
      accs.sort((a, b) => b.balance - a.balance);
      setAccounts(accs);
    } catch (e) {
      console.error("Failed to fetch accounts:", e);
    }
  }

  async function fetchMarketValues() {
    try {
      const transactions = await invoke("get_all_transactions");

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
        quoteMap[q.symbol] = q.regularMarketPrice;
      });

      const newMarketValues = {};
      for (const [accountId, holdings] of Object.entries(accountHoldings)) {
        let totalValue = 0;
        for (const [ticker, shares] of Object.entries(holdings)) {
          if (shares > 0.0001) {
            // Try exact match or uppercase match
            const price =
              quoteMap[ticker] || quoteMap[ticker.toUpperCase()] || 0;
            totalValue += shares * price;
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
      await fetchAccounts();
      await fetchMarketValues();
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
      const stored = localStorage.getItem("hb_tx_row_padding");
      const padding = stored ? parseInt(stored, 10) : 12;
      document.documentElement.style.setProperty(
        "--hb-tx-cell-py",
        `${padding}px`,
      );
    } catch (e) {
      console.debug("Failed to apply transaction row padding:", e);
    }
  }, []);

  // Calculate total balance

  const totalBalance = computeNetWorth(accounts, marketValues);

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
      balance: totalBalance,
    };
  } else {
    const acc = accounts.find((a) => a.id === selectedAccountId);
    if (acc) {
      selectedAccount = {
        ...acc,
        balance:
          marketValues[acc.id] !== undefined
            ? marketValues[acc.id]
            : acc.balance,
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
                  <Sidebar
                    accounts={accounts}
                    marketValues={marketValues}
                    selectedId={selectedAccountId}
                    onSelectAccount={setSelectedAccountId}
                    onUpdate={handleAccountUpdate}
                  />

                  <main className="flex-1 min-w-0 p-4 md:p-8 overflow-y-auto bg-slate-50/50 dark:bg-slate-900">
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
            </ConfirmDialogProvider>
          </ToastProvider>{" "}
        </PrivacyProvider>
      </ThemeProvider>{" "}
    </NumberFormatProvider>
  );
}

export default App;
