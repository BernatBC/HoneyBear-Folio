import { useState, useEffect } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { 
  Wallet, 
  Plus, 
  CreditCard, 
  TrendingUp, 
  LayoutDashboard,
  X,
  Check
} from 'lucide-react';

export default function Sidebar({ onSelectAccount, refreshTrigger }) {
  const [accounts, setAccounts] = useState([]);
  const [isAdding, setIsAdding] = useState(false);
  const [newAccountName, setNewAccountName] = useState('');
  const [newAccountBalance, setNewAccountBalance] = useState('');
  const [selectedId, setSelectedId] = useState('all');

  useEffect(() => {
    fetchAccounts();
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

  const totalBalance = accounts.reduce((sum, acc) => sum + acc.balance, 0);

  async function handleAddAccount(e) {
    e.preventDefault();
    try {
      await invoke('create_account', { 
        name: newAccountName, 
        balance: parseFloat(newAccountBalance) || 0.0 
      });
      setNewAccountName('');
      setNewAccountBalance('');
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
            ${totalBalance.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
          </div>
        </div>
      </div>
      
      {/* Navigation */}
      <div className="flex-1 overflow-y-auto px-4 space-y-6">
        <div>
          <h2 className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-3 px-2">Overview</h2>
          <button 
            onClick={() => handleSelect('all', { id: 'all', name: 'All Accounts', balance: totalBalance })}
            className={`w-full text-left py-2.5 px-3 rounded-lg transition-all duration-200 flex items-center gap-3 group ${
              selectedId === 'all' 
                ? 'bg-blue-600 text-white shadow-md shadow-blue-900/20' 
                : 'hover:bg-slate-800 text-slate-400 hover:text-slate-200'
            }`}
          >
            <LayoutDashboard className={`w-5 h-5 ${selectedId === 'all' ? 'text-white' : 'text-slate-500 group-hover:text-slate-300'}`} />
            <span className="font-medium">Dashboard</span>
          </button>
        </div>

        <div>
          <div className="flex items-center justify-between mb-3 px-2">
            <h2 className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Accounts</h2>
            <button 
              onClick={() => setIsAdding(!isAdding)}
              className="text-slate-500 hover:text-blue-400 transition-colors p-1 rounded hover:bg-slate-800"
              title="Add Account"
            >
              <Plus className="w-4 h-4" />
            </button>
          </div>

          {isAdding && (
            <form onSubmit={handleAddAccount} className="mb-4 bg-slate-800/50 p-3 rounded-lg border border-slate-700 animate-in slide-in-from-top-2 duration-200">
              <input 
                type="text" 
                placeholder="Account Name" 
                className="w-full mb-2 px-3 py-2 text-sm text-white bg-slate-900 border border-slate-700 rounded-md focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 placeholder-slate-500"
                value={newAccountName}
                onChange={e => setNewAccountName(e.target.value)}
                required
                autoFocus
              />
              <input 
                type="number" 
                placeholder="0.00" 
                className="w-full mb-3 px-3 py-2 text-sm text-white bg-slate-900 border border-slate-700 rounded-md focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 placeholder-slate-500"
                value={newAccountBalance}
                onChange={e => setNewAccountBalance(e.target.value)}
                step="0.01"
              />
              <div className="flex justify-end gap-2">
                <button 
                  type="button" 
                  onClick={() => setIsAdding(false)} 
                  className="p-1.5 text-slate-400 hover:text-slate-200 hover:bg-slate-700 rounded transition-colors"
                >
                  <X className="w-4 h-4" />
                </button>
                <button 
                  type="submit" 
                  className="p-1.5 text-blue-400 hover:text-blue-300 hover:bg-blue-900/30 rounded transition-colors"
                >
                  <Check className="w-4 h-4" />
                </button>
              </div>
            </form>
          )}

          <ul className="space-y-1">
            {accounts.map(account => (
              <li key={account.id}>
                <button 
                  onClick={() => handleSelect(account.id, account)}
                  className={`w-full text-left py-2.5 px-3 rounded-lg transition-all duration-200 flex justify-between items-center group ${
                    selectedId === account.id 
                      ? 'bg-slate-800 text-white border border-slate-700' 
                      : 'hover:bg-slate-800/50 text-slate-400 hover:text-slate-200 border border-transparent'
                  }`}
                >
                  <div className="flex items-center gap-3 overflow-hidden">
                    <CreditCard className={`w-5 h-5 flex-shrink-0 ${selectedId === account.id ? 'text-blue-400' : 'text-slate-600 group-hover:text-slate-500'}`} />
                    <span className="font-medium truncate">{account.name}</span>
                  </div>
                  <span className={`text-sm font-medium ${selectedId === account.id ? 'text-white' : 'text-slate-500 group-hover:text-slate-300'}`}>
                    ${account.balance.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        </div>
      </div>
      
      {/* Footer */}
      <div className="p-4 border-t border-slate-800 text-xs text-slate-600 text-center">
        v0.1.0 • HoneyBear
      </div>
    </div>
  );
}
