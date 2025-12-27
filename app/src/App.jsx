import { useState } from "react";
import Sidebar from "./components/Sidebar";
import AccountDetails from "./components/AccountDetails";
import Dashboard from "./components/Dashboard";
import InvestmentDashboard from "./components/InvestmentDashboard";
import FireCalculator from "./components/FireCalculator";
import { Wallet } from "lucide-react";
import "./App.css";

function App() {
  const [selectedAccount, setSelectedAccount] = useState({ id: 'dashboard', name: 'Dashboard' });
  const [refreshTrigger, setRefreshTrigger] = useState(0);

  const handleAccountUpdate = () => {
    setRefreshTrigger(prev => prev + 1);
  };

  return (
    <div className="flex h-screen bg-slate-50 text-slate-900 font-sans overflow-hidden">
      <Sidebar 
        onSelectAccount={setSelectedAccount} 
        refreshTrigger={refreshTrigger}
      />
      
      <main className="flex-1 p-8 overflow-y-auto bg-slate-50/50">
        <div className="max-w-7xl mx-auto">
          {selectedAccount?.id === 'dashboard' ? (
            <Dashboard />
          ) : selectedAccount?.id === 'investment-dashboard' ? (
            <InvestmentDashboard />
          ) : selectedAccount?.id === 'fire-calculator' ? (
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
              <h2 className="text-3xl font-bold mb-3 text-slate-800 tracking-tight">Welcome to HoneyBear Folio</h2>
              <p className="text-lg text-slate-500 max-w-md text-center leading-relaxed">
                Select an account from the sidebar to view details, or create a new one to get started.
              </p>
            </div>
          )}
        </div>
      </main>
    </div>
  );
}

export default App;

