import { useState, useEffect } from 'react';
import { invoke } from '@tauri-apps/api/core';

export default function Sidebar({ onSelectAccount, refreshTrigger }) {
  const [accounts, setAccounts] = useState([]);
  const [isAdding, setIsAdding] = useState(false);
  const [newAccountName, setNewAccountName] = useState('');
  const [newAccountBalance, setNewAccountBalance] = useState('');

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

  return (
    <div className="w-64 bg-gray-900 text-white h-screen flex flex-col p-4 border-r border-gray-800">
      <h1 className="text-xl font-bold mb-2 text-blue-400">HoneyBear Folio</h1>
      <div className="mb-6">
        <div className="text-xs text-gray-500 uppercase tracking-wider font-semibold">Net Worth</div>
        <div className="text-2xl font-bold text-white">${totalBalance.toFixed(2)}</div>
      </div>
      
      <div className="flex-1 overflow-y-auto">
        <button 
          onClick={() => onSelectAccount({ id: 'all', name: 'All Accounts', balance: totalBalance })}
          className="w-full text-left py-2 px-3 rounded hover:bg-gray-800 transition-colors flex justify-between items-center group mb-4 bg-gray-800/50"
        >
          <span className="font-medium">All Accounts</span>
        </button>

        <h2 className="text-gray-400 uppercase text-xs font-semibold mb-2 tracking-wider">Accounts</h2>
        <ul className="space-y-1">
          {accounts.map(account => (
            <li key={account.id}>
              <button 
                onClick={() => onSelectAccount(account)}
                className="w-full text-left py-2 px-3 rounded hover:bg-gray-800 transition-colors flex justify-between items-center group"
              >
                <span className="font-medium">{account.name}</span>
                <span className="text-gray-400 text-sm group-hover:text-white transition-colors">
                  ${account.balance.toFixed(2)}
                </span>
              </button>
            </li>
          ))}
        </ul>
      </div>

      {isAdding ? (
        <form onSubmit={handleAddAccount} className="mt-4 bg-gray-800 p-3 rounded shadow-lg border border-gray-700">
          <input 
            type="text" 
            placeholder="Account Name" 
            className="w-full mb-2 p-2 text-sm text-white bg-gray-700 border border-gray-600 rounded focus:outline-none focus:border-blue-500"
            value={newAccountName}
            onChange={e => setNewAccountName(e.target.value)}
            required
            autoFocus
          />
          <input 
            type="number" 
            placeholder="Initial Balance" 
            className="w-full mb-3 p-2 text-sm text-white bg-gray-700 border border-gray-600 rounded focus:outline-none focus:border-blue-500"
            value={newAccountBalance}
            onChange={e => setNewAccountBalance(e.target.value)}
            step="0.01"
          />
          <div className="flex justify-end gap-2">
            <button 
              type="button" 
              onClick={() => setIsAdding(false)} 
              className="px-3 py-1 text-xs text-gray-300 hover:text-white transition-colors"
            >
              Cancel
            </button>
            <button 
              type="submit" 
              className="px-3 py-1 text-xs bg-blue-600 hover:bg-blue-500 text-white rounded transition-colors"
            >
              Save
            </button>
          </div>
        </form>
      ) : (
        <button 
          onClick={() => setIsAdding(true)}
          className="mt-4 w-full py-2 bg-gray-800 hover:bg-gray-700 text-gray-300 hover:text-white rounded transition-colors flex items-center justify-center gap-2 border border-gray-700 border-dashed"
        >
          <span>+ Add Account</span>
        </button>
      )}
    </div>
  );
}
