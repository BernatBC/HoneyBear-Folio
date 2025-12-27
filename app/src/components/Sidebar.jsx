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
  Upload
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
    <div className="w-72 bg-slate-900 text-slate-300 h-screen flex flex-col border-r border-slate-800 shadow-2xl z-10">
      {/* Header */}
      <div className="p-6 pb-4">
        <div className="flex items-center gap-3 mb-8 text-white">
          <div className="bg-brand-600 p-2.5 rounded-xl shadow-lg shadow-brand-900/20 ring-1 ring-white/10">
            <Wallet className="w-6 h-6 text-white" />
          </div>
          <div>
            <h1 className="text-xl font-bold tracking-tight text-white">HoneyBear</h1>
            <p className="text-xs text-slate-500 font-medium">Portfolio Tracker</p>
          </div>
        </div>

        {/* Net Worth Card */}
        <div className="bg-slate-800/50 p-5 rounded-2xl border border-slate-700/50 shadow-inner mb-2 backdrop-blur-sm">
          <div className="flex items-center gap-2 text-xs font-semibold text-brand-400 uppercase tracking-wider mb-2">
            <TrendingUp className="w-3.5 h-3.5" />
            Net Worth
          </div>
          <div className="text-2xl font-bold text-white tracking-tight">
            {totalBalance.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} €
          </div>
        </div>
      </div>
      
      {/* Navigation */}
      <div className="flex-1 overflow-y-auto px-4 space-y-8 py-2 custom-scrollbar">
        <div>
          <h2 className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-3 px-3">Overview</h2>
          <div className="space-y-1">
            <button 
              onClick={() => handleSelect('dashboard', { id: 'dashboard', name: 'Dashboard' })}
              className={`w-full text-left py-2.5 px-3 rounded-xl transition-all duration-200 flex items-center gap-3 group ${
                selectedId === 'dashboard' 
                  ? 'bg-brand-600 text-white shadow-lg shadow-brand-900/20 ring-1 ring-white/10' 
                  : 'hover:bg-slate-800/80 text-slate-400 hover:text-slate-200'
              }`}
            >
              <LayoutDashboard className={`w-5 h-5 ${selectedId === 'dashboard' ? 'text-white' : 'text-slate-500 group-hover:text-slate-300'}`} />
              <span className="font-medium">Dashboard</span>
            </button>

            <button 
              onClick={() => handleSelect('investment-dashboard', { id: 'investment-dashboard', name: 'Investments' })}
              className={`w-full text-left py-2.5 px-3 rounded-xl transition-all duration-200 flex items-center gap-3 group ${
                selectedId === 'investment-dashboard' 
                  ? 'bg-brand-600 text-white shadow-lg shadow-brand-900/20 ring-1 ring-white/10' 
                  : 'hover:bg-slate-800/80 text-slate-400 hover:text-slate-200'
              }`}
            >
              <PieChart className={`w-5 h-5 ${selectedId === 'investment-dashboard' ? 'text-white' : 'text-slate-500 group-hover:text-slate-300'}`} />
              <span className="font-medium">Investments</span>
            </button>

            <button 
              onClick={() => handleSelect('fire-calculator', { id: 'fire-calculator', name: 'FIRE Calculator' })}
              className={`w-full text-left py-2.5 px-3 rounded-xl transition-all duration-200 flex items-center gap-3 group ${
                selectedId === 'fire-calculator' 
                  ? 'bg-brand-600 text-white shadow-lg shadow-brand-900/20 ring-1 ring-white/10' 
                  : 'hover:bg-slate-800/80 text-slate-400 hover:text-slate-200'
              }`}
            >
              <Calculator className={`w-5 h-5 ${selectedId === 'fire-calculator' ? 'text-white' : 'text-slate-500 group-hover:text-slate-300'}`} />
              <span className="font-medium">FIRE Calculator</span>
            </button>

            <button 
              onClick={() => handleSelect('all', { id: 'all', name: 'All Transactions', balance: totalBalance })}
              className={`w-full text-left py-2.5 px-3 rounded-xl transition-all duration-200 flex items-center gap-3 group ${
                selectedId === 'all' 
                  ? 'bg-brand-600 text-white shadow-lg shadow-brand-900/20 ring-1 ring-white/10' 
                  : 'hover:bg-slate-800/80 text-slate-400 hover:text-slate-200'
              }`}
            >
              <List className={`w-5 h-5 ${selectedId === 'all' ? 'text-white' : 'text-slate-500 group-hover:text-slate-300'}`} />
              <span className="font-medium">All Transactions</span>
            </button>
          </div>
        </div>

        {/* Cash Accounts */}
        <div>
          <div className="flex items-center justify-between mb-3 px-3">
            <h2 className="text-xs font-bold text-slate-500 uppercase tracking-wider">Cash Accounts</h2>
            <button 
              onClick={() => { setIsAdding(true); setNewAccountType('cash'); }}
              className="text-slate-500 hover:text-brand-400 transition-colors p-1 hover:bg-slate-800 rounded-lg"
            >
              <Plus className="w-4 h-4" />
            </button>
          </div>
          
          <div className="space-y-1">
            {accounts.filter(acc => acc.kind === 'cash').map(account => (
              <button
                key={account.id}
                onClick={() => handleSelect(account.id, account)}
                className={`w-full text-left py-2.5 px-3 rounded-xl transition-all duration-200 flex items-center justify-between group ${
                  selectedId === account.id 
                    ? 'bg-brand-600 text-white shadow-lg shadow-brand-900/20 ring-1 ring-white/10' 
                    : 'hover:bg-slate-800/80 text-slate-400 hover:text-slate-200'
                }`}
              >
                <div className="flex items-center gap-3">
                  <CreditCard className={`w-5 h-5 ${selectedId === account.id ? 'text-white' : 'text-slate-500 group-hover:text-slate-300'}`} />
                  <span className="font-medium truncate max-w-[120px]">{account.name}</span>
                </div>
                <span className={`text-sm font-medium ${selectedId === account.id ? 'text-blue-100' : 'text-slate-500 group-hover:text-slate-300'}`}>
                  {account.balance.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} €
                </span>
              </button>
            ))}
          </div>
        </div>

        {/* Brokerage Accounts */}
        <div>
          <div className="flex items-center justify-between mb-3 px-3">
            <h2 className="text-xs font-bold text-slate-500 uppercase tracking-wider">Brokerage Accounts</h2>
            <button 
              onClick={() => { setIsAdding(true); setNewAccountType('brokerage'); }}
              className="text-slate-500 hover:text-brand-400 transition-colors p-1 hover:bg-slate-800 rounded-lg"
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
                className={`w-full text-left py-2.5 px-3 rounded-xl transition-all duration-200 flex items-center justify-between group ${
                  selectedId === account.id 
                    ? 'bg-brand-600 text-white shadow-lg shadow-brand-900/20 ring-1 ring-white/10' 
                    : 'hover:bg-slate-800/80 text-slate-400 hover:text-slate-200'
                }`}
              >
                <div className="flex items-center gap-3">
                  <TrendingUp className={`w-5 h-5 ${selectedId === account.id ? 'text-white' : 'text-slate-500 group-hover:text-slate-300'}`} />
                  <span className="font-medium truncate max-w-[120px]">{account.name}</span>
                </div>
                <span className={`text-sm font-medium ${selectedId === account.id ? 'text-blue-100' : 'text-slate-500 group-hover:text-slate-300'}`}>
                  {(marketValues[account.id] !== undefined ? marketValues[account.id] : account.balance).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} €
                </span>
              </button>
            ))}
          </div>
        </div>
        {isAdding && (
          <div className="px-2">
            <form onSubmit={handleAddAccount} className="bg-slate-800/50 p-4 rounded-xl border border-slate-700/50 space-y-3 backdrop-blur-sm">
              <div className="flex justify-between items-center mb-2">
                <span className="text-xs font-bold text-slate-400 uppercase tracking-wider">New {newAccountType === 'cash' ? 'Cash' : 'Brokerage'} Account</span>
                <button 
                  type="button" 
                  onClick={() => setIsAdding(false)}
                  className="text-slate-500 hover:text-slate-300 transition-colors"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
              <input
                type="text"
                placeholder="Account Name"
                value={newAccountName}
                onChange={(e) => setNewAccountName(e.target.value)}
                className="w-full bg-slate-900/50 border border-slate-700 rounded-lg px-3 py-2 text-sm text-white placeholder-slate-500 focus:outline-none focus:border-brand-500 focus:ring-1 focus:ring-brand-500 transition-all"
                autoFocus
              />
              <input
                type="number"
                step="0.01"
                placeholder="Initial Balance"
                value={newAccountBalance}
                onChange={(e) => setNewAccountBalance(e.target.value)}
                className="w-full bg-slate-900/50 border border-slate-700 rounded-lg px-3 py-2 text-sm text-white placeholder-slate-500 focus:outline-none focus:border-brand-500 focus:ring-1 focus:ring-brand-500 transition-all"
              />
              <button 
                type="submit"
                className="w-full bg-brand-600 hover:bg-brand-500 text-white text-sm font-medium py-2 rounded-lg transition-colors flex items-center justify-center gap-2 shadow-lg shadow-brand-900/20"
              >
                <Check className="w-4 h-4" />
                <span className="text-white">Create Account</span>
              </button>
            </form>
          </div>
        )}
      </div>

      
      {/* Footer */}
      <div className="p-4 border-t border-slate-800 bg-slate-900/50">
        <div className="flex gap-2 mb-3">
          <button 
            onClick={() => setShowImportModal(true)}
            className="flex-1 flex items-center justify-center gap-2 text-slate-400 hover:text-white hover:bg-slate-800 py-2.5 rounded-lg transition-all duration-200 border border-transparent hover:border-slate-700"
          >
            <Upload className="w-4 h-4" />
            <span className="text-xs font-medium">Import</span>
          </button>
          <button 
            onClick={() => setShowExportModal(true)}
            className="flex-1 flex items-center justify-center gap-2 text-slate-400 hover:text-white hover:bg-slate-800 py-2.5 rounded-lg transition-all duration-200 border border-transparent hover:border-slate-700"
          >
            <Download className="w-4 h-4" />
            <span className="text-xs font-medium">Export</span>
          </button>
        </div>
        <div className="text-[10px] text-slate-600 text-center font-medium tracking-wide uppercase">
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

