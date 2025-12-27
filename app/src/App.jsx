import { useState } from "react";
import Sidebar from "./components/Sidebar";
import AccountDetails from "./components/AccountDetails";
import "./App.css";

function App() {
  const [selectedAccount, setSelectedAccount] = useState(null);
  const [refreshTrigger, setRefreshTrigger] = useState(0);

  const handleAccountUpdate = () => {
    // Trigger a refresh of the sidebar (and potentially re-fetch the selected account if needed)
    // For now, we can just increment a counter that Sidebar listens to, 
    // or we can rely on Sidebar fetching on mount/update.
    // A better way is to lift the state up or use a context, but for now let's just 
    // force a re-render or pass a callback.
    setRefreshTrigger(prev => prev + 1);
    
    // Also update the selected account's balance locally if we want immediate feedback
    // But since we are re-fetching in Sidebar, we might want to re-select the account there.
    // Actually, let's just pass a refresh signal to Sidebar.
  };

  return (
    <div className="flex h-screen bg-gray-100 text-gray-900 font-sans">
      <Sidebar 
        onSelectAccount={setSelectedAccount} 
        refreshTrigger={refreshTrigger}
      />
      
      <main className="flex-1 p-8 overflow-y-auto">
        {selectedAccount ? (
          <AccountDetails 
            key={selectedAccount.id} // Force re-mount when account changes
            account={selectedAccount} 
            onUpdate={handleAccountUpdate}
          />
        ) : (
          <div className="flex flex-col items-center justify-center h-full text-gray-400">
            <div className="text-6xl mb-4">🐻</div>
            <h2 className="text-2xl font-semibold mb-2">Welcome to HoneyBear Folio</h2>
            <p>Select an account from the sidebar to view details.</p>
          </div>
        )}
      </main>
    </div>
  );
}

export default App;

