import { useState, useEffect } from 'react';
import { invoke } from '@tauri-apps/api/core';

export default function AccountDetails({ account, onUpdate }) {
  const [transactions, setTransactions] = useState([]);
  const [isAdding, setIsAdding] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  
  // Editing state
  const [editingId, setEditingId] = useState(null);
  const [editForm, setEditForm] = useState({});
  const [menuOpenId, setMenuOpenId] = useState(null);

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

  // Close menu when clicking outside
  useEffect(() => {
    function handleClickOutside(event) {
      if (menuOpenId && !event.target.closest('.action-menu-container')) {
        setMenuOpenId(null);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [menuOpenId]);

  async function fetchTransactions() {
    try {
      let txs;
      if (account.id === 'all') {
        txs = await invoke('get_all_transactions');
      } else {
        txs = await invoke('get_transactions', { accountId: account.id });
      }
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
      if (onUpdate) onUpdate(); 
    } catch (e) {
      console.error("Failed to create transaction:", e);
    }
  }

  function startEditing(tx) {
    setEditingId(tx.id);
    setEditForm({ ...tx });
    setMenuOpenId(null);
  }

  async function saveEdit() {
    try {
      await invoke('update_transaction', {
        id: editForm.id,
        accountId: editForm.account_id,
        date: editForm.date,
        payee: editForm.payee,
        category: editForm.category || null,
        notes: editForm.notes || null,
        amount: parseFloat(editForm.amount) || 0.0
      });
      setEditingId(null);
      fetchTransactions();
      if (onUpdate) onUpdate();
    } catch (e) {
      console.error("Failed to update transaction:", e);
    }
  }

  async function deleteTransaction(id) {
    if (!confirm("Are you sure you want to delete this transaction?")) return;
    try {
      await invoke('delete_transaction', { id });
      setMenuOpenId(null);
      fetchTransactions();
      if (onUpdate) onUpdate();
    } catch (e) {
      console.error("Failed to delete transaction:", e);
    }
  }

  async function duplicateTransaction(tx) {
    try {
      await invoke('create_transaction', {
        accountId: tx.account_id,
        date: tx.date,
        payee: tx.payee,
        category: tx.category,
        notes: tx.notes,
        amount: tx.amount
      });
      setMenuOpenId(null);
      fetchTransactions();
      if (onUpdate) onUpdate();
    } catch (e) {
      console.error("Failed to duplicate transaction:", e);
    }
  }

  const filteredTransactions = transactions.filter(tx => {
    if (!searchQuery) return true;
    const query = searchQuery.toLowerCase();
    return (
      tx.date.toLowerCase().includes(query) ||
      tx.payee.toLowerCase().includes(query) ||
      (tx.category && tx.category.toLowerCase().includes(query)) ||
      (tx.notes && tx.notes.toLowerCase().includes(query)) ||
      tx.amount.toString().includes(query)
    );
  });

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
        <div className="flex gap-3">
          <input 
            type="text" 
            placeholder="Search..." 
            className="px-3 py-2 border border-gray-300 rounded shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-sm w-64"
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
          />
          <button 
            onClick={() => setIsAdding(!isAdding)}
            className={`bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded shadow transition-colors ${account.id === 'all' ? 'hidden' : ''}`}
          >
            {isAdding ? 'Cancel' : 'Add Transaction'}
          </button>
        </div>
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
      
      <div className="bg-white rounded-lg shadow overflow-visible pb-20">
        <table className="min-w-full divide-y divide-gray-200">
          <thead className="bg-gray-50">
            <tr>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider w-32">Date</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Payee</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider w-40">Category</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Notes</th>
              <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider w-32">Amount</th>
              <th className="w-10"></th>
            </tr>
          </thead>
          <tbody className="bg-white divide-y divide-gray-200">
            {filteredTransactions.length === 0 ? (
              <tr>
                <td colSpan="6" className="px-6 py-10 text-center text-gray-500 italic">
                  {searchQuery ? 'No transactions match your search.' : 'No transactions found. Add one to get started!'}
                </td>
              </tr>
            ) : (
              filteredTransactions.map((tx) => (
                <tr key={tx.id} className="hover:bg-blue-50 group relative">
                  {editingId === tx.id ? (
                    <>
                      <td className="px-2 py-2">
                        <input 
                          type="date" 
                          className="w-full p-1 text-sm border rounded"
                          value={editForm.date}
                          onChange={e => setEditForm({...editForm, date: e.target.value})}
                        />
                      </td>
                      <td className="px-2 py-2">
                        <input 
                          type="text" 
                          className="w-full p-1 text-sm border rounded"
                          value={editForm.payee}
                          onChange={e => setEditForm({...editForm, payee: e.target.value})}
                        />
                      </td>
                      <td className="px-2 py-2">
                        <input 
                          type="text" 
                          className="w-full p-1 text-sm border rounded"
                          value={editForm.category || ''}
                          onChange={e => setEditForm({...editForm, category: e.target.value})}
                        />
                      </td>
                      <td className="px-2 py-2">
                        <input 
                          type="text" 
                          className="w-full p-1 text-sm border rounded"
                          value={editForm.notes || ''}
                          onChange={e => setEditForm({...editForm, notes: e.target.value})}
                        />
                      </td>
                      <td className="px-2 py-2">
                        <input 
                          type="number" 
                          step="0.01"
                          className="w-full p-1 text-sm border rounded text-right"
                          value={editForm.amount}
                          onChange={e => setEditForm({...editForm, amount: e.target.value})}
                        />
                      </td>
                      <td className="px-2 py-2 text-center">
                        <button onClick={saveEdit} className="text-green-600 hover:text-green-800 mr-1">✓</button>
                        <button onClick={() => setEditingId(null)} className="text-red-600 hover:text-red-800">✕</button>
                      </td>
                    </>
                  ) : (
                    <>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900 cursor-pointer" onClick={() => startEditing(tx)}>{tx.date}</td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900 cursor-pointer" onClick={() => startEditing(tx)}>{tx.payee}</td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500 cursor-pointer" onClick={() => startEditing(tx)}>
                        {tx.category ? (
                          <span className="px-2 inline-flex text-xs leading-5 font-semibold rounded-full bg-blue-100 text-blue-800">
                            {tx.category}
                          </span>
                        ) : '-'}
                      </td>
                      <td className="px-6 py-4 text-sm text-gray-500 max-w-xs truncate cursor-pointer" onClick={() => startEditing(tx)}>{tx.notes || '-'}</td>
                      <td className={`px-6 py-4 whitespace-nowrap text-sm text-right font-medium cursor-pointer ${tx.amount >= 0 ? 'text-green-600' : 'text-red-600'}`} onClick={() => startEditing(tx)}>
                        {tx.amount >= 0 ? '+' : ''}{tx.amount.toFixed(2)}
                      </td>
                      <td className="px-2 py-4 whitespace-nowrap text-right text-sm font-medium relative action-menu-container">
                        <button 
                          onClick={(e) => {
                            e.stopPropagation();
                            setMenuOpenId(menuOpenId === tx.id ? null : tx.id);
                          }}
                          className={`text-gray-400 hover:text-gray-600 font-bold text-xl px-2 rounded hover:bg-gray-200 ${menuOpenId === tx.id ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'} transition-opacity`}
                        >
                          ⋮
                        </button>
                        
                        {menuOpenId === tx.id && (
                          <div className="absolute right-8 top-8 w-32 bg-white rounded-md shadow-lg z-10 border border-gray-200 py-1">
                            <button 
                              onClick={() => duplicateTransaction(tx)}
                              className="block w-full text-left px-4 py-2 text-sm text-gray-700 hover:bg-gray-100"
                            >
                              Duplicate
                            </button>
                            <button 
                              onClick={() => deleteTransaction(tx.id)}
                              className="block w-full text-left px-4 py-2 text-sm text-red-600 hover:bg-gray-100"
                            >
                              Delete
                            </button>
                          </div>
                        )}
                      </td>
                    </>
                  )}
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
