import { useState, useEffect } from 'react';
import { invoke } from '@tauri-apps/api/core';

export default function AccountDetails({ account, onUpdate }) {
  const [transactions, setTransactions] = useState([]);
  const [isAdding, setIsAdding] = useState(false);
  
  // Form state
  const [date, setDate] = useState(new Date().toISOString().split('T')[0]);
  const [payee, setPayee] = useState('');
  const [category, setCategory] = useState('');
  const [notes, setNotes] = useState('');
  const [amount, setAmount] = useState('');

  useEffect(() => {
    if (account) {
      fetchTransactions();
    }
  }, [account]);

  async function fetchTransactions() {
    try {
      const txs = await invoke('get_transactions', { accountId: account.id });
      setTransactions(txs);
    } catch (e) {
      console.error("Failed to fetch transactions:", e);
    }
  }

  async function handleAddTransaction(e) {
    e.preventDefault();
    try {
      await invoke('create_transaction', {
        accountId: account.id,
        date,
        payee,
        category: category || null,
        notes: notes || null,
        amount: parseFloat(amount) || 0.0
      });
      
      // Reset form
      setPayee('');
      setCategory('');
      setNotes('');
      setAmount('');
      setIsAdding(false);
      
      // Refresh data
      fetchTransactions();
      if (onUpdate) onUpdate(); // Notify parent to refresh account balance
    } catch (e) {
      console.error("Failed to create transaction:", e);
    }
  }

  return (
    <div>
      <header className="mb-8 border-b border-gray-200 pb-4 flex justify-between items-end">
        <div>
          <h1 className="text-3xl font-bold text-gray-800">{account.name}</h1>
          <p className="text-xl text-gray-600 mt-2">
            Balance: <span className={`font-semibold ${account.balance >= 0 ? 'text-green-600' : 'text-red-600'}`}>
              ${account.balance.toFixed(2)}
            </span>
          </p>
        </div>
        <button 
          onClick={() => setIsAdding(!isAdding)}
          className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded shadow transition-colors"
        >
          {isAdding ? 'Cancel' : 'Add Transaction'}
        </button>
      </header>

      {isAdding && (
        <div className="bg-gray-50 p-4 rounded-lg border border-gray-200 mb-6 shadow-sm">
          <h3 className="text-lg font-semibold mb-4 text-gray-700">New Transaction</h3>
          <form onSubmit={handleAddTransaction} className="flex flex-wrap items-end gap-3">
            <div className="w-36">
              <label className="block text-xs font-medium text-gray-700 mb-1">Date</label>
              <input 
                type="date" 
                required
                className="w-full p-2 text-sm border border-gray-300 rounded focus:ring-blue-500 focus:border-blue-500"
                value={date}
                onChange={e => setDate(e.target.value)}
              />
            </div>
            <div className="flex-1 min-w-[140px]">
              <label className="block text-xs font-medium text-gray-700 mb-1">Payee</label>
              <input 
                type="text" 
                required
                placeholder="Payee"
                className="w-full p-2 text-sm border border-gray-300 rounded focus:ring-blue-500 focus:border-blue-500"
                value={payee}
                onChange={e => setPayee(e.target.value)}
              />
            </div>
            <div className="w-40">
              <label className="block text-xs font-medium text-gray-700 mb-1">Category</label>
              <input 
                type="text" 
                placeholder="Category"
                className="w-full p-2 text-sm border border-gray-300 rounded focus:ring-blue-500 focus:border-blue-500"
                value={category}
                onChange={e => setCategory(e.target.value)}
              />
            </div>
            <div className="flex-1 min-w-[140px]">
              <label className="block text-xs font-medium text-gray-700 mb-1">Notes</label>
              <input 
                type="text" 
                placeholder="Notes"
                className="w-full p-2 text-sm border border-gray-300 rounded focus:ring-blue-500 focus:border-blue-500"
                value={notes}
                onChange={e => setNotes(e.target.value)}
              />
            </div>
            <div className="w-32">
              <label className="block text-xs font-medium text-gray-700 mb-1">Amount</label>
              <input 
                type="number" 
                required
                step="0.01"
                placeholder="0.00"
                className="w-full p-2 text-sm border border-gray-300 rounded focus:ring-blue-500 focus:border-blue-500"
                value={amount}
                onChange={e => setAmount(e.target.value)}
              />
            </div>
            <div>
              <button 
                type="submit" 
                className="bg-green-600 hover:bg-green-700 text-white px-4 py-2 text-sm rounded shadow transition-colors h-[38px]"
              >
                Save
              </button>
            </div>
          </form>
        </div>
      )}
      
      <div className="bg-white rounded-lg shadow overflow-hidden">
        <table className="min-w-full divide-y divide-gray-200">
          <thead className="bg-gray-50">
            <tr>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Date</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Payee</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Category</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Notes</th>
              <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">Amount</th>
            </tr>
          </thead>
          <tbody className="bg-white divide-y divide-gray-200">
            {transactions.length === 0 ? (
              <tr>
                <td colSpan="5" className="px-6 py-10 text-center text-gray-500 italic">
                  No transactions found. Add one to get started!
                </td>
              </tr>
            ) : (
              transactions.map((tx) => (
                <tr key={tx.id} className="hover:bg-gray-50">
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">{tx.date}</td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">{tx.payee}</td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                    {tx.category ? (
                      <span className="px-2 inline-flex text-xs leading-5 font-semibold rounded-full bg-blue-100 text-blue-800">
                        {tx.category}
                      </span>
                    ) : '-'}
                  </td>
                  <td className="px-6 py-4 text-sm text-gray-500 max-w-xs truncate">{tx.notes || '-'}</td>
                  <td className={`px-6 py-4 whitespace-nowrap text-sm text-right font-medium ${tx.amount >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                    {tx.amount >= 0 ? '+' : ''}{tx.amount.toFixed(2)}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
