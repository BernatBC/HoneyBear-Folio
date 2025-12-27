import { useState, useEffect } from 'react';
import { invoke } from '@tauri-apps/api/core';
import ImportModal from './ImportModal';
import ExportModal from './ExportModal';
import { 
  Wallet, 
  Plus, 
  CreditCard, 
  TrendingUp, 
  LayoutDashboard,
  X,
  Check,
  List,
  PieChart,
  Calculator,
  Download,
  Upload,
  Loader2,
  AlertCircle
} from 'lucide-react';

export default function Sidebar({ onSelectAccount, refreshTrigger }) {
  const [accounts, setAccounts] = useState([]);
  const [marketValues, setMarketValues] = useState({});
  const [isAdding, setIsAdding] = useState(false);
  const [showImportModal, setShowImportModal] = useState(false);
  const [showExportModal, setShowExportModal] = useState(false);
  const [newAccountName, setNewAccountName] = useState('');
  const [newAccountBalance, setNewAccountBalance] = useState('');
  const [newAccountType, setNewAccountType] = useState('cash');
  const [selectedId, setSelectedId] = useState('dashboard'); // Default to dashboard

  useEffect(() => {
    fetchAccounts();
    fetchMarketValues();
  }, [refreshTrigger]);

  async function fetchAccounts() {
    try {
      const accs = await invoke('get_accounts');
      accs.sort((a, b) => b.balance - a.balance);
      setAccounts(accs);
    } catch (e) {
      console.error("Failed to fetch accounts:", e);
    }
  }

  async function fetchMarketValues() {
    try {
      const transactions = await invoke('get_all_transactions');
      console.log("Transactions:", transactions);
      
      // Group holdings by account
      const accountHoldings = {};
      const allTickers = new Set();

      transactions.forEach(tx => {
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

      console.log("Account Holdings:", accountHoldings);
      console.log("All Tickers:", Array.from(allTickers));

      if (allTickers.size === 0) {
        setMarketValues({});
        return;
      }

      const quotes = await invoke('get_stock_quotes', { tickers: Array.from(allTickers) });
      console.log("Quotes:", quotes);
      
      const quoteMap = {};
      quotes.forEach(q => {
        quoteMap[q.symbol] = q.regularMarketPrice;
      });

      const newMarketValues = {};
      for (const [accountId, holdings] of Object.entries(accountHoldings)) {
        let totalValue = 0;
        for (const [ticker, shares] of Object.entries(holdings)) {
          if (shares > 0.0001) {
             // Try exact match or uppercase match
             const price = quoteMap[ticker] || quoteMap[ticker.toUpperCase()] || 0;
             totalValue += shares * price;
          }
        }
        newMarketValues[accountId] = totalValue;
      }
      console.log("New Market Values:", newMarketValues);
      setMarketValues(newMarketValues);

    } catch (e) {
      console.error("Failed to fetch market values:", e);
    }
  }

  const totalBalance = accounts.reduce((sum, acc) => {
    if (acc.kind === 'brokerage') {
      return sum + (marketValues[acc.id] !== undefined ? marketValues[acc.id] : acc.balance);
    }
    return sum + acc.balance;
  }, 0);

  async function handleAddAccount(e) {
    e.preventDefault();
    try {
      await invoke('create_account', { 
        name: newAccountName, 
        balance: parseFloat(newAccountBalance) || 0.0,
        kind: newAccountType
      });
      setNewAccountName('');
      setNewAccountBalance('');
      setNewAccountType('cash');
      setIsAdding(false);
      fetchAccounts();
    } catch (e) {
      console.error("Failed to create account:", e);
    }
  }

  const handleSelect = (id, accountData) => {
    setSelectedId(id);
    onSelectAccount(accountData);
  };

  return (
    <div className="w-72 bg-slate-900 text-slate-300 h-screen flex flex-col border-r border-slate-800 shadow-xl">
      {/* Header */}
      <div className="p-6 pb-2">
        <div className="flex items-center gap-3 mb-6 text-white">
          <div className="bg-blue-600 p-2 rounded-lg shadow-lg shadow-blue-900/20">
            <Wallet className="w-6 h-6 text-white" />
          </div>
          <h1 className="text-xl font-bold tracking-tight">HoneyBear</h1>
        </div>

        {/* Net Worth Card */}
        <div className="bg-gradient-to-br from-slate-800 to-slate-900 p-4 rounded-xl border border-slate-700/50 shadow-lg mb-6">
          <div className="flex items-center gap-2 text-xs font-medium text-slate-400 uppercase tracking-wider mb-1">
            <TrendingUp className="w-3 h-3" />
            Net Worth
          </div>
          <div className="text-2xl font-bold text-white tracking-tight">
            €{totalBalance.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
          </div>
        </div>
      </div>
      
      {/* Navigation */}
      <div className="flex-1 overflow-y-auto px-4 space-y-6">
        <div>
          <h2 className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-3 px-2">Overview</h2>
          <button 
            onClick={() => handleSelect('dashboard', { id: 'dashboard', name: 'Dashboard' })}
            className={`w-full text-left py-2.5 px-3 rounded-lg transition-all duration-200 flex items-center gap-3 group mb-1 ${
              selectedId === 'dashboard' 
                ? 'bg-blue-600 text-white shadow-md shadow-blue-900/20' 
                : 'hover:bg-slate-800 text-slate-400 hover:text-slate-200'
            }`}
          >
            <LayoutDashboard className={`w-5 h-5 ${selectedId === 'dashboard' ? 'text-white' : 'text-slate-500 group-hover:text-slate-300'}`} />
            <span className="font-medium">Dashboard</span>
          </button>

          <button 
            onClick={() => handleSelect('investment-dashboard', { id: 'investment-dashboard', name: 'Investments' })}
            className={`w-full text-left py-2.5 px-3 rounded-lg transition-all duration-200 flex items-center gap-3 group mb-1 ${
              selectedId === 'investment-dashboard' 
                ? 'bg-blue-600 text-white shadow-md shadow-blue-900/20' 
                : 'hover:bg-slate-800 text-slate-400 hover:text-slate-200'
            }`}
          >
            <PieChart className={`w-5 h-5 ${selectedId === 'investment-dashboard' ? 'text-white' : 'text-slate-500 group-hover:text-slate-300'}`} />
            <span className="font-medium">Investments</span>
          </button>

          <button 
            onClick={() => handleSelect('fire-calculator', { id: 'fire-calculator', name: 'FIRE Calculator' })}
            className={`w-full text-left py-2.5 px-3 rounded-lg transition-all duration-200 flex items-center gap-3 group mb-1 ${
              selectedId === 'fire-calculator' 
                ? 'bg-blue-600 text-white shadow-md shadow-blue-900/20' 
                : 'hover:bg-slate-800 text-slate-400 hover:text-slate-200'
            }`}
          >
            <Calculator className={`w-5 h-5 ${selectedId === 'fire-calculator' ? 'text-white' : 'text-slate-500 group-hover:text-slate-300'}`} />
            <span className="font-medium">FIRE Calculator</span>
          </button>

          <button 
            onClick={() => handleSelect('all', { id: 'all', name: 'All Transactions', balance: totalBalance })}
            className={`w-full text-left py-2.5 px-3 rounded-lg transition-all duration-200 flex items-center gap-3 group ${
              selectedId === 'all' 
                ? 'bg-blue-600 text-white shadow-md shadow-blue-900/20' 
                : 'hover:bg-slate-800 text-slate-400 hover:text-slate-200'
            }`}
          >
            <List className={`w-5 h-5 ${selectedId === 'all' ? 'text-white' : 'text-slate-500 group-hover:text-slate-300'}`} />
            <span className="font-medium">All Transactions</span>
          </button>
        </div>

        {/* Cash Accounts */}
        <div>
          <div className="flex items-center justify-between mb-3 px-2">
            <h2 className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Cash Accounts</h2>
            <button 
              onClick={() => { setIsAdding(true); setNewAccountType('cash'); }}
              className="text-slate-500 hover:text-blue-400 transition-colors p-1 hover:bg-slate-800 rounded"
            >
              <Plus className="w-4 h-4" />
            </button>
          </div>
          
          <div className="space-y-1">
            {accounts.filter(acc => acc.kind === 'cash').map(account => (
              <button
                key={account.id}
                onClick={() => handleSelect(account.id, account)}
                className={`w-full text-left py-2.5 px-3 rounded-lg transition-all duration-200 flex items-center justify-between group ${
                  selectedId === account.id 
                    ? 'bg-blue-600 text-white shadow-md shadow-blue-900/20' 
                    : 'hover:bg-slate-800 text-slate-400 hover:text-slate-200'
                }`}
              >
                <div className="flex items-center gap-3">
                  <CreditCard className={`w-5 h-5 ${selectedId === account.id ? 'text-white' : 'text-slate-500 group-hover:text-slate-300'}`} />
                  <span className="font-medium truncate max-w-[120px]">{account.name}</span>
                </div>
                <span className={`text-sm font-medium ${selectedId === account.id ? 'text-blue-100' : 'text-slate-500 group-hover:text-slate-300'}`}>
                  €{account.balance.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                </span>
              </button>
            ))}
          </div>
        </div>

        {/* Brokerage Accounts */}
        <div>
          <div className="flex items-center justify-between mb-3 px-2">
            <h2 className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Brokerage Accounts</h2>
            <button 
              onClick={() => { setIsAdding(true); setNewAccountType('brokerage'); }}
              className="text-slate-500 hover:text-blue-400 transition-colors p-1 hover:bg-slate-800 rounded"
            >
              <Plus className="w-4 h-4" />
            </button>
          </div>
          
          <div className="space-y-1">
            {accounts.filter(acc => acc.kind === 'brokerage').map(account => (
              <button
                key={account.id}
                onClick={() => handleSelect(account.id, {
                  ...account,
                  balance: marketValues[account.id] !== undefined ? marketValues[account.id] : account.balance
                })}
                className={`w-full text-left py-2.5 px-3 rounded-lg transition-all duration-200 flex items-center justify-between group ${
                  selectedId === account.id 
                    ? 'bg-blue-600 text-white shadow-md shadow-blue-900/20' 
                    : 'hover:bg-slate-800 text-slate-400 hover:text-slate-200'
                }`}
              >
                <div className="flex items-center gap-3">
                  <TrendingUp className={`w-5 h-5 ${selectedId === account.id ? 'text-white' : 'text-slate-500 group-hover:text-slate-300'}`} />
                  <span className="font-medium truncate max-w-[120px]">{account.name}</span>
                </div>
                <span className={`text-sm font-medium ${selectedId === account.id ? 'text-blue-100' : 'text-slate-500 group-hover:text-slate-300'}`}>
                  €{(marketValues[account.id] !== undefined ? marketValues[account.id] : account.balance).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                </span>
              </button>
            ))}
          </div>
        </div>
        {isAdding && (
          <div className="px-2">
            <form onSubmit={handleAddAccount} className="bg-slate-800 p-3 rounded-lg border border-slate-700 space-y-3">
              <div className="flex justify-between items-center mb-2">
                <span className="text-xs font-medium text-slate-400">New {newAccountType === 'cash' ? 'Cash' : 'Brokerage'} Account</span>
                <button 
                  type="button" 
                  onClick={() => setIsAdding(false)}
                  className="text-slate-500 hover:text-slate-300"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
              <input
                type="text"
                placeholder="Account Name"
                value={newAccountName}
                onChange={(e) => setNewAccountName(e.target.value)}
                className="w-full bg-slate-900 border border-slate-700 rounded px-3 py-2 text-sm text-white placeholder-slate-500 focus:outline-none focus:border-blue-500 transition-colors"
                autoFocus
              />
              <input
                type="number"
                step="0.01"
                placeholder="Initial Balance"
                value={newAccountBalance}
                onChange={(e) => setNewAccountBalance(e.target.value)}
                className="w-full bg-slate-900 border border-slate-700 rounded px-3 py-2 text-sm text-white placeholder-slate-500 focus:outline-none focus:border-blue-500 transition-colors"
              />
              <button 
                type="submit"
                className="w-full bg-blue-600 hover:bg-blue-500 text-white text-sm font-medium py-2 rounded transition-colors flex items-center justify-center gap-2"
              >
                <Check className="w-4 h-4" />
                Create Account
              </button>
            </form>
          </div>
        )}
      </div>

      
      {/* Footer */}
      <div className="p-4 border-t border-slate-800">
        <div className="flex gap-2 mb-2">
          <button 
            onClick={() => setShowImportModal(true)}
            className="flex-1 flex items-center justify-center gap-2 text-slate-500 hover:text-slate-300 hover:bg-slate-800 py-2 rounded transition-colors"
          >
            <Upload className="w-4 h-4" />
            <span className="text-xs font-medium">Import</span>
          </button>
          <button 
            onClick={() => setShowExportModal(true)}
            className="flex-1 flex items-center justify-center gap-2 text-slate-500 hover:text-slate-300 hover:bg-slate-800 py-2 rounded transition-colors"
          >
            <Download className="w-4 h-4" />
            <span className="text-xs font-medium">Export</span>
          </button>
        </div>
        <div className="text-xs text-slate-600 text-center">
          v0.1.0 • HoneyBear
        </div>
      </div>
      
      {showImportModal && (
        <ImportModal 
          onClose={() => setShowImportModal(false)} 
          onImportComplete={() => {
            fetchAccounts();
            fetchMarketValues();
          }} 
        />
      )}

      {showExportModal && (
        <ExportModal 
          onClose={() => setShowExportModal(false)} 
        />
      )}
    </div>
  );
}

