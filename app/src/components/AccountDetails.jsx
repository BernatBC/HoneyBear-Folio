import { useState, useEffect, useMemo } from "react";
import PropTypes from "prop-types";
import DatePicker from "react-datepicker";
import "react-datepicker/dist/react-datepicker.css";
import "../styles/datepicker.css";
import { createPortal } from "react-dom";
import { invoke } from "@tauri-apps/api/core";
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
  ArrowRightLeft,
  User,
  Edit,
} from "lucide-react";
import {
  useFormatNumber,
  useParseNumber,
  useFormatDate,
  getDatePickerFormat,
} from "../utils/format";
import { useNumberFormat } from "../contexts/number-format";
import { useConfirm } from "../contexts/confirm";
import NumberInput from "./NumberInput";
import CustomSelect from "./CustomSelect";
import { t } from "../i18n/i18n";

export default function AccountDetails({ account, onUpdate }) {
  const [transactions, setTransactions] = useState([]);
  const confirm = useConfirm();

  const formatNumber = useFormatNumber();
  const parseNumber = useParseNumber();
  const formatDate = useFormatDate();
  const { dateFormat } = useNumberFormat();
  const [isAdding, setIsAdding] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [payeeSuggestions, setPayeeSuggestions] = useState([]);
  const [categorySuggestions, setCategorySuggestions] = useState([]);
  const [availableAccounts, setAvailableAccounts] = useState([]);
  const [addTargetAccount, setAddTargetAccount] = useState(null);
  const [tickerSuggestions, setTickerSuggestions] = useState([]);
  const [showTickerSuggestions, setShowTickerSuggestions] = useState(false);

  // Editing state
  const [editingId, setEditingId] = useState(null);
  const [editForm, setEditForm] = useState({});
  const [menuOpenId, setMenuOpenId] = useState(null);
  // Coordinates/state for portal menu (so it can render above scrollable containers)
  const [menuCoords, setMenuCoords] = useState(null);
  // Keep track of original notes value when editing (used to warn about modifying auto-generated brokerage notes)
  const [originalNotes, setOriginalNotes] = useState("");

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
  const [transactionType, setTransactionType] = useState("cash");

  // Brokerage Form State
  const [ticker, setTicker] = useState("");
  const [shares, setShares] = useState("");
  const [pricePerShare, setPricePerShare] = useState("");
  const [totalPrice, setTotalPrice] = useState("");
  const [fee, setFee] = useState("");
  // Removed cashAccountId/Name/Suggestions as we are unified now
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

      // If viewing the consolidated "All" view, default the add-target to the first account
      if (
        account.id === "all" &&
        otherAccounts.length > 0 &&
        !addTargetAccount
      ) {
        setAddTargetAccount(otherAccounts[0]);
      }

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
      setCategorySuggestions(
        categories.map((c) => ({
          value: c,
          label: "Category",
          type: "category",
        })),
      );
    } catch (e) {
      console.error("Failed to fetch suggestions:", e);
    }
  }

  async function fetchTransactions() {
    try {
      let txs;
      if (account.id === "all") {
        const [transactionsList, accounts] = await Promise.all([
          invoke("get_all_transactions"),
          invoke("get_accounts"),
        ]);
        // Attach account_name for display in the consolidated view
        txs = transactionsList.map((tx) => {
          const acc = accounts.find((a) => a.id === tx.account_id);
          return {
            ...tx,
            account_name: acc ? acc.name : String(tx.account_id),
          };
        });
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

  // Close menu when clicking outside, and close on scroll/resize so portal positioning doesn't get stale
  useEffect(() => {
    function handleClickOutside(event) {
      if (
        menuOpenId &&
        !event.target.closest(".action-menu-container") &&
        !event.target.closest(".action-menu-portal")
      ) {
        setMenuOpenId(null);
        setMenuCoords(null);
      }
    }

    function handleScrollOrResize() {
      if (menuOpenId) {
        setMenuOpenId(null);
        setMenuCoords(null);
      }
    }

    document.addEventListener("mousedown", handleClickOutside);
    // capture true ensures we catch scrolls from inner containers too
    window.addEventListener("scroll", handleScrollOrResize, true);
    window.addEventListener("resize", handleScrollOrResize);

    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
      window.removeEventListener("scroll", handleScrollOrResize, true);
      window.removeEventListener("resize", handleScrollOrResize);
    };
  }, [menuOpenId]);

  // Auto-set category to Transfer if payee is an account
  useEffect(() => {
    if (availableAccounts?.some((a) => a.name === payee)) {
      setCategory("Transfer");
    }
  }, [payee, availableAccounts]);

  useEffect(() => {
    if (
      editForm.payee &&
      availableAccounts?.some((a) => a.name === editForm.payee)
    ) {
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
  const handleSharesChange = (num) => {
    setShares(num);
    if (num !== undefined && num !== null && pricePerShare) {
      setTotalPrice(
        ((Math.abs(num) || 0) * (parseNumber(pricePerShare) || 0)).toFixed(2),
      );
    }
  };

  const handlePricePerShareChange = (num) => {
    setPricePerShare(num);
    if (
      shares !== undefined &&
      shares !== null &&
      num !== undefined &&
      num !== null
    ) {
      setTotalPrice(
        ((parseNumber(shares) || 0) * (Math.abs(num) || 0)).toFixed(2),
      );
    }
  };

  const handleTotalPriceChange = (val) => {
    setTotalPrice(val);
    if (shares !== undefined && shares !== null && val) {
      setPricePerShare(
        ((parseNumber(val) || 0) / (parseNumber(shares) || 1)).toFixed(4),
      );
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
    const confirmed = await confirm(
      t("confirm.delete_account", { name: account.name }),
      {
        title: t("confirm.delete_title"),
        kind: "warning",
        okLabel: t("confirm.delete"),
        cancelLabel: t("confirm.cancel"),
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
      const target = account.id === "all" ? addTargetAccount : account;
      if (!target) {
        await confirm(t("confirm.select_account"), {
          title: t("confirm.invalid_input_title"),
          kind: "error",
          showCancel: false,
        });
        return;
      }

      if (transactionType === "investment") {
        await invoke("create_investment_transaction", {
          args: {
            accountId: target.id,
            date,
            ticker,
            shares: parseNumber(shares),
            pricePerShare: parseNumber(pricePerShare),
            fee: parseNumber(fee) || 0.0,
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
          args: {
            accountId: target.id,
            date,
            payee,
            category: category || null,
            notes: notes || null,
            amount: parseNumber(amount) || 0.0,
            ticker: null,
            shares: null,
            pricePerShare: null,
            fee: null,
          },
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
    setOriginalNotes(tx.notes || "");
    setMenuOpenId(null);
  }

  async function saveEdit() {
    try {
      // If this is a brokerage transaction (has ticker), call the investment-specific update
      if (editForm.ticker) {
        const shares = Math.abs(parseNumber(editForm.shares) || 0);
        const pricePerShare = parseNumber(editForm.price_per_share) || 0.0;
        const feeVal = parseNumber(editForm.fee) || 0.0;
        const isBuy =
          editForm.payee === "Buy" ||
          (editForm.payee !== "Sell" &&
            (parseNumber(editForm.shares) || 0) > 0);

        // If user modified notes on a brokerage transaction, show a warning before proceeding
        const prev = originalNotes || "";
        const current = editForm.notes || "";
        if (prev !== current) {
          const confirmed = await confirm(t("confirm.edit_automated_notes"), {
            title: t("confirm.edit_automated_notes_title"),
            kind: "warning",
            okLabel: t("confirm.ok"),
            cancelLabel: t("confirm.cancel"),
          });

          if (!confirmed) return;
        }

        await invoke("update_investment_transaction", {
          args: {
            id: editForm.id,
            accountId: editForm.account_id,
            date: editForm.date,
            ticker: editForm.ticker,
            shares: shares,
            pricePerShare: pricePerShare,
            fee: feeVal,
            isBuy: isBuy,
            notes: editForm.notes || null,
          },
        });
      } else {
        await invoke("update_transaction", {
          args: {
            id: editForm.id,
            accountId: editForm.account_id,
            date: editForm.date,
            payee: editForm.payee,
            category: editForm.category || null,
            notes: editForm.notes || null,
            amount: parseNumber(editForm.amount) || 0.0,
          },
        });
      }

      setEditingId(null);
      fetchTransactions();
      if (onUpdate) onUpdate();
    } catch (e) {
      console.error("Failed to update transaction:", e);
    }
  }

  async function deleteTransaction(id) {
    const confirmed = await confirm(t("confirm.delete_transaction"), {
      title: t("confirm.transaction_title"),
      kind: "warning",
      okLabel: t("confirm.delete"),
      cancelLabel: t("confirm.cancel"),
    });
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
        args: {
          accountId: tx.account_id,
          date: tx.date,
          payee: tx.payee,
          category: tx.category,
          notes: tx.notes,
          amount: tx.amount,
          ticker: tx.ticker || null,
          shares: tx.shares || null,
          pricePerShare: tx.price_per_share || null,
          fee: tx.fee || null,
        },
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

  const hasInvestment = useMemo(() => {
    return transactions.some(
      (tx) => tx.ticker || (tx.shares && tx.shares !== 0),
    );
  }, [transactions]);

  // When viewing the consolidated "All" view, allow adding to a selected account
  const effectiveAddTarget = account.id === "all" ? addTargetAccount : account;

  return (
    <div className="max-w-full pb-8">
      {/* Header */}
      <header className="mb-8 flex flex-col md:flex-row md:items-end justify-between gap-4 bg-gradient-to-br from-white to-slate-50 dark:from-slate-800 dark:to-slate-900 px-4 lg:px-6 py-4 rounded-2xl shadow-md border border-slate-200 dark:border-slate-700 hover:shadow-lg transition-shadow duration-200">
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
                className="text-3xl font-bold text-slate-900 dark:text-slate-100 tracking-tight bg-transparent border-b-2 border-brand-500 focus:outline-none min-w-[200px]"
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
                  className="p-1 rounded-full bg-emerald-100 dark:bg-emerald-900/30 text-emerald-600 dark:text-emerald-400 hover:bg-emerald-200 dark:hover:bg-emerald-900/50 transition-colors"
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
                  className="p-1 rounded-full bg-slate-100 dark:bg-slate-700 text-slate-500 dark:text-slate-400 hover:bg-slate-200 dark:hover:bg-slate-600 hover:text-rose-500 transition-colors"
                  title="Cancel"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
            </form>
          ) : (
            <h1 className="text-3xl font-bold text-slate-900 dark:text-slate-100 tracking-tight flex items-center gap-3">
              {account.name}
            </h1>
          )}
          <div className="flex items-baseline gap-2 mt-2">
            <span className="text-sm font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider">
              Balance:
            </span>
            <span
              className={`text-3xl font-bold tracking-tight ${
                account.balance >= 0
                  ? "text-emerald-600 dark:text-emerald-400"
                  : "text-rose-600 dark:text-rose-400"
              }`}
            >
              {account.balance >= 0 ? "+" : ""}
              {formatNumber(account.balance, { style: "currency" })}
            </span>
          </div>
        </div>

        <div className="flex flex-wrap gap-3 w-full md:w-auto">
          <div className="relative flex-1 md:w-64">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400" />
            <input
              type="text"
              placeholder={t("account.search_transactions")}
              className="w-full pl-10 pr-4 py-3 bg-white dark:bg-slate-800 border-2 border-slate-200 dark:border-slate-700 rounded-xl shadow-sm focus:outline-none focus:ring-2 focus:ring-brand-500 focus:border-brand-500 text-sm transition-all hover:border-slate-300 dark:hover:border-slate-600 text-slate-900 dark:text-slate-100"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
          </div>
          <div className="flex items-center gap-3">
            {account.id === "all" && availableAccounts.length > 0 && (
              <div className="relative w-64">
                <CustomSelect
                  value={addTargetAccount ? addTargetAccount.id : ""}
                  onChange={(val) => {
                    const selected = availableAccounts.find(
                      (a) => String(a.id) === String(val),
                    );
                    setAddTargetAccount(selected || null);
                  }}
                  options={availableAccounts.map((a) => ({
                    value: a.id,
                    label: a.name,
                  }))}
                  placeholder="Select Account"
                />
              </div>
            )}

            {!(account.id === "all" && availableAccounts.length === 0) &&
              (!isAdding ? (
                <button
                  onClick={() => {
                    if (
                      account.id === "all" &&
                      !addTargetAccount &&
                      availableAccounts.length
                    ) {
                      setAddTargetAccount(availableAccounts[0]);
                    }
                    setIsAdding(true);
                  }}
                  className="bg-blue-600 hover:bg-blue-700 text-white flex items-center gap-2 px-3 sm:px-5 py-3 rounded-xl font-semibold text-sm shadow-sm transition-colors"
                >
                  <Plus className="w-5 h-5" />
                  <span className="hidden sm:inline">
                    {t("account.add_transaction")}
                  </span>
                </button>
              ) : (
                <button
                  onClick={() => setIsAdding(false)}
                  className="bg-slate-100 hover:bg-slate-200 dark:bg-slate-700 dark:hover:bg-slate-600 text-slate-700 dark:text-slate-200 flex items-center gap-2 px-3 sm:px-5 py-3 rounded-xl font-semibold text-sm shadow-sm transition-colors"
                >
                  <X className="w-5 h-5" />
                  <span className="hidden sm:inline">
                    {t("account.cancel")}
                  </span>
                </button>
              ))}
          </div>

          {account.id !== "all" && (
            <div className="relative account-action-menu">
              <button
                onClick={() => setAccountMenuOpen(!accountMenuOpen)}
                className="p-3 bg-white dark:bg-slate-800 border-2 border-slate-200 dark:border-slate-700 rounded-xl shadow-sm hover:border-slate-300 dark:hover:border-slate-600 transition-all text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-slate-100"
              >
                <MoreVertical className="w-5 h-5" />
              </button>
              {accountMenuOpen && (
                <div className="absolute right-0 mt-2 w-48 bg-white dark:bg-slate-800 rounded-xl shadow-xl border border-slate-100 dark:border-slate-700 py-1 z-50 animate-in fade-in zoom-in-95 duration-200">
                  <button
                    onClick={() => {
                      setIsRenamingAccount(true);
                      setAccountMenuOpen(false);
                      // Slight timeout to ensure input renders before focus
                      setTimeout(() => {
                        const escapedName =
                          typeof CSS !== "undefined" &&
                          typeof CSS.escape === "function"
                            ? CSS.escape(account.name)
                            : account.name.replace(/"/g, '\\"');
                        const input = document.querySelector(
                          'input[value="' + escapedName + '"]',
                        );
                        if (input) input.focus();
                      }, 50);
                    }}
                    className="w-full text-left px-4 py-2.5 text-sm font-medium text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-700 flex items-center gap-2"
                  >
                    <Edit className="w-4 h-4 text-slate-400" />
                    Rename Account
                  </button>
                  <div className="h-px bg-slate-100 dark:bg-slate-700 my-1" />
                  <button
                    onClick={handleDeleteAccount}
                    className="w-full text-left px-4 py-2.5 text-sm font-medium text-rose-600 dark:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-900/30 flex items-center gap-2"
                  >
                    <Trash2 className="w-4 h-4" />
                    Delete Account
                  </button>
                </div>
              )}
            </div>
          )}
        </div>
      </header>

      {/* Add Transaction Form */}
      {isAdding && (
        <div className="bg-gradient-to-br from-white to-slate-50 dark:from-slate-800 dark:to-slate-900 py-4 px-4 lg:px-6 rounded-2xl border-2 border-brand-200 dark:border-brand-800 shadow-xl mb-8 animate-slide-in">
          <div className="flex items-start justify-between mb-6">
            <h3 className="text-lg font-bold mb-0 text-slate-900 dark:text-slate-100 flex items-center gap-3">
              <div className="bg-brand-100 dark:bg-brand-900/30 p-2.5 rounded-xl">
                <Plus className="w-5 h-5 text-brand-600 dark:text-brand-400" />
              </div>
              New Transaction
              {account.id === "all" && effectiveAddTarget && (
                <span className="ml-3 text-sm text-slate-500 dark:text-slate-400">
                  for{" "}
                  <span className="font-medium text-slate-700 dark:text-slate-300">
                    {effectiveAddTarget.name}
                  </span>
                </span>
              )}
            </h3>

            <div className="ml-4">
              <div className="bg-slate-100 dark:bg-slate-800 p-1 rounded-lg flex">
                <button
                  type="button"
                  onClick={() => setTransactionType("cash")}
                  className={`px-4 py-1.5 rounded-md text-sm font-medium transition-all ${
                    transactionType === "cash"
                      ? "bg-white dark:bg-slate-700 text-slate-900 dark:text-slate-100 shadow-sm"
                      : "text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200"
                  }`}
                >
                  Cash
                </button>
                <button
                  type="button"
                  onClick={() => setTransactionType("investment")}
                  className={`px-4 py-1.5 rounded-md text-sm font-medium transition-all ${
                    transactionType === "investment"
                      ? "bg-white dark:bg-slate-700 text-slate-900 dark:text-slate-100 shadow-sm"
                      : "text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200"
                  }`}
                >
                  Investment
                </button>
              </div>
            </div>
          </div>

          {transactionType === "investment" ? (
            <form
              onSubmit={handleAddTransaction}
              className="grid grid-cols-1 md:grid-cols-12 gap-4 items-end"
            >
              <div className="md:col-span-12 mb-2 flex items-center justify-between">
                <div className="flex gap-4">
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="radio"
                      name="txType"
                      checked={isBuy}
                      onChange={() => setIsBuy(true)}
                      className="w-4 h-4 text-blue-600 dark:text-blue-400"
                    />
                    <span className="text-sm font-medium text-slate-700 dark:text-slate-300">
                      Buy
                    </span>
                  </label>
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="radio"
                      name="txType"
                      checked={!isBuy}
                      onChange={() => setIsBuy(false)}
                      className="w-4 h-4 text-blue-600 dark:text-blue-400"
                    />
                    <span className="text-sm font-medium text-slate-700 dark:text-slate-300">
                      Sell
                    </span>
                  </label>
                </div>
              </div>

              <div className="md:col-span-2">
                <label className="block text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-1.5">
                  Date
                </label>
                <div className="relative">
                  <Calendar className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 pointer-events-none z-10" />
                  <DatePicker
                    selected={date ? new Date(date) : null}
                    onChange={(date) =>
                      setDate(date ? date.toISOString().split("T")[0] : "")
                    }
                    dateFormat={getDatePickerFormat(dateFormat)}
                    shouldCloseOnSelect={false}
                    required
                    className="w-full pl-9 pr-3 py-2 text-sm border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none transition-all"
                  />
                </div>
              </div>

              <div className="md:col-span-2 relative">
                <label className="block text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-1.5">
                  Ticker
                </label>
                <input
                  type="text"
                  required
                  placeholder="AAPL"
                  className="w-full px-3 py-2 text-sm border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none transition-all uppercase"
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
                  <div className="absolute z-50 w-full bg-white dark:bg-slate-800 rounded-lg shadow-lg border border-slate-200 dark:border-slate-700 mt-1 max-h-60 overflow-y-auto">
                    {tickerSuggestions.map((suggestion, index) => (
                      <div
                        key={index}
                        className="px-4 py-2 hover:bg-slate-50 dark:hover:bg-slate-700 cursor-pointer text-sm"
                        onClick={() => {
                          setTicker(suggestion.symbol);
                          setShowTickerSuggestions(false);
                        }}
                      >
                        <div className="font-medium text-slate-900 dark:text-slate-100">
                          {suggestion.symbol}
                        </div>
                        <div className="text-xs text-slate-500 dark:text-slate-400 truncate">
                          {suggestion.shortname || suggestion.longname}
                        </div>
                        <div className="text-xs text-slate-400 dark:text-slate-500">
                          {suggestion.exchange} - {suggestion.typeDisp}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              <div className="md:col-span-2">
                <label className="block text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-1.5">
                  Shares
                </label>
                <NumberInput
                  value={shares}
                  onChange={(num) => handleSharesChange(num)}
                  className="w-full px-3 py-2 text-sm border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none transition-all"
                  placeholder={formatNumber(0, {
                    maximumFractionDigits: 6,
                    minimumFractionDigits: 0,
                    useGrouping: false,
                  })}
                  maximumFractionDigits={6}
                  useGrouping={false}
                />
              </div>

              <div className="md:col-span-2">
                <label className="block text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-1.5">
                  Price / Share
                </label>
                <div className="relative">
                  <NumberInput
                    value={pricePerShare}
                    onChange={(num) => handlePricePerShareChange(num)}
                    className="w-full px-3 py-2 text-sm border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none transition-all"
                    placeholder={formatNumber(0, {
                      maximumFractionDigits: 2,
                      minimumFractionDigits: 2,
                    })}
                    maximumFractionDigits={4}
                    minimumFractionDigits={2}
                    useGrouping={false}
                  />
                </div>
              </div>

              <div className="md:col-span-2">
                <label className="block text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-1.5">
                  Total Price
                </label>
                <div className="relative">
                  <NumberInput
                    value={totalPrice}
                    onChange={(num) => handleTotalPriceChange(num)}
                    className="w-full px-3 py-2 text-sm border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none transition-all"
                    placeholder={formatNumber(0, {
                      maximumFractionDigits: 2,
                      minimumFractionDigits: 2,
                    })}
                    maximumFractionDigits={2}
                    minimumFractionDigits={2}
                    useGrouping={false}
                  />
                </div>
              </div>

              <div className="md:col-span-2">
                <label className="block text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-1.5">
                  Fee
                </label>
                <div className="relative">
                  <input
                    type="text"
                    inputMode="decimal"
                    step="0.01"
                    placeholder={formatNumber(0, {
                      maximumFractionDigits: 2,
                      minimumFractionDigits: 2,
                    })}
                    className="w-full px-3 py-2 text-sm border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none transition-all"
                    value={fee}
                    onChange={(e) => setFee(e.target.value)}
                  />
                </div>
              </div>

              <div className="md:col-span-12 flex justify-end mt-2">
                <button
                  type="submit"
                  className="bg-emerald-600 hover:bg-emerald-700 text-white px-4 py-2.5 text-sm font-bold rounded-xl shadow-md hover:shadow-lg transition-all duration-200 flex items-center gap-2 hover:-translate-y-0.5"
                >
                  <Check className="w-4 h-4" />
                  Save Investment
                </button>
              </div>
            </form>
          ) : (
            <form
              onSubmit={handleAddTransaction}
              className="grid grid-cols-1 md:grid-cols-12 gap-4 items-end"
            >
              <div className="md:col-span-2">
                <label className="block text-xs font-bold text-slate-600 dark:text-slate-400 uppercase tracking-wider mb-2">
                  Date
                </label>
                <div className="relative">
                  <Calendar className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 pointer-events-none z-10" />
                  <DatePicker
                    selected={date ? new Date(date) : null}
                    onChange={(date) =>
                      setDate(date ? date.toISOString().split("T")[0] : "")
                    }
                    dateFormat={getDatePickerFormat(dateFormat)}
                    shouldCloseOnSelect={false}
                    required
                    className="w-full pl-10 pr-3 py-2.5 text-sm border-2 border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 rounded-xl focus:ring-2 focus:ring-brand-500 focus:border-brand-500 outline-none transition-all hover:border-slate-300 dark:hover:border-slate-600"
                  />
                </div>
              </div>

              <div className="md:col-span-3">
                <label className="block text-xs font-bold text-slate-600 dark:text-slate-400 uppercase tracking-wider mb-2">
                  Payee
                </label>
                <div className="relative">
                  <User className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 z-10" />
                  <AutocompleteInput
                    suggestions={payeeSuggestions}
                    placeholder="Who got paid?"
                    className="w-full pl-10 pr-3 py-2.5 text-sm border-2 border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 rounded-xl focus:ring-2 focus:ring-brand-500 focus:border-brand-500 outline-none transition-all hover:border-slate-300 dark:hover:border-slate-600"
                    value={payee}
                    onChange={setPayee}
                  />
                </div>
              </div>

              <div className="md:col-span-2">
                <label className="block text-xs font-bold text-slate-600 dark:text-slate-400 uppercase tracking-wider mb-2">
                  Category
                </label>
                <div className="relative">
                  <Tag className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                  <AutocompleteInput
                    suggestions={categorySuggestions}
                    placeholder="Category"
                    className={`w-full pl-10 pr-3 py-2.5 text-sm border-2 border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 rounded-xl focus:ring-2 focus:ring-brand-500 focus:border-brand-500 outline-none transition-all hover:border-slate-300 dark:hover:border-slate-600 ${
                      availableAccounts?.some((a) => a.name === payee)
                        ? "bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400"
                        : ""
                    }`}
                    value={category}
                    onChange={setCategory}
                    disabled={availableAccounts?.some((a) => a.name === payee)}
                  />
                </div>
              </div>

              <div className="md:col-span-3">
                <label className="block text-xs font-bold text-slate-600 dark:text-slate-400 uppercase tracking-wider mb-2">
                  {t("account.notes")}
                </label>
                <div className="relative">
                  <FileText className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                  <input
                    type="text"
                    placeholder={t("account.notes_placeholder")}
                    className="w-full pl-10 pr-3 py-2.5 text-sm border-2 border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 rounded-xl focus:ring-2 focus:ring-brand-500 focus:border-brand-500 outline-none transition-all hover:border-slate-300 dark:hover:border-slate-600"
                    value={notes}
                    onChange={(e) => setNotes(e.target.value)}
                  />
                </div>
              </div>

              <div className="md:col-span-2">
                <label className="block text-xs font-bold text-slate-600 dark:text-slate-400 uppercase tracking-wider mb-2">
                  Amount
                </label>
                <div className="relative">
                  <input
                    type="text"
                    inputMode="decimal"
                    required
                    step="0.01"
                    placeholder={formatNumber(0, {
                      maximumFractionDigits: 2,
                      minimumFractionDigits: 2,
                    })}
                    className="w-full px-3 py-2.5 text-sm border-2 border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 rounded-xl focus:ring-2 focus:ring-brand-500 focus:border-brand-500 outline-none transition-all font-semibold hover:border-slate-300 dark:hover:border-slate-600"
                    value={amount}
                    onChange={(e) => setAmount(e.target.value)}
                  />
                </div>
              </div>

              <div className="md:col-span-12 flex justify-end mt-2">
                <button
                  type="submit"
                  className="bg-emerald-600 hover:bg-emerald-700 text-white px-4 py-2.5 text-sm font-bold rounded-xl shadow-md hover:shadow-lg transition-all duration-200 flex items-center gap-2 hover:-translate-y-0.5"
                >
                  <Check className="w-4 h-4" />
                  <span className="text-white">
                    {t("account.save_transaction")}
                  </span>
                </button>
              </div>
            </form>
          )}
        </div>
      )}

      {/* Transactions Table */}
      <div className="bg-white dark:bg-slate-800 rounded-2xl shadow-md border border-slate-200 dark:border-slate-700 overflow-visible hover:shadow-lg transition-shadow duration-300 px-4 lg:px-6">
        <div className="overflow-x-auto">
          <table className="account-transactions-table min-w-full divide-y divide-slate-200 dark:divide-slate-700">
            <thead className="bg-white dark:bg-slate-800 rounded-t-2xl">
              <tr>
                <th className="px-6 py-4 text-left text-xs font-bold !text-slate-700 dark:!text-slate-300 uppercase tracking-wider w-32">
                  Date
                </th>
                {account.id === "all" && (
                  <th className="px-6 py-4 text-left text-xs font-bold !text-slate-700 dark:!text-slate-300 uppercase tracking-wider w-48">
                    Account
                  </th>
                )}
                <th className="px-6 py-4 text-left text-xs font-bold !text-slate-700 dark:!text-slate-300 uppercase tracking-wider">
                  Payee
                </th>
                <th className="px-6 py-4 text-left text-xs font-bold !text-slate-700 dark:!text-slate-300 uppercase tracking-wider w-56">
                  Category
                </th>
                <th className="px-6 py-4 text-left text-xs font-bold !text-slate-700 dark:!text-slate-300 uppercase tracking-wider">
                  {t("account.notes")}
                </th>
                {hasInvestment && (
                  <>
                    <th className="px-6 py-4 text-left text-xs font-bold !text-slate-700 dark:!text-slate-300 uppercase tracking-wider w-48">
                      Ticker
                    </th>
                    <th className="px-6 py-4 text-right text-xs font-bold !text-slate-700 dark:!text-slate-300 uppercase tracking-wider w-36">
                      Shares
                    </th>
                    <th className="px-6 py-4 text-right text-xs font-bold !text-slate-700 dark:!text-slate-300 uppercase tracking-wider w-36">
                      Price
                    </th>
                    <th className="px-6 py-4 text-right text-xs font-bold !text-slate-700 dark:!text-slate-300 uppercase tracking-wider w-28">
                      Fee
                    </th>
                  </>
                )}
                <th className="px-6 py-4 text-right text-xs font-bold !text-slate-700 dark:!text-slate-300 uppercase tracking-wider w-36">
                  Amount
                </th>
                <th className="w-16"></th>
              </tr>
            </thead>
            <tbody className="bg-white dark:bg-slate-800 divide-y divide-slate-100 dark:divide-slate-700">
              {filteredTransactions.length === 0 ? (
                <tr>
                  <td
                    colSpan={
                      account.id === "all"
                        ? !hasInvestment
                          ? "7"
                          : "11"
                        : !hasInvestment
                          ? "6"
                          : "10"
                    }
                    className="px-3 py-4 text-center"
                  >
                    <div className="flex flex-col items-center justify-center gap-3">
                      <div className="bg-slate-100 dark:bg-slate-700 p-4 rounded-full">
                        <Search className="w-8 h-8 text-slate-300 dark:text-slate-500" />
                      </div>
                      <p className="text-lg font-semibold text-slate-600 dark:text-slate-400 mb-1">
                        {t("account.no_transactions_found")}
                      </p>
                      <p className="text-sm text-slate-400 dark:text-slate-500">
                        {searchQuery
                          ? t("account.search_try_adjust")
                          : t("account.add_transaction_get_started")}
                      </p>
                    </div>
                  </td>
                </tr>
              ) : (
                filteredTransactions.map((tx) => (
                  <tr
                    key={tx.id}
                    className="hover:bg-gradient-to-r hover:from-slate-50 hover:to-transparent dark:hover:from-slate-700/50 group transition-all duration-200"
                  >
                    {editingId === tx.id ? (
                      <>
                        <td className="px-6 py-3">
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
                            dateFormat={getDatePickerFormat(dateFormat)}
                            shouldCloseOnSelect={false}
                            className="w-full p-2 text-sm border-2 border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 rounded-lg focus:ring-2 focus:ring-brand-500 outline-none"
                          />
                        </td>

                        {account.id === "all" && (
                          <td className="px-6 py-3">
                            <span className="text-sm text-slate-700 dark:text-slate-300">
                              {editForm.account_name || editForm.account_id}
                            </span>
                          </td>
                        )}

                        {/* If brokerage tx, show brokerage-specific editable fields (only for non-cash views) */}
                        {hasInvestment && editForm.ticker ? (
                          <>
                            <td className="px-6 py-3">
                              <div className="flex items-center gap-3">
                                <label className="flex items-center gap-2 cursor-pointer">
                                  <input
                                    type="radio"
                                    name={`txType-${tx.id}`}
                                    checked={
                                      editForm.payee === "Buy" ||
                                      (editForm.payee !== "Sell" &&
                                        (parseNumber(editForm.shares) || 0) > 0)
                                    }
                                    onChange={() =>
                                      setEditForm({ ...editForm, payee: "Buy" })
                                    }
                                    className="w-4 h-4 text-blue-600 dark:text-blue-400"
                                  />
                                  <span className="text-sm text-slate-700 dark:text-slate-300">
                                    Buy
                                  </span>
                                </label>
                                <label className="flex items-center gap-2 cursor-pointer">
                                  <input
                                    type="radio"
                                    name={`txType-${tx.id}`}
                                    checked={
                                      editForm.payee === "Sell" ||
                                      (editForm.payee !== "Buy" &&
                                        (parseNumber(editForm.shares) || 0) < 0)
                                    }
                                    onChange={() =>
                                      setEditForm({
                                        ...editForm,
                                        payee: "Sell",
                                      })
                                    }
                                    className="w-4 h-4 text-blue-600 dark:text-blue-400"
                                  />
                                  <span className="text-sm text-slate-700 dark:text-slate-300">
                                    Sell
                                  </span>
                                </label>
                              </div>
                            </td>

                            <td className="px-6 py-3">
                              <input
                                type="text"
                                className="w-full p-2 text-sm border-2 border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 rounded-lg focus:ring-2 focus:ring-brand-500 outline-none"
                                value={editForm.category || "Investment"}
                                onChange={(e) =>
                                  setEditForm({
                                    ...editForm,
                                    category: e.target.value,
                                  })
                                }
                              />
                            </td>

                            <td className="px-6 py-3">
                              <input
                                type="text"
                                className="w-full p-2 text-sm border-2 border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 rounded-lg focus:ring-2 focus:ring-brand-500 outline-none"
                                value={editForm.notes || ""}
                                onChange={(e) =>
                                  setEditForm({
                                    ...editForm,
                                    notes: e.target.value,
                                  })
                                }
                                placeholder={t("account.notes_placeholder")}
                              />
                            </td>

                            <td className="px-6 py-3">
                              <input
                                type="text"
                                className="w-full p-2 text-sm border-2 border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 rounded-lg focus:ring-2 focus:ring-brand-500 outline-none uppercase"
                                value={editForm.ticker || ""}
                                onChange={(e) =>
                                  setEditForm({
                                    ...editForm,
                                    ticker: e.target.value.toUpperCase(),
                                  })
                                }
                              />
                            </td>

                            <td className="px-6 py-3">
                              <NumberInput
                                value={editForm.shares}
                                onChange={(num) =>
                                  setEditForm({
                                    ...editForm,
                                    shares: num,
                                  })
                                }
                                className="w-full p-2 text-sm border-2 border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 rounded-lg focus:ring-2 focus:ring-brand-500 outline-none text-right"
                                maximumFractionDigits={6}
                                useGrouping={false}
                              />
                            </td>

                            <td className="px-6 py-3">
                              <div className="relative">
                                <input
                                  type="text"
                                  inputMode="decimal"
                                  step="any"
                                  className="w-full p-2 text-sm border-2 border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 rounded-lg focus:ring-2 focus:ring-brand-500 outline-none text-right"
                                  value={editForm.price_per_share || ""}
                                  onChange={(e) =>
                                    setEditForm({
                                      ...editForm,
                                      price_per_share: e.target.value,
                                    })
                                  }
                                />
                              </div>
                            </td>

                            <td className="px-6 py-3">
                              <div className="relative">
                                <input
                                  type="text"
                                  inputMode="decimal"
                                  step="0.01"
                                  className="w-full p-2 text-sm border-2 border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 rounded-lg focus:ring-2 focus:ring-brand-500 outline-none text-right"
                                  value={editForm.fee || ""}
                                  onChange={(e) =>
                                    setEditForm({
                                      ...editForm,
                                      fee: e.target.value,
                                    })
                                  }
                                />
                              </div>
                            </td>

                            <td className="px-6 py-3 text-right font-bold text-slate-900 dark:text-slate-100">
                              {(() => {
                                const s = parseNumber(editForm.shares) || 0;
                                const p =
                                  parseNumber(editForm.price_per_share) || 0;
                                const totalNum = Math.abs(s) * p;
                                const sign =
                                  editForm.payee === "Sell" || s < 0 ? "" : "+";
                                return (
                                  sign +
                                  formatNumber(totalNum, {
                                    style: "currency",
                                    maximumFractionDigits: 2,
                                    minimumFractionDigits: 2,
                                  })
                                );
                              })()}
                            </td>

                            <td className="px-6 py-3 text-center">
                              <div className="flex items-center justify-center gap-1">
                                <button
                                  onClick={saveEdit}
                                  className="p-1.5 text-emerald-600 dark:text-emerald-400 hover:bg-emerald-50 dark:hover:bg-emerald-900/30 rounded-lg transition-colors"
                                >
                                  <Check className="w-4 h-4" />
                                </button>
                                <button
                                  onClick={() => setEditingId(null)}
                                  className="p-1.5 text-rose-600 dark:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-900/30 rounded-lg transition-colors"
                                >
                                  <X className="w-4 h-4" />
                                </button>
                              </div>
                            </td>
                          </>
                        ) : (
                          // Non-brokerage edit row
                          <>
                            <td className="px-6 py-3">
                              <AutocompleteInput
                                suggestions={payeeSuggestions}
                                className="w-full p-2 text-sm border-2 border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 rounded-lg focus:ring-2 focus:ring-brand-500 outline-none"
                                value={editForm.payee}
                                onChange={(val) =>
                                  setEditForm({ ...editForm, payee: val })
                                }
                              />
                            </td>

                            <td className="px-6 py-3">
                              <AutocompleteInput
                                suggestions={categorySuggestions}
                                className={`w-full p-2 text-sm border-2 border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 rounded-lg focus:ring-2 focus:ring-brand-500 outline-none ${
                                  availableAccounts?.some(
                                    (a) => a.name === editForm.payee,
                                  )
                                    ? "bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400"
                                    : ""
                                }`}
                                value={editForm.category || ""}
                                onChange={(val) =>
                                  setEditForm({
                                    ...editForm,
                                    category: val,
                                  })
                                }
                                disabled={availableAccounts?.some(
                                  (a) => a.name === editForm.payee,
                                )}
                              />
                            </td>

                            <td className="px-6 py-3">
                              <input
                                type="text"
                                className="w-full p-2 text-sm border-2 border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 rounded-lg focus:ring-2 focus:ring-brand-500 outline-none"
                                value={editForm.notes || ""}
                                onChange={(e) =>
                                  setEditForm({
                                    ...editForm,
                                    notes: e.target.value,
                                  })
                                }
                              />
                            </td>

                            {/* If the table includes brokerage columns (non-cash views), insert placeholders so columns stay aligned */}
                            {hasInvestment && (
                              <>
                                <td className="px-6 py-3">
                                  <span className="text-slate-400 dark:text-slate-500">
                                    -
                                  </span>
                                </td>
                                <td className="px-6 py-3 text-right">
                                  <span className="text-slate-400 dark:text-slate-500">
                                    -
                                  </span>
                                </td>
                                <td className="px-6 py-3 text-right">
                                  <span className="text-slate-400 dark:text-slate-500">
                                    -
                                  </span>
                                </td>
                                <td className="px-6 py-3 text-right">
                                  <span className="text-slate-400 dark:text-slate-500">
                                    -
                                  </span>
                                </td>
                              </>
                            )}

                            <td className="px-6 py-3">
                              <input
                                type="text"
                                inputMode="decimal"
                                step="0.01"
                                placeholder={formatNumber(0, {
                                  maximumFractionDigits: 2,
                                  minimumFractionDigits: 2,
                                })}
                                className="w-full p-2 text-sm border-2 border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 rounded-lg focus:ring-2 focus:ring-brand-500 outline-none text-right"
                                value={editForm.amount}
                                onChange={(e) =>
                                  setEditForm({
                                    ...editForm,
                                    amount: e.target.value,
                                  })
                                }
                              />
                            </td>
                            <td className="px-6 py-3 text-center">
                              <div className="flex items-center justify-center gap-1">
                                <button
                                  onClick={saveEdit}
                                  className="p-1.5 text-emerald-600 dark:text-emerald-400 hover:bg-emerald-50 dark:hover:bg-emerald-900/30 rounded-lg transition-colors"
                                >
                                  <Check className="w-4 h-4" />
                                </button>
                                <button
                                  onClick={() => setEditingId(null)}
                                  className="p-1.5 text-rose-600 dark:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-900/30 rounded-lg transition-colors"
                                >
                                  <X className="w-4 h-4" />
                                </button>
                              </div>
                            </td>
                          </>
                        )}
                      </>
                    ) : (
                      <>
                        <td
                          className="px-6 py-4 whitespace-nowrap text-sm text-slate-600 dark:text-slate-400 font-medium cursor-pointer"
                          onClick={() => startEditing(tx)}
                        >
                          {formatDate(tx.date)}
                        </td>

                        {account.id === "all" && (
                          <td
                            className="px-6 py-4 whitespace-nowrap text-sm text-slate-700 dark:text-slate-300"
                            onClick={() => startEditing(tx)}
                          >
                            {tx.account_name || tx.account_id}
                          </td>
                        )}

                        <td
                          className="px-6 py-4 whitespace-nowrap text-sm font-semibold text-slate-900 dark:text-slate-100 cursor-pointer"
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
                              className={`px-2 py-1 inline-flex text-xs font-bold rounded-lg border ${
                                tx.category === "Transfer"
                                  ? "bg-purple-50 dark:bg-purple-900/30 text-purple-700 dark:text-purple-300 border-purple-200 dark:border-purple-800"
                                  : "bg-slate-100 dark:bg-slate-700 text-slate-700 dark:text-slate-300 border-slate-200 dark:border-slate-600"
                              }`}
                            >
                              {tx.category}
                            </span>
                          ) : (
                            <span className="text-slate-400 dark:text-slate-500">
                              -
                            </span>
                          )}
                        </td>
                        <td
                          className="px-6 py-4 text-sm text-slate-500 dark:text-slate-400 max-w-xs truncate cursor-pointer"
                          onClick={() => startEditing(tx)}
                        >
                          {tx.notes || (
                            <span className="text-slate-300 dark:text-slate-600 italic">
                              {t("account.no_notes")}
                            </span>
                          )}
                        </td>

                        {hasInvestment && (
                          <>
                            <td
                              className="px-6 py-4 whitespace-nowrap text-sm cursor-pointer text-slate-700 dark:text-slate-300"
                              onClick={() => startEditing(tx)}
                            >
                              {tx.ticker ? (
                                <span className="font-medium uppercase">
                                  {tx.ticker}
                                </span>
                              ) : (
                                <span className="text-slate-400 dark:text-slate-500">
                                  -
                                </span>
                              )}
                            </td>

                            <td
                              className="px-6 py-4 whitespace-nowrap text-sm text-right cursor-pointer text-slate-700 dark:text-slate-300"
                              onClick={() => startEditing(tx)}
                            >
                              {typeof tx.shares !== "undefined" &&
                              tx.shares !== null ? (
                                <span>
                                  {formatNumber(Math.abs(tx.shares), {
                                    maximumFractionDigits: 6,
                                    minimumFractionDigits: 0,
                                    useGrouping: false,
                                  })}
                                </span>
                              ) : (
                                <span className="text-slate-400 dark:text-slate-500">
                                  -
                                </span>
                              )}
                            </td>

                            <td
                              className="px-6 py-4 whitespace-nowrap text-sm text-right cursor-pointer text-slate-700 dark:text-slate-300"
                              onClick={() => startEditing(tx)}
                            >
                              {typeof tx.price_per_share !== "undefined" &&
                              tx.price_per_share !== null ? (
                                <span>
                                  {formatNumber(tx.price_per_share, {
                                    style: "currency",
                                    maximumFractionDigits: 2,
                                    minimumFractionDigits: 2,
                                  })}
                                </span>
                              ) : (
                                <span className="text-slate-400 dark:text-slate-500">
                                  -
                                </span>
                              )}
                            </td>

                            <td
                              className="px-6 py-4 whitespace-nowrap text-sm text-right cursor-pointer text-slate-700 dark:text-slate-300"
                              onClick={() => startEditing(tx)}
                            >
                              {typeof tx.fee !== "undefined" &&
                              tx.fee !== null ? (
                                <span>
                                  {formatNumber(tx.fee, {
                                    style: "currency",
                                    maximumFractionDigits: 2,
                                    minimumFractionDigits: 2,
                                  })}
                                </span>
                              ) : (
                                <span className="text-slate-400 dark:text-slate-500">
                                  -
                                </span>
                              )}
                            </td>
                          </>
                        )}

                        <td
                          className={`px-6 py-4 whitespace-nowrap text-sm text-right font-bold cursor-pointer ${tx.amount >= 0 ? "text-emerald-600 dark:text-emerald-400" : "text-rose-600 dark:text-rose-400"}`}
                          onClick={() => startEditing(tx)}
                        >
                          {tx.amount >= 0 ? "+" : ""}
                          {formatNumber(Math.abs(tx.amount), {
                            style: "currency",
                          })}
                        </td>
                        <td className="px-2 py-4 whitespace-nowrap text-right text-sm font-medium relative action-menu-container">
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              if (menuOpenId === tx.id) {
                                setMenuOpenId(null);
                                setMenuCoords(null);
                              } else {
                                const rect =
                                  e.currentTarget.getBoundingClientRect();
                                setMenuCoords({
                                  top: rect.top + window.scrollY,
                                  left: rect.left + window.scrollX,
                                  right: rect.right + window.scrollX,
                                  bottom: rect.bottom + window.scrollY,
                                  width: rect.width,
                                  height: rect.height,
                                });
                                setMenuOpenId(tx.id);
                              }
                            }}
                            className={`p-2 rounded-lg text-slate-400 dark:text-slate-500 hover:text-slate-600 dark:hover:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700 transition-all duration-200 ${menuOpenId === tx.id ? "opacity-100 bg-slate-100 dark:bg-slate-700" : "opacity-0 group-hover:opacity-100"}`}
                          >
                            <MoreVertical className="w-4 h-4" />
                          </button>

                          {menuOpenId === tx.id &&
                            menuCoords &&
                            createPortal(
                              <div
                                className="fixed z-50 w-44 bg-white dark:bg-slate-800 rounded-xl shadow-2xl border-2 border-slate-200 dark:border-slate-700 py-1.5 animate-fade-in action-menu-portal"
                                style={{
                                  top: `${menuCoords.top + menuCoords.height + 8}px`,
                                  left: `${Math.min(Math.max(menuCoords.right - 176, 8), window.innerWidth - 176 - 8)}px`,
                                }}
                              >
                                <button
                                  onClick={() => {
                                    duplicateTransaction(tx);
                                    setMenuOpenId(null);
                                    setMenuCoords(null);
                                  }}
                                  className="w-full text-left px-4 py-2.5 text-sm text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-700 flex items-center gap-3 font-medium transition-colors"
                                >
                                  <Copy className="w-4 h-4 text-slate-400 dark:text-slate-500" />
                                  Duplicate
                                </button>
                                <button
                                  onClick={() => {
                                    deleteTransaction(tx.id);
                                    setMenuOpenId(null);
                                    setMenuCoords(null);
                                  }}
                                  className="w-full text-left px-4 py-2.5 text-sm text-rose-600 dark:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-900/30 flex items-center gap-3 font-medium transition-colors"
                                >
                                  <Trash2 className="w-4 h-4" />
                                  Delete
                                </button>
                              </div>,
                              document.body,
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
  ...props
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
        {...props}
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
        <ul className="absolute z-50 left-0 right-0 mt-1 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg shadow-xl max-h-60 overflow-auto text-left py-1">
          {filtered.map((s, i) => (
            <li
              key={i}
              className="px-3 py-2 hover:bg-blue-50 dark:hover:bg-slate-700 cursor-pointer flex justify-between items-center text-sm text-slate-700 dark:text-slate-200"
              onMouseDown={(e) => {
                e.preventDefault();
                onChange(s.value);
                setIsOpen(false);
              }}
            >
              <span className="font-medium">{s.value}</span>
              {s.type === "account" && (
                <span className="text-xs bg-purple-100 dark:bg-purple-900/30 text-purple-800 dark:text-purple-300 px-2 py-0.5 rounded-full border border-purple-200 dark:border-purple-800 flex items-center gap-1">
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
