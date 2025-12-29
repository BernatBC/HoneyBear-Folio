import { useState, useEffect, useMemo } from "react";
import PropTypes from "prop-types";
import DatePicker from "react-datepicker";
import "react-datepicker/dist/react-datepicker.css";
import "../styles/datepicker.css";
import { invoke } from "@tauri-apps/api/core";
import { ask } from "@tauri-apps/plugin-dialog";
import {
  Search,
  Plus,
  MoreVertical,
  Copy,
  Trash2,
  Check,
  X,
  Calendar,
  Tag,
  FileText,
  Euro,
  ArrowRightLeft,
  User,
  Edit,
} from "lucide-react";

export default function AccountDetails({ account, onUpdate }) {
  const [transactions, setTransactions] = useState([]);
  const [isAdding, setIsAdding] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [payeeSuggestions, setPayeeSuggestions] = useState([]);
  const [categorySuggestions, setCategorySuggestions] = useState([]);
  const [availableAccounts, setAvailableAccounts] = useState([]);
  const [tickerSuggestions, setTickerSuggestions] = useState([]);
  const [showTickerSuggestions, setShowTickerSuggestions] = useState(false);

  // Editing state
  const [editingId, setEditingId] = useState(null);
  const [editForm, setEditForm] = useState({});
  const [menuOpenId, setMenuOpenId] = useState(null);

  // Account actions state
  const [isRenamingAccount, setIsRenamingAccount] = useState(false);
  const [renameValue, setRenameValue] = useState(account.name);
  const [accountMenuOpen, setAccountMenuOpen] = useState(false);

  useEffect(() => {
    setRenameValue(account.name);
  }, [account.name]);

  // Close account menu when clicking outside
  useEffect(() => {
    function handleClickOutside(event) {
      if (accountMenuOpen && !event.target.closest(".account-action-menu")) {
        setAccountMenuOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [accountMenuOpen]);

  // Form state
  const [date, setDate] = useState(new Date().toISOString().split("T")[0]);
  const [payee, setPayee] = useState("");
  const [category, setCategory] = useState("");
  const [notes, setNotes] = useState("");
  const [amount, setAmount] = useState("");

  // Brokerage Form State
  const [ticker, setTicker] = useState("");
  const [shares, setShares] = useState("");
  const [pricePerShare, setPricePerShare] = useState("");
  const [totalPrice, setTotalPrice] = useState("");
  const [fee, setFee] = useState("");
  const [cashAccountId, setCashAccountId] = useState("");
  const [isBuy, setIsBuy] = useState(true);

  async function fetchSuggestions() {
    try {
      const [payees, accountsList, categories] = await Promise.all([
        invoke("get_payees"),
        invoke("get_accounts"),
        invoke("get_categories"),
      ]);

      // Filter out current account from accounts list
      const otherAccounts = accountsList
        .filter((a) => a.id !== account.id)
        .map((a) => ({ name: a.name, id: a.id, kind: a.kind }));

      setAvailableAccounts(otherAccounts);

      const accountOptions = otherAccounts.map((acc) => ({
        value: acc.name,
        label: "Account",
        type: "account",
      }));
      const payeeOptions = payees.map((name) => ({
        value: name,
        label: "Payee",
        type: "payee",
      }));

      const combined = [...accountOptions, ...payeeOptions].sort((a, b) =>
        a.value.localeCompare(b.value),
      );

      const unique = [];
      const seen = new Set();
      for (const item of combined) {
        if (!seen.has(item.value)) {
          seen.add(item.value);
          unique.push(item);
        } else if (item.type === "account") {
          const index = unique.findIndex((u) => u.value === item.value);
          if (index !== -1) unique[index] = item;
        }
      }

      setPayeeSuggestions(unique);
      setCategorySuggestions(categories);

      // Set default cash account if available
      const cashAcc = otherAccounts.find((a) => a.kind === "cash");
      if (cashAcc) setCashAccountId(cashAcc.id);
    } catch (e) {
      console.error("Failed to fetch suggestions:", e);
    }
  }

  async function fetchTransactions() {
    try {
      let txs;
      if (account.id === "all") {
        txs = await invoke("get_all_transactions");
      } else {
        txs = await invoke("get_transactions", { accountId: account.id });
      }
      setTransactions(txs);
    } catch (e) {
      console.error("Failed to fetch transactions:", e);
    }
  }

  useEffect(() => {
    if (account) {
      fetchTransactions();
      fetchSuggestions();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [account.id]);

  // Close menu when clicking outside
  useEffect(() => {
    function handleClickOutside(event) {
      if (menuOpenId && !event.target.closest(".action-menu-container")) {
        setMenuOpenId(null);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [menuOpenId]);

  // Auto-set category to Transfer if payee is an account
  useEffect(() => {
    if (availableAccounts.includes(payee)) {
      setCategory("Transfer");
    }
  }, [payee, availableAccounts]);

  useEffect(() => {
    if (editForm.payee && availableAccounts.includes(editForm.payee)) {
      setEditForm((prev) => ({ ...prev, category: "Transfer" }));
    }
  }, [editForm.payee, availableAccounts]);

  useEffect(() => {
    const fetchTickerSuggestions = async () => {
      if (!ticker || ticker.length < 2) {
        setTickerSuggestions([]);
        return;
      }

      try {
        const suggestions = await invoke("search_ticker", { query: ticker });
        setTickerSuggestions(suggestions);
        setShowTickerSuggestions(true);
      } catch (error) {
        console.error("Error fetching ticker suggestions:", error);
      }
    };

    const timeoutId = setTimeout(fetchTickerSuggestions, 300);
    return () => clearTimeout(timeoutId);
  }, [ticker]);

  // Auto-calculate total price or price per share
  const handleSharesChange = (e) => {
    const newShares = e.target.value;
    setShares(newShares);
    if (newShares && pricePerShare) {
      setTotalPrice(
        (parseFloat(newShares) * parseFloat(pricePerShare)).toFixed(2),
      );
    }
  };

  const handlePricePerShareChange = (e) => {
    const newPrice = e.target.value;
    setPricePerShare(newPrice);
    if (shares && newPrice) {
      setTotalPrice((parseFloat(shares) * parseFloat(newPrice)).toFixed(2));
    }
  };

  const handleTotalPriceChange = (e) => {
    const newTotal = e.target.value;
    setTotalPrice(newTotal);
    if (shares && newTotal) {
      setPricePerShare((parseFloat(newTotal) / parseFloat(shares)).toFixed(4));
    }
  };

  async function handleRenameAccount(e) {
    e.preventDefault();
    if (!renameValue.trim()) return;
    try {
      await invoke("rename_account", { id: account.id, newName: renameValue });
      setIsRenamingAccount(false);
      setAccountMenuOpen(false);
      if (onUpdate) onUpdate();
    } catch (e) {
      console.error("Failed to rename account:", e);
    }
  }

  async function handleDeleteAccount() {
    const confirmed = await ask(
      `Are you sure you want to delete "${account.name}" and ALL its transactions? This action cannot be undone.`,
      {
        title: "Confirm Deletion",
        kind: "warning",
        okLabel: "Delete",
        cancelLabel: "Cancel",
      },
    );

    if (!confirmed) return;

    try {
      await invoke("delete_account", { id: account.id });
      if (onUpdate) onUpdate();
    } catch (e) {
      console.error("Failed to delete account:", e);
    }
  }

  async function handleAddTransaction(e) {
    e.preventDefault();
    try {
      if (account.kind === "brokerage") {
        await invoke("create_brokerage_transaction", {
          args: {
            brokerageAccountId: account.id,
            cashAccountId: parseInt(cashAccountId),
            date,
            ticker,
            shares: parseFloat(shares),
            pricePerShare: parseFloat(pricePerShare),
            fee: parseFloat(fee) || 0.0,
            isBuy,
          },
        });

        setTicker("");
        setShares("");
        setPricePerShare("");
        setTotalPrice("");
        setFee("");
      } else {
        await invoke("create_transaction", {
          accountId: account.id,
          date,
          payee,
          category: category || null,
          notes: notes || null,
          amount: parseFloat(amount) || 0.0,
        });

        setPayee("");
        setCategory("");
        setNotes("");
        setAmount("");
      }

      setIsAdding(false);

      fetchTransactions();
      fetchSuggestions();
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
      await invoke("update_transaction", {
        args: {
          id: editForm.id,
          accountId: editForm.account_id,
          date: editForm.date,
          payee: editForm.payee,
          category: editForm.category || null,
          notes: editForm.notes || null,
          amount: parseFloat(editForm.amount) || 0.0,
        },
      });
      setEditingId(null);
      fetchTransactions();
      if (onUpdate) onUpdate();
    } catch (e) {
      console.error("Failed to update transaction:", e);
    }
  }

  async function deleteTransaction(id) {
    const confirmed = await ask(
      "Are you sure you want to delete this transaction?",
      {
        title: "Transaction",
        kind: "warning",
        okLabel: "Delete",
        cancelLabel: "Cancel",
      }
    );
    if (!confirmed) return;
    try {
      await invoke("delete_transaction", { id });
      setMenuOpenId(null);
      fetchTransactions();
      if (onUpdate) onUpdate();
    } catch (e) {
      console.error("Failed to delete transaction:", e);
    }
  }

  async function duplicateTransaction(tx) {
    try {
      await invoke("create_transaction", {
        accountId: tx.account_id,
        date: tx.date,
        payee: tx.payee,
        category: tx.category,
        notes: tx.notes,
        amount: tx.amount,
      });
      setMenuOpenId(null);
      fetchTransactions();
      if (onUpdate) onUpdate();
    } catch (e) {
      console.error("Failed to duplicate transaction:", e);
    }
  }

  const filteredTransactions = transactions.filter((tx) => {
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
    <div className="max-w-6xl mx-auto pb-8">
      {/* Header */}
      <header className="mb-8 flex flex-col md:flex-row md:items-end justify-between gap-4 bg-gradient-to-br from-white to-slate-50 p-6 rounded-2xl shadow-md border border-slate-200 hover:shadow-lg transition-all duration-300">
        <div>
          {isRenamingAccount ? (
            <form
              onSubmit={handleRenameAccount}
              className="flex items-center gap-2"
            >
              <input
                type="text"
                value={renameValue}
                onChange={(e) => setRenameValue(e.target.value)}
                className="text-3xl font-bold text-slate-900 tracking-tight bg-transparent border-b-2 border-brand-500 focus:outline-none min-w-[200px]"
                autoFocus
                onKeyDown={(e) => {
                  if (e.key === "Escape") {
                    setIsRenamingAccount(false);
                    setRenameValue(account.name);
                  }
                }}
              />
              <div className="flex gap-1">
                <button
                  type="submit"
                  className="p-1 rounded-full bg-emerald-100 text-emerald-600 hover:bg-emerald-200 transition-colors"
                  title="Save Name"
                >
                  <Check className="w-5 h-5" />
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setIsRenamingAccount(false);
                    setRenameValue(account.name);
                  }}
                  className="p-1 rounded-full bg-slate-100 text-slate-500 hover:bg-slate-200 hover:text-rose-500 transition-colors"
                  title="Cancel"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
            </form>
          ) : (
            <h1 className="text-3xl font-bold text-slate-900 tracking-tight flex items-center gap-3">
              {account.name}
            </h1>
          )}
          <div className="flex items-baseline gap-2 mt-2">
            <span className="text-sm font-semibold text-slate-500 uppercase tracking-wider">
              Balance:
            </span>
            <span
              className={`text-3xl font-bold tracking-tight ${account.balance >= 0 ? "text-emerald-600" : "text-rose-600"
                }`}
            >
              {account.balance >= 0 ? "+" : ""}
              {account.balance.toLocaleString("en-US", {
                minimumFractionDigits: 2,
                maximumFractionDigits: 2,
              })}{" "}
              €
            </span>
          </div>
        </div>

        <div className="flex gap-3 w-full md:w-auto">
          <div className="relative flex-1 md:w-64">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400" />
            <input
              type="text"
              placeholder="Search transactions..."
              className="w-full pl-10 pr-4 py-3 bg-white border-2 border-slate-200 rounded-xl shadow-sm focus:outline-none focus:ring-2 focus:ring-brand-500 focus:border-brand-500 text-sm transition-all hover:border-slate-300"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
          </div>
          {account.id !== "all" &&
            (!isAdding ? (
              <button
                onClick={() => setIsAdding(true)}
                style={{
                  backgroundColor: "#2563eb",
                  color: "#ffffff",
                  display: "flex",
                  alignItems: "center",
                  gap: "0.5rem",
                  padding: "0.75rem 1.25rem",
                  borderRadius: "0.75rem",
                  fontWeight: "600",
                  fontSize: "0.875rem",
                  border: "none",
                  cursor: "pointer",
                  boxShadow: "0 4px 6px -1px rgb(0 0 0 / 0.1)",
                }}
                onMouseEnter={(e) =>
                  (e.currentTarget.style.backgroundColor = "#1d4ed8")
                }
                onMouseLeave={(e) =>
                  (e.currentTarget.style.backgroundColor = "#2563eb")
                }
              >
                <Plus className="w-5 h-5" style={{ color: "#ffffff" }} />
                <span style={{ color: "#ffffff" }}>Add Transaction</span>
              </button>
            ) : (
              <button
                onClick={() => setIsAdding(false)}
                style={{
                  backgroundColor: "#f1f5f9",
                  color: "#334155",
                  display: "flex",
                  alignItems: "center",
                  gap: "0.5rem",
                  padding: "0.75rem 1.25rem",
                  borderRadius: "0.75rem",
                  fontWeight: "600",
                  fontSize: "0.875rem",
                  border: "none",
                  cursor: "pointer",
                  boxShadow: "0 4px 6px -1px rgb(0 0 0 / 0.1)",
                }}
                onMouseEnter={(e) =>
                  (e.currentTarget.style.backgroundColor = "#e2e8f0")
                }
                onMouseLeave={(e) =>
                  (e.currentTarget.style.backgroundColor = "#f1f5f9")
                }
              >
                <X className="w-5 h-5" style={{ color: "#334155" }} />
                <span style={{ color: "#334155" }}>Cancel</span>
              </button>
            ))}

          <div className="relative account-action-menu">
            <button
              onClick={() => setAccountMenuOpen(!accountMenuOpen)}
              className="p-3 bg-white border-2 border-slate-200 rounded-xl shadow-sm hover:border-slate-300 transition-all text-slate-600 hover:text-slate-900"
            >
              <MoreVertical className="w-5 h-5" />
            </button>
            {accountMenuOpen && (
              <div className="absolute right-0 mt-2 w-48 bg-white rounded-xl shadow-xl border border-slate-100 py-1 z-50 animate-in fade-in zoom-in-95 duration-200">
                <button
                  onClick={() => {
                    setIsRenamingAccount(true);
                    setAccountMenuOpen(false);
                    // Slight timeout to ensure input renders before focus
                    setTimeout(() => {
                      const escapedName =
                        typeof CSS !== "undefined" && typeof CSS.escape === "function"
                          ? CSS.escape(account.name)
                          : account.name.replace(/"/g, '\\"');
                      const input = document.querySelector(
                        'input[value="' + escapedName + '"]',
                      );
                      if (input) input.focus();
                    }, 50);
                  }}
                  className="w-full text-left px-4 py-2.5 text-sm font-medium text-slate-700 hover:bg-slate-50 flex items-center gap-2"
                >
                  <Edit className="w-4 h-4 text-slate-400" />
                  Rename Account
                </button>
                <div className="h-px bg-slate-100 my-1" />
                <button
                  onClick={handleDeleteAccount}
                  className="w-full text-left px-4 py-2.5 text-sm font-medium text-rose-600 hover:bg-rose-50 flex items-center gap-2"
                >
                  <Trash2 className="w-4 h-4" />
                  Delete Account
                </button>
              </div>
            )}
          </div>
        </div>
      </header>

      {/* Add Transaction Form */}
      {isAdding && (
        <div className="bg-gradient-to-br from-white to-slate-50 p-6 rounded-2xl border-2 border-brand-200 shadow-xl mb-8 animate-slide-in">
          <h3 className="text-lg font-bold mb-6 text-slate-900 flex items-center gap-3">
            <div className="bg-brand-100 p-2.5 rounded-xl">
              <Plus className="w-5 h-5 text-brand-600" />
            </div>
            New Transaction
          </h3>

          {account.kind === "brokerage" ? (
            <form
              onSubmit={handleAddTransaction}
              className="grid grid-cols-1 md:grid-cols-12 gap-4 items-end"
            >
              <div className="md:col-span-12 mb-2 flex gap-4">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="radio"
                    name="txType"
                    checked={isBuy}
                    onChange={() => setIsBuy(true)}
                    className="w-4 h-4 text-blue-600"
                  />
                  <span className="text-sm font-medium text-slate-700">
                    Buy
                  </span>
                </label>
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="radio"
                    name="txType"
                    checked={!isBuy}
                    onChange={() => setIsBuy(false)}
                    className="w-4 h-4 text-blue-600"
                  />
                  <span className="text-sm font-medium text-slate-700">
                    Sell
                  </span>
                </label>
              </div>

              <div className="md:col-span-2">
                <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1.5">
                  Date
                </label>
                <div className="relative">
                  <Calendar className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 pointer-events-none z-10" />
                  <DatePicker
                    selected={date ? new Date(date) : null}
                    onChange={(date) =>
                      setDate(date ? date.toISOString().split("T")[0] : "")
                    }
                    dateFormat="yyyy-MM-dd"
                    shouldCloseOnSelect={false}
                    required
                    className="w-full pl-9 pr-3 py-2 text-sm border border-slate-200 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none transition-all"
                  />
                </div>
              </div>

              <div className="md:col-span-3">
                <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1.5">
                  Cash Account
                </label>
                <select
                  required
                  className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none transition-all bg-white"
                  value={cashAccountId}
                  onChange={(e) => setCashAccountId(e.target.value)}
                >
                  <option value="">Select Account</option>
                  {availableAccounts
                    .filter((a) => a.kind === "cash")
                    .map((acc) => (
                      <option key={acc.id} value={acc.id}>
                        {acc.name}
                      </option>
                    ))}
                </select>
              </div>

              <div className="md:col-span-2 relative">
                <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1.5">
                  Ticker
                </label>
                <input
                  type="text"
                  required
                  placeholder="AAPL"
                  className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none transition-all uppercase"
                  value={ticker}
                  onChange={(e) => {
                    setTicker(e.target.value.toUpperCase());
                    setShowTickerSuggestions(true);
                  }}
                  onBlur={() =>
                    setTimeout(() => setShowTickerSuggestions(false), 200)
                  }
                  onFocus={() =>
                    ticker.length >= 2 && setShowTickerSuggestions(true)
                  }
                />
                {showTickerSuggestions && tickerSuggestions.length > 0 && (
                  <div className="absolute z-50 w-full bg-white rounded-lg shadow-lg border border-slate-200 mt-1 max-h-60 overflow-y-auto">
                    {tickerSuggestions.map((suggestion, index) => (
                      <div
                        key={index}
                        className="px-4 py-2 hover:bg-slate-50 cursor-pointer text-sm"
                        onClick={() => {
                          setTicker(suggestion.symbol);
                          setShowTickerSuggestions(false);
                        }}
                      >
                        <div className="font-medium text-slate-900">
                          {suggestion.symbol}
                        </div>
                        <div className="text-xs text-slate-500 truncate">
                          {suggestion.shortname || suggestion.longname}
                        </div>
                        <div className="text-xs text-slate-400">
                          {suggestion.exchange} - {suggestion.typeDisp}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              <div className="md:col-span-2">
                <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1.5">
                  Shares
                </label>
                <input
                  type="number"
                  required
                  step="any"
                  placeholder="0"
                  className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none transition-all"
                  value={shares}
                  onChange={handleSharesChange}
                />
              </div>

              <div className="md:col-span-3">
                <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1.5">
                  Price / Share
                </label>
                <div className="relative">
                  <Euro className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                  <input
                    type="number"
                    required
                    step="any"
                    placeholder="0.00"
                    className="w-full pl-3 pr-9 py-2 text-sm border border-slate-200 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none transition-all"
                    value={pricePerShare}
                    onChange={handlePricePerShareChange}
                  />
                </div>
              </div>

              <div className="md:col-span-3">
                <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1.5">
                  Total Price
                </label>
                <div className="relative">
                  <Euro className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                  <input
                    type="number"
                    required
                    step="0.01"
                    placeholder="0.00"
                    className="w-full pl-3 pr-9 py-2 text-sm border border-slate-200 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none transition-all"
                    value={totalPrice}
                    onChange={handleTotalPriceChange}
                  />
                </div>
              </div>

              <div className="md:col-span-3">
                <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1.5">
                  Fee
                </label>
                <div className="relative">
                  <Euro className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                  <input
                    type="number"
                    step="0.01"
                    placeholder="0.00"
                    className="w-full pl-3 pr-9 py-2 text-sm border border-slate-200 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none transition-all"
                    value={fee}
                    onChange={(e) => setFee(e.target.value)}
                  />
                </div>
              </div>

              <div className="md:col-span-6 flex justify-end mt-2">
                <button
                  type="submit"
                  className="bg-emerald-600 hover:bg-emerald-700 text-white px-6 py-2 text-sm font-medium rounded-lg shadow-sm hover:shadow transition-all flex items-center gap-2"
                >
                  <Check className="w-4 h-4" />
                  Save Transaction
                </button>
              </div>
            </form>
          ) : (
            <form
              onSubmit={handleAddTransaction}
              className="grid grid-cols-1 md:grid-cols-12 gap-4 items-end"
            >
              <div className="md:col-span-2">
                <label className="block text-xs font-bold text-slate-600 uppercase tracking-wider mb-2">
                  Date
                </label>
                <div className="relative">
                  <Calendar className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 pointer-events-none z-10" />
                  <DatePicker
                    selected={date ? new Date(date) : null}
                    onChange={(date) =>
                      setDate(date ? date.toISOString().split("T")[0] : "")
                    }
                    dateFormat="yyyy-MM-dd"
                    shouldCloseOnSelect={false}
                    required
                    className="w-full pl-10 pr-3 py-2.5 text-sm border-2 border-slate-200 rounded-xl focus:ring-2 focus:ring-brand-500 focus:border-brand-500 outline-none transition-all hover:border-slate-300"
                  />
                </div>
              </div>

              <div className="md:col-span-3">
                <label className="block text-xs font-bold text-slate-600 uppercase tracking-wider mb-2">
                  Payee
                </label>
                <div className="relative">
                  <User className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 z-10" />
                  <AutocompleteInput
                    suggestions={payeeSuggestions}
                    placeholder="Who got paid?"
                    className="w-full pl-10 pr-3 py-2.5 text-sm border-2 border-slate-200 rounded-xl focus:ring-2 focus:ring-brand-500 focus:border-brand-500 outline-none transition-all hover:border-slate-300"
                    value={payee}
                    onChange={setPayee}
                  />
                </div>
              </div>

              <div className="md:col-span-2">
                <label className="block text-xs font-bold text-slate-600 uppercase tracking-wider mb-2">
                  Category
                </label>
                <div className="relative">
                  <Tag className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                  <input
                    type="text"
                    list="category-suggestions"
                    placeholder="Category"
                    className={`w-full pl-10 pr-3 py-2.5 text-sm border-2 border-slate-200 rounded-xl focus:ring-2 focus:ring-brand-500 focus:border-brand-500 outline-none transition-all hover:border-slate-300 ${availableAccounts.includes(payee)
                        ? "bg-slate-100 text-slate-500"
                        : ""
                      }`}
                    value={category}
                    onChange={(e) => setCategory(e.target.value)}
                    disabled={availableAccounts.includes(payee)}
                  />
                </div>
              </div>

              <div className="md:col-span-3">
                <label className="block text-xs font-bold text-slate-600 uppercase tracking-wider mb-2">
                  Notes
                </label>
                <div className="relative">
                  <FileText className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                  <input
                    type="text"
                    placeholder="What was this for?"
                    className="w-full pl-10 pr-3 py-2.5 text-sm border-2 border-slate-200 rounded-xl focus:ring-2 focus:ring-brand-500 focus:border-brand-500 outline-none transition-all hover:border-slate-300"
                    value={notes}
                    onChange={(e) => setNotes(e.target.value)}
                  />
                </div>
              </div>

              <div className="md:col-span-2">
                <label className="block text-xs font-bold text-slate-600 uppercase tracking-wider mb-2">
                  Amount
                </label>
                <div className="relative">
                  <Euro className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                  <input
                    type="number"
                    required
                    step="0.01"
                    placeholder="0.00"
                    className="w-full pl-3 pr-10 py-2.5 text-sm border-2 border-slate-200 rounded-xl focus:ring-2 focus:ring-brand-500 focus:border-brand-500 outline-none transition-all font-semibold hover:border-slate-300"
                    value={amount}
                    onChange={(e) => setAmount(e.target.value)}
                  />
                </div>
              </div>

              <div className="md:col-span-12 flex justify-end mt-2">
                <button
                  type="submit"
                  className="bg-emerald-600 hover:bg-emerald-700 text-white px-6 py-2.5 text-sm font-bold rounded-xl shadow-md hover:shadow-lg transition-all duration-200 flex items-center gap-2 hover:-translate-y-0.5"
                >
                  <Check className="w-4 h-4" />
                  <span className="text-white">Save Transaction</span>
                </button>
              </div>
            </form>
          )}
        </div>
      )}

      {/* Transactions Table */}
      <div className="bg-white rounded-2xl shadow-md border border-slate-200 overflow-hidden hover:shadow-lg transition-shadow duration-300">
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-slate-200">
            <thead className="bg-gradient-to-r from-slate-50 to-slate-100">
              <tr>
                <th className="px-6 py-4 text-left text-xs font-bold text-slate-600 uppercase tracking-wider w-32">
                  Date
                </th>
                <th className="px-6 py-4 text-left text-xs font-bold text-slate-600 uppercase tracking-wider">
                  Payee
                </th>
                <th className="px-6 py-4 text-left text-xs font-bold text-slate-600 uppercase tracking-wider w-48">
                  Category
                </th>
                <th className="px-6 py-4 text-left text-xs font-bold text-slate-600 uppercase tracking-wider">
                  Notes
                </th>
                <th className="px-6 py-4 text-right text-xs font-bold text-slate-600 uppercase tracking-wider w-36">
                  Amount
                </th>
                <th className="w-16"></th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-slate-100">
              {filteredTransactions.length === 0 ? (
                <tr>
                  <td colSpan="6" className="px-6 py-16 text-center">
                    <div className="flex flex-col items-center justify-center gap-3">
                      <div className="bg-slate-100 p-4 rounded-full">
                        <Search className="w-8 h-8 text-slate-300" />
                      </div>
                      <p className="text-lg font-semibold text-slate-600 mb-1">
                        No transactions found
                      </p>
                      <p className="text-sm text-slate-400">
                        {searchQuery
                          ? "Try adjusting your search terms."
                          : "Add a new transaction to get started."}
                      </p>
                    </div>
                  </td>
                </tr>
              ) : (
                filteredTransactions.map((tx) => (
                  <tr
                    key={tx.id}
                    className="hover:bg-gradient-to-r hover:from-slate-50 hover:to-transparent group transition-all duration-200"
                  >
                    {editingId === tx.id ? (
                      <>
                        <td className="px-4 py-3">
                          <DatePicker
                            selected={
                              editForm.date ? new Date(editForm.date) : null
                            }
                            onChange={(date) =>
                              setEditForm({
                                ...editForm,
                                date: date
                                  ? date.toISOString().split("T")[0]
                                  : "",
                              })
                            }
                            dateFormat="yyyy-MM-dd"
                            shouldCloseOnSelect={false}
                            className="w-full p-2 text-sm border-2 border-slate-300 rounded-lg focus:ring-2 focus:ring-brand-500 outline-none"
                          />
                        </td>
                        <td className="px-4 py-3">
                          <AutocompleteInput
                            suggestions={payeeSuggestions}
                            className="w-full p-2 text-sm border-2 border-slate-300 rounded-lg focus:ring-2 focus:ring-brand-500 outline-none"
                            value={editForm.payee}
                            onChange={(val) =>
                              setEditForm({ ...editForm, payee: val })
                            }
                          />
                        </td>
                        <td className="px-4 py-3">
                          <input
                            type="text"
                            list="category-suggestions"
                            className={`w-full p-2 text-sm border-2 border-slate-300 rounded-lg focus:ring-2 focus:ring-brand-500 outline-none ${availableAccounts.includes(editForm.payee) ? "bg-slate-100 text-slate-500" : ""}`}
                            value={editForm.category || ""}
                            onChange={(e) =>
                              setEditForm({
                                ...editForm,
                                category: e.target.value,
                              })
                            }
                            disabled={availableAccounts.includes(
                              editForm.payee,
                            )}
                          />
                        </td>
                        <td className="px-4 py-3">
                          <input
                            type="text"
                            className="w-full p-2 text-sm border-2 border-slate-300 rounded-lg focus:ring-2 focus:ring-brand-500 outline-none"
                            value={editForm.notes || ""}
                            onChange={(e) =>
                              setEditForm({
                                ...editForm,
                                notes: e.target.value,
                              })
                            }
                          />
                        </td>
                        <td className="px-4 py-3">
                          <input
                            type="number"
                            step="0.01"
                            className="w-full p-2 text-sm border-2 border-slate-300 rounded-lg focus:ring-2 focus:ring-brand-500 outline-none text-right"
                            value={editForm.amount}
                            onChange={(e) =>
                              setEditForm({
                                ...editForm,
                                amount: e.target.value,
                              })
                            }
                          />
                        </td>
                        <td className="px-4 py-3 text-center">
                          <div className="flex items-center justify-center gap-1">
                            <button
                              onClick={saveEdit}
                              className="p-1.5 text-emerald-600 hover:bg-emerald-50 rounded-lg transition-colors"
                            >
                              <Check className="w-4 h-4" />
                            </button>
                            <button
                              onClick={() => setEditingId(null)}
                              className="p-1.5 text-rose-600 hover:bg-rose-50 rounded-lg transition-colors"
                            >
                              <X className="w-4 h-4" />
                            </button>
                          </div>
                        </td>
                      </>
                    ) : (
                      <>
                        <td
                          className="px-6 py-4 whitespace-nowrap text-sm text-slate-600 font-medium cursor-pointer"
                          onClick={() => startEditing(tx)}
                        >
                          {new Date(tx.date).toLocaleDateString("en-US", {
                            month: "short",
                            day: "numeric",
                            year: "numeric",
                          })}
                        </td>
                        <td
                          className="px-6 py-4 whitespace-nowrap text-sm font-semibold text-slate-900 cursor-pointer"
                          onClick={() => startEditing(tx)}
                        >
                          {tx.payee}
                        </td>
                        <td
                          className="px-6 py-4 whitespace-nowrap text-sm cursor-pointer"
                          onClick={() => startEditing(tx)}
                        >
                          {tx.category ? (
                            <span
                              className={`px-3 py-1.5 inline-flex text-xs font-bold rounded-xl border ${tx.category === "Transfer"
                                  ? "bg-purple-50 text-purple-700 border-purple-200"
                                  : "bg-slate-100 text-slate-700 border-slate-200"
                                }`}
                            >
                              {tx.category}
                            </span>
                          ) : (
                            <span className="text-slate-400">-</span>
                          )}
                        </td>
                        <td
                          className="px-6 py-4 text-sm text-slate-500 max-w-xs truncate cursor-pointer"
                          onClick={() => startEditing(tx)}
                        >
                          {tx.notes || (
                            <span className="text-slate-300 italic">
                              No notes
                            </span>
                          )}
                        </td>
                        <td
                          className={`px-6 py-4 whitespace-nowrap text-sm text-right font-bold cursor-pointer ${tx.amount >= 0 ? "text-emerald-600" : "text-rose-600"}`}
                          onClick={() => startEditing(tx)}
                        >
                          {tx.amount >= 0 ? "+" : ""}
                          {Math.abs(tx.amount).toLocaleString("en-US", {
                            minimumFractionDigits: 2,
                            maximumFractionDigits: 2,
                          })}{" "}
                          €
                        </td>
                        <td className="px-4 py-4 whitespace-nowrap text-right text-sm font-medium relative action-menu-container">
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              setMenuOpenId(
                                menuOpenId === tx.id ? null : tx.id,
                              );
                            }}
                            className={`p-2 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition-all duration-200 ${menuOpenId === tx.id ? "opacity-100 bg-slate-100" : "opacity-0 group-hover:opacity-100"}`}
                          >
                            <MoreVertical className="w-4 h-4" />
                          </button>

                          {menuOpenId === tx.id && (
                            <div className="absolute right-8 top-8 w-44 bg-white rounded-xl shadow-2xl z-20 border-2 border-slate-200 py-1.5 animate-fade-in">
                              <button
                                onClick={() => duplicateTransaction(tx)}
                                className="w-full text-left px-4 py-2.5 text-sm text-slate-700 hover:bg-slate-50 flex items-center gap-3 font-medium transition-colors"
                              >
                                <Copy className="w-4 h-4 text-slate-400" />
                                Duplicate
                              </button>
                              <button
                                onClick={() => deleteTransaction(tx.id)}
                                className="w-full text-left px-4 py-2.5 text-sm text-rose-600 hover:bg-rose-50 flex items-center gap-3 font-medium transition-colors"
                              >
                                <Trash2 className="w-4 h-4" />
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

      <datalist id="category-suggestions">
        {categorySuggestions.map((cat, index) => (
          <option key={index} value={cat} />
        ))}
      </datalist>
    </div>
  );
}

function AutocompleteInput({
  value,
  onChange,
  suggestions,
  placeholder,
  className,
  disabled,
}) {
  const [isOpen, setIsOpen] = useState(false);

  const filtered = useMemo(() => {
    if (!value) {
      return suggestions;
    } else {
      const query = value.toLowerCase();
      return suggestions.filter((s) => s.value.toLowerCase().includes(query));
    }
  }, [value, suggestions]);

  return (
    <div className="relative w-full">
      <input
        type="text"
        value={value}
        onChange={(e) => {
          onChange(e.target.value);
          setIsOpen(true);
        }}
        onFocus={() => setIsOpen(true)}
        onBlur={() => setTimeout(() => setIsOpen(false), 200)}
        className={className}
        placeholder={placeholder}
        disabled={disabled}
      />
      {isOpen && filtered.length > 0 && (
        <ul className="absolute z-50 left-0 right-0 mt-1 bg-white border border-slate-200 rounded-lg shadow-xl max-h-60 overflow-auto text-left py-1">
          {filtered.map((s, i) => (
            <li
              key={i}
              className="px-3 py-2 hover:bg-blue-50 cursor-pointer flex justify-between items-center text-sm text-slate-700"
              onMouseDown={(e) => {
                e.preventDefault();
                onChange(s.value);
                setIsOpen(false);
              }}
            >
              <span className="font-medium">{s.value}</span>
              {s.type === "account" && (
                <span className="text-xs bg-purple-100 text-purple-800 px-2 py-0.5 rounded-full border border-purple-200 flex items-center gap-1">
                  <ArrowRightLeft className="w-3 h-3" />
                  Transfer
                </span>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

AccountDetails.propTypes = {
  account: PropTypes.shape({
    id: PropTypes.oneOfType([PropTypes.string, PropTypes.number]).isRequired,
    name: PropTypes.string,
    balance: PropTypes.number,
    kind: PropTypes.string,
  }).isRequired,
  onUpdate: PropTypes.func.isRequired,
};

AutocompleteInput.propTypes = {
  value: PropTypes.string.isRequired,
  onChange: PropTypes.func.isRequired,
  suggestions: PropTypes.arrayOf(
    PropTypes.shape({
      value: PropTypes.string.isRequired,
      label: PropTypes.string,
      type: PropTypes.string,
    }),
  ).isRequired,
  placeholder: PropTypes.string,
  className: PropTypes.string,
  disabled: PropTypes.bool,
};
