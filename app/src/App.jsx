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
    <div className="flex h-screen bg-slate-50 text-slate-900 font-sans">
      <Sidebar 
        onSelectAccount={setSelectedAccount} 
        refreshTrigger={refreshTrigger}
      />
      
      <main className="flex-1 p-8 overflow-y-auto">
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
          <div className="flex flex-col items-center justify-center h-full text-slate-400">
            <div className="bg-white p-8 rounded-full shadow-lg mb-6 animate-bounce">
              <Wallet className="w-16 h-16 text-blue-500" />
            </div>
            <h2 className="text-3xl font-bold mb-3 text-slate-700">Welcome to HoneyBear Folio</h2>
            <p className="text-lg text-slate-500 max-w-md text-center">
              Select an account from the sidebar to view details, or create a new one to get started.
            </p>
          </div>
        )}
      </main>
    </div>
  );
}

export default App;

