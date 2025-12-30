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

  return (
    <div className="flex h-screen bg-slate-50 text-slate-900 font-sans overflow-hidden">
      <Sidebar
        accounts={accounts}
        marketValues={marketValues}
        selectedId={selectedAccountId}
        onSelectAccount={setSelectedAccountId}
        onUpdate={handleAccountUpdate}
      />

      <main className="flex-1 p-8 overflow-y-auto bg-slate-50/50">
        <div className="max-w-7xl mx-auto">
          {selectedAccountId === "dashboard" ? (
            <Dashboard accounts={accounts} marketValues={marketValues} />
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
              <div className="bg-white p-8 rounded-2xl shadow-xl shadow-slate-200/50 mb-8 animate-in fade-in zoom-in duration-500">
                <Wallet className="w-16 h-16 text-brand-500" />
              </div>
              <h2 className="text-3xl font-bold mb-3 text-slate-800 tracking-tight">
                Welcome to HoneyBear Folio
              </h2>
              <p className="text-lg text-slate-500 max-w-md text-center leading-relaxed">
                Select an account from the sidebar to view details, or create a
                new one to get started.
              </p>
            </div>
          )}
        </div>
      </main>
    </div>
  );
}

export default App;
