import { useState, useEffect, useMemo, useRef } from "react";
import PropTypes from "prop-types";
import DatePicker from "react-datepicker";
import "react-datepicker/dist/react-datepicker.css";
import "../../styles/datepicker.css";
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
  ArrowUp,
  ArrowDown,
} from "lucide-react";
import {
  useFormatNumber,
  useParseNumber,
  useFormatDate,
  getDatePickerFormat,
} from "../../utils/format";
import { useNumberFormat } from "../../contexts/number-format";
import { useConfirm } from "../../contexts/confirm";
import NumberInput from "../../components/ui/NumberInput";
import CustomSelect from "../../components/ui/CustomSelect";
import MaskedNumber from "../../components/ui/MaskedNumber";
import { t } from "../../i18n/i18n";
import { CURRENCIES } from "../../utils/currencies";
import { useCustomRate } from "../../hooks/useCustomRate";

export default function AccountDetails({ account, onUpdate }) {
  const [transactions, setTransactions] = useState([]);
  const confirm = useConfirm();
  const { checkAndPrompt, dialog } = useCustomRate();

  const formatNumber = useFormatNumber();
  const parseNumber = useParseNumber();
  const formatDate = useFormatDate();
  const {
    dateFormat,
    firstDayOfWeek,
    currency: appCurrency,
  } = useNumberFormat();
  const [isAdding, setIsAdding] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [payeeSuggestions, setPayeeSuggestions] = useState([]);
  const [categorySuggestions, setCategorySuggestions] = useState([]);
  const [availableAccounts, setAvailableAccounts] = useState([]);
  const [addTargetAccount, setAddTargetAccount] = useState(null);
  const [tickerSuggestions, setTickerSuggestions] = useState([]);
  const [showTickerSuggestions, setShowTickerSuggestions] = useState(false);
  const [rules, setRules] = useState([]);

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
  const [useCustomCurrency, setUseCustomCurrency] = useState(false);
  const [selectedCurrency, setSelectedCurrency] = useState(
    () => localStorage.getItem("hb_currency") || "USD",
  );

  // Brokerage Form State
  const [ticker, setTicker] = useState("");
  const [shares, setShares] = useState("");
  const [pricePerShare, setPricePerShare] = useState("");
  const [fee, setFee] = useState("");
  // Removed cashAccountId/Name/Suggestions as we are unified now
  const [isBuy, setIsBuy] = useState(true);

  // Sorting State
  const [sortConfig, setSortConfig] = useState({ key: null, direction: null });

  // Rules Engine Logic
  const prevValues = useRef({
    payee,
    category,
    notes,
    amount,
    date,
    ticker,
    shares,
    price: pricePerShare,
    fee,
  });

  useEffect(() => {
    if (!rules.length) return;

    // Map rule field names to state values and setters
    const fieldMap = {
      payee: { value: payee, set: setPayee },
      category: { value: category, set: setCategory },
      notes: { value: notes, set: setNotes },
      amount: { value: amount, set: setAmount },
      date: { value: date, set: setDate },
      ticker: { value: ticker, set: setTicker },
      shares: { value: shares, set: setShares },
      price: { value: pricePerShare, set: setPricePerShare },
      fee: { value: fee, set: setFee },
    };

    const currentValues = {
      payee,
      category,
      notes,
      amount,
      date,
      ticker,
      shares,
      price: pricePerShare,
      fee,
    };

    const sortedRules = [...rules].sort((a, b) => b.priority - a.priority);

    // Identify changed fields
    const changedFields = Object.keys(currentValues).filter(
      (k) => currentValues[k] !== prevValues.current[k],
    );

    changedFields.forEach((field) => {
      const val = currentValues[field];
      // Find matching rules (exact match for now)
      const matchingRules = sortedRules.filter(
        (r) => r.match_field === field && r.match_pattern === val,
      );
      matchingRules.forEach((rule) => {
        const target = fieldMap[rule.action_field];
        if (target) {
          // Only update if value is different to avoid loops (though useRef prevents infinite loop on same field)
          if (target.value !== rule.action_value) {
            target.set(rule.action_value);
          }
        }
      });
    });

    prevValues.current = currentValues;
  }, [
    payee,
    category,
    notes,
    rules,
    amount,
    date,
    ticker,
    shares,
    pricePerShare,
    fee,
  ]);

  async function fetchSuggestions() {
    try {
      const [payees, accountsList, categories, fetchedRules] =
        await Promise.all([
          invoke("get_payees"),
          invoke("get_accounts"),
          invoke("get_categories"),
          invoke("get_rules"),
        ]);
      setRules(fetchedRules);

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

  const tickerTimeoutRef = useMemo(() => ({ current: null }), []);

  const handleTickerChange = (query) => {
    if (tickerTimeoutRef.current) clearTimeout(tickerTimeoutRef.current);

    if (!query || query.length < 2) {
      setTickerSuggestions([]);
      return;
    }

    tickerTimeoutRef.current = setTimeout(async () => {
      try {
        const suggestions = await invoke("search_ticker", { query });
        setTickerSuggestions(suggestions);
        setShowTickerSuggestions(true);
      } catch (error) {
        console.error("Error fetching ticker suggestions:", error);
      }
    }, 300);
  };

  // Handle input changes
  const handleSharesChange = (num) => {
    setShares(num);
  };

  const handlePricePerShareChange = (num) => {
    setPricePerShare(num);
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
            currency: useCustomCurrency ? selectedCurrency : null,
          },
        });

        setTicker("");
        setShares("");
        setPricePerShare("");
        setFee("");
        setUseCustomCurrency(false);
        setSelectedCurrency(localStorage.getItem("hb_currency") || "USD");
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
            currency: useCustomCurrency ? selectedCurrency : null,
          },
        });

        setPayee("");
        setCategory("");
        setNotes("");
        setAmount("");
        setUseCustomCurrency(false);
        setSelectedCurrency(localStorage.getItem("hb_currency") || "USD");
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
            currency: editForm.currency || null,
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
            currency: editForm.currency || null,
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
          currency: tx.currency || null,
        },
      });
      setMenuOpenId(null);
      fetchTransactions();
      if (onUpdate) onUpdate();
    } catch (e) {
      console.error("Failed to duplicate transaction:", e);
    }
  }

  const handleSort = (key) => {
    let direction = "ascending";
    if (sortConfig.key === key) {
      if (sortConfig.direction === "ascending") {
        direction = "descending";
      } else if (sortConfig.direction === "descending") {
        direction = null;
      }
    }
    setSortConfig({
      key: direction ? key : null,
      direction: direction ? direction : null,
    });
  };

  const filteredTransactions = useMemo(() => {
    let data = transactions.filter((tx) => {
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

    if (sortConfig.key !== null) {
      data.sort((a, b) => {
        let aValue = a[sortConfig.key];
        let bValue = b[sortConfig.key];

        // Handle numeric values
        if (
          ["amount", "shares", "price_per_share", "fee"].includes(
            sortConfig.key,
          )
        ) {
          aValue = parseFloat(aValue || 0);
          bValue = parseFloat(bValue || 0);
        } else if (sortConfig.key === "date") {
          aValue = new Date(aValue).getTime();
          bValue = new Date(bValue).getTime();
        } else {
          aValue = (aValue || "").toString().toLowerCase();
          bValue = (bValue || "").toString().toLowerCase();
        }

        if (aValue < bValue) {
          return sortConfig.direction === "ascending" ? -1 : 1;
        }
        if (aValue > bValue) {
          return sortConfig.direction === "ascending" ? 1 : -1;
        }
        return 0;
      });
    }
    return data;
  }, [transactions, searchQuery, sortConfig]);

  const hasInvestment = useMemo(() => {
    return transactions.some(
      (tx) => tx.ticker || (tx.shares && tx.shares !== 0),
    );
  }, [transactions]);

  // When viewing the consolidated "All" view, allow adding to a selected account
  const effectiveAddTarget = account.id === "all" ? addTargetAccount : account;

  const getSortIcon = (key) => {
    const active = sortConfig.key === key;
    const direction = active ? sortConfig.direction : null;

    return (
      <span className={`inline-flex w-4 h-4 ${!direction ? "invisible" : ""}`}>
        {direction === "descending" ? (
          <ArrowDown className="w-4 h-4" />
        ) : (
          <ArrowUp className="w-4 h-4" />
        )}
      </span>
    );
  };

  return (
    <div className="page-container account-details-scaled-container">
      {/* Header */}
      <header className="hb-header-container mb-large">
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
            <h1 className="hb-header-title">{account.name}</h1>
          )}

          <div className="flex flex-col mt-2 gap-1">
            {account.totalValue !== undefined &&
            Math.abs(account.totalValue - account.balance) > 0.01 ? (
              <>
                <div className="flex items-baseline gap-2">
                  <span className="text-sm font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider">
                    Total Value:
                  </span>
                  <span
                    className={`text-3xl font-bold tracking-tight ${
                      account.totalValue >= 0
                        ? "text-brand-600 dark:text-brand-400"
                        : "text-rose-600 dark:text-rose-400"
                    }`}
                  >
                    <MaskedNumber
                      value={account.totalValue}
                      options={{
                        style: "currency",
                        currency: account.currency,
                      }}
                    />
                  </span>
                </div>
                <div className="flex items-baseline gap-2">
                  <span className="text-xs font-semibold text-slate-400 dark:text-slate-500 uppercase tracking-wider">
                    Cash Balance:
                  </span>
                  <span
                    className={`text-lg font-medium tracking-tight ${
                      account.balance >= 0
                        ? "text-emerald-600 dark:text-emerald-400 opacity-80"
                        : "text-rose-600 dark:text-rose-400 opacity-80"
                    }`}
                  >
                    <MaskedNumber
                      value={account.balance}
                      options={{
                        style: "currency",
                        currency: account.currency,
                      }}
                    />
                  </span>
                </div>
              </>
            ) : (
              <div className="flex items-baseline gap-2">
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
                  <MaskedNumber
                    value={account.balance}
                    options={{
                      style: "currency",
                      currency: account.currency,
                    }}
                  />
                </span>
              </div>
            )}
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
                  className="btn-primary px-3 sm:px-5 py-3 rounded-xl font-semibold text-sm shadow-sm"
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
                    calendarStartDay={firstDayOfWeek}
                    shouldCloseOnSelect={false}
                    required
                    portalId="datepicker-portal"
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
                    const val = e.target.value.toUpperCase();
                    setTicker(val);
                    handleTickerChange(val);
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
                          if (suggestion.currency) {
                            if (suggestion.currency !== appCurrency) {
                              setUseCustomCurrency(true);
                              setSelectedCurrency(suggestion.currency);
                            } else {
                              setUseCustomCurrency(false);
                            }
                          }
                        }}
                      >
                        <div className="flex items-center justify-between">
                          <span className="font-bold text-slate-900 dark:text-slate-100">
                            {suggestion.symbol}
                          </span>
                          {suggestion.currency && (
                            <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-400 border border-slate-200 dark:border-slate-600">
                              {suggestion.currency}
                            </span>
                          )}
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

              <div className="md:col-span-12 flex items-center justify-between mt-2">
                <div className="flex items-center gap-4">
                  <label className="flex items-center gap-2 cursor-pointer select-none">
                    <input
                      type="checkbox"
                      checked={useCustomCurrency}
                      onChange={(e) => setUseCustomCurrency(e.target.checked)}
                      className="w-4 h-4 text-emerald-600 rounded border-slate-300 focus:ring-emerald-500"
                    />
                    <span className="text-sm font-medium text-slate-700 dark:text-slate-300">
                      Use different currency
                    </span>
                  </label>

                  {useCustomCurrency && (
                    <div className="w-64">
                      <CustomSelect
                        options={CURRENCIES.map((c) => ({
                          value: c.code,
                          label: `${c.code} - ${c.name}`,
                        }))}
                        value={selectedCurrency}
                        onChange={async (val) => {
                          setSelectedCurrency(val);
                          if (val) await checkAndPrompt(val);
                        }}
                        placeholder="Select currency"
                      />
                    </div>
                  )}
                </div>

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
                    calendarStartDay={firstDayOfWeek}
                    shouldCloseOnSelect={false}
                    required
                    portalId="datepicker-portal"
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
                  <Tag className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 z-10 pointer-events-none" />
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

              <div className="md:col-span-12 flex items-center justify-between mt-2">
                <div className="flex items-center gap-4">
                  <label className="flex items-center gap-2 cursor-pointer select-none">
                    <input
                      type="checkbox"
                      checked={useCustomCurrency}
                      onChange={(e) => setUseCustomCurrency(e.target.checked)}
                      className="w-4 h-4 text-emerald-600 rounded border-slate-300 focus:ring-emerald-500"
                    />
                    <span className="text-sm font-medium text-slate-700 dark:text-slate-300">
                      Use different currency
                    </span>
                  </label>

                  {useCustomCurrency && (
                    <div className="w-64">
                      <CustomSelect
                        options={CURRENCIES.map((c) => ({
                          value: c.code,
                          label: `${c.code} - ${c.name}`,
                        }))}
                        value={selectedCurrency}
                        onChange={async (val) => {
                          setSelectedCurrency(val);
                          if (val) await checkAndPrompt(val);
                        }}
                        placeholder="Select currency"
                      />
                    </div>
                  )}
                </div>

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
                <th
                  onClick={() => handleSort("date")}
                  className="px-6 py-4 text-left text-xs font-bold !text-slate-700 dark:!text-slate-300 uppercase tracking-wider w-32 cursor-pointer select-none hover:bg-slate-50 dark:hover:bg-slate-700 transition-colors"
                >
                  <div className="flex items-center gap-1">
                    Date {getSortIcon("date")}
                  </div>
                </th>
                {account.id === "all" && (
                  <th
                    onClick={() => handleSort("account_name")}
                    className="px-6 py-4 text-left text-xs font-bold !text-slate-700 dark:!text-slate-300 uppercase tracking-wider min-w-[10rem] cursor-pointer select-none hover:bg-slate-50 dark:hover:bg-slate-700 transition-colors"
                  >
                    <div className="flex items-center gap-1">
                      Account {getSortIcon("account_name")}
                    </div>
                  </th>
                )}
                <th
                  onClick={() => handleSort("payee")}
                  className="px-6 py-4 text-left text-xs font-bold !text-slate-700 dark:!text-slate-300 uppercase tracking-wider cursor-pointer select-none hover:bg-slate-50 dark:hover:bg-slate-700 transition-colors"
                >
                  <div className="flex items-center gap-1">
                    Payee {getSortIcon("payee")}
                  </div>
                </th>
                <th
                  onClick={() => handleSort("category")}
                  className="px-6 py-4 text-left text-xs font-bold !text-slate-700 dark:!text-slate-300 uppercase tracking-wider min-w-[10rem] cursor-pointer select-none hover:bg-slate-50 dark:hover:bg-slate-700 transition-colors"
                >
                  <div className="flex items-center gap-1">
                    Category {getSortIcon("category")}
                  </div>
                </th>
                <th
                  onClick={() => handleSort("notes")}
                  className="px-6 py-4 text-left text-xs font-bold !text-slate-700 dark:!text-slate-300 uppercase tracking-wider cursor-pointer select-none hover:bg-slate-50 dark:hover:bg-slate-700 transition-colors"
                >
                  <div className="flex items-center gap-1">
                    {t("account.notes")} {getSortIcon("notes")}
                  </div>
                </th>
                {hasInvestment && (
                  <>
                    <th
                      onClick={() => handleSort("ticker")}
                      className="px-6 py-4 text-left text-xs font-bold !text-slate-700 dark:!text-slate-300 uppercase tracking-wider min-w-[5rem] cursor-pointer select-none hover:bg-slate-50 dark:hover:bg-slate-700 transition-colors"
                    >
                      <div className="flex items-center gap-1">
                        Ticker {getSortIcon("ticker")}
                      </div>
                    </th>
                    <th
                      onClick={() => handleSort("shares")}
                      className="px-6 py-4 text-right text-xs font-bold !text-slate-700 dark:!text-slate-300 uppercase tracking-wider w-36 cursor-pointer select-none hover:bg-slate-50 dark:hover:bg-slate-700 transition-colors"
                    >
                      <div className="flex items-center justify-end gap-1">
                        Shares {getSortIcon("shares")}
                      </div>
                    </th>
                    <th
                      onClick={() => handleSort("price_per_share")}
                      className="px-6 py-4 text-right text-xs font-bold !text-slate-700 dark:!text-slate-300 uppercase tracking-wider w-36 cursor-pointer select-none hover:bg-slate-50 dark:hover:bg-slate-700 transition-colors"
                    >
                      <div className="flex items-center justify-end gap-1">
                        Price {getSortIcon("price_per_share")}
                      </div>
                    </th>
                    <th
                      onClick={() => handleSort("fee")}
                      className="px-6 py-4 text-right text-xs font-bold !text-slate-700 dark:!text-slate-300 uppercase tracking-wider w-28 cursor-pointer select-none hover:bg-slate-50 dark:hover:bg-slate-700 transition-colors"
                    >
                      <div className="flex items-center justify-end gap-1">
                        Fee {getSortIcon("fee")}
                      </div>
                    </th>
                  </>
                )}
                <th
                  onClick={() => handleSort("amount")}
                  className="px-6 py-4 text-right text-xs font-bold !text-slate-700 dark:!text-slate-300 uppercase tracking-wider w-36 cursor-pointer select-none hover:bg-slate-50 dark:hover:bg-slate-700 transition-colors"
                >
                  <div className="flex items-center justify-end gap-1">
                    Amount {getSortIcon("amount")}
                  </div>
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
                            calendarStartDay={firstDayOfWeek}
                            shouldCloseOnSelect={false}
                            portalId="datepicker-portal"
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
                              <div className="relative">
                                <input
                                  type="text"
                                  className="w-full p-2 text-sm border-2 border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 rounded-lg focus:ring-2 focus:ring-brand-500 outline-none uppercase"
                                  value={editForm.ticker || ""}
                                  onChange={(e) => {
                                    const val = e.target.value.toUpperCase();
                                    setEditForm({
                                      ...editForm,
                                      ticker: val,
                                    });
                                    handleTickerChange(val);
                                  }}
                                />
                                {tickerSuggestions.length > 0 && (
                                  <div className="absolute z-[100] w-64 mt-1 bg-white dark:bg-slate-800 border-2 border-slate-200 dark:border-slate-700 rounded-xl shadow-xl overflow-hidden">
                                    {tickerSuggestions.map((suggestion) => (
                                      <button
                                        key={suggestion.symbol}
                                        type="button"
                                        className="w-full px-4 py-3 text-left hover:bg-slate-50 dark:hover:bg-slate-700/50 flex flex-col gap-0.5 transition-colors border-b border-slate-100 dark:border-slate-700 last:border-0"
                                        onClick={() => {
                                          setEditForm({
                                            ...editForm,
                                            ticker: suggestion.symbol,
                                            currency:
                                              suggestion.currency ||
                                              editForm.currency,
                                          });
                                          setTickerSuggestions([]);
                                        }}
                                      >
                                        <div className="flex items-center justify-between">
                                          <span className="font-bold text-slate-900 dark:text-slate-100 uppercase">
                                            {suggestion.symbol}
                                          </span>
                                          {suggestion.currency && (
                                            <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-400 border border-slate-200 dark:border-slate-600">
                                              {suggestion.currency}
                                            </span>
                                          )}
                                        </div>
                                        <span className="text-xs text-slate-500 dark:text-slate-400 truncate">
                                          {suggestion.shortname ||
                                            suggestion.longname}
                                        </span>
                                      </button>
                                    ))}
                                  </div>
                                )}
                              </div>
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
                                <NumberInput
                                  value={editForm.price_per_share}
                                  onChange={(num) =>
                                    setEditForm({
                                      ...editForm,
                                      price_per_share: num,
                                    })
                                  }
                                  className="w-full p-2 text-sm border-2 border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 rounded-lg focus:ring-2 focus:ring-brand-500 outline-none text-right"
                                  maximumFractionDigits={8}
                                  useGrouping={false}
                                />
                              </div>
                            </td>

                            <td className="px-6 py-3">
                              <div className="relative">
                                <NumberInput
                                  value={editForm.fee}
                                  onChange={(num) =>
                                    setEditForm({
                                      ...editForm,
                                      fee: num,
                                    })
                                  }
                                  className="w-full p-2 text-sm border-2 border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 rounded-lg focus:ring-2 focus:ring-brand-500 outline-none text-right"
                                  maximumFractionDigits={2}
                                  minimumFractionDigits={2}
                                />
                              </div>
                            </td>

                            <td className="px-6 py-3 text-right font-bold text-slate-900 dark:text-slate-100">
                              <div className="flex flex-col items-end">
                                {(() => {
                                  const s = parseNumber(editForm.shares) || 0;
                                  const p =
                                    parseNumber(editForm.price_per_share) || 0;
                                  const totalNum = Math.abs(s) * p;
                                  const sign =
                                    editForm.payee === "Sell" || s < 0
                                      ? ""
                                      : "+";
                                  return (
                                    <span className="flex items-center gap-1 justify-end">
                                      {sign}
                                      <MaskedNumber
                                        value={totalNum}
                                        options={{
                                          style: "currency",
                                          currency:
                                            editForm.currency || appCurrency,
                                          maximumFractionDigits: 2,
                                          minimumFractionDigits: 2,
                                        }}
                                      />
                                    </span>
                                  );
                                })()}
                                {editForm.currency &&
                                  editForm.currency !== appCurrency && (
                                    <span className="text-[10px] text-slate-400 dark:text-slate-500 font-normal">
                                      {editForm.currency}
                                    </span>
                                  )}
                              </div>
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
                              <NumberInput
                                value={editForm.amount}
                                onChange={(num) =>
                                  setEditForm({
                                    ...editForm,
                                    amount: num,
                                  })
                                }
                                placeholder={formatNumber(0, {
                                  maximumFractionDigits: 2,
                                  minimumFractionDigits: 2,
                                })}
                                className="w-full p-2 text-sm border-2 border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 rounded-lg focus:ring-2 focus:ring-brand-500 outline-none text-right"
                                maximumFractionDigits={2}
                                minimumFractionDigits={2}
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
                                  <MaskedNumber
                                    value={Math.abs(tx.shares)}
                                    options={{
                                      maximumFractionDigits: 6,
                                      minimumFractionDigits: 0,
                                      useGrouping: false,
                                    }}
                                  />
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
                                  <MaskedNumber
                                    value={tx.price_per_share}
                                    options={{
                                      style: "currency",
                                      currency: tx.currency || appCurrency,
                                      maximumFractionDigits: 2,
                                      minimumFractionDigits: 2,
                                    }}
                                  />
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
                                  <MaskedNumber
                                    value={tx.fee}
                                    options={{
                                      style: "currency",
                                      currency: tx.currency || appCurrency,
                                      maximumFractionDigits: 2,
                                      minimumFractionDigits: 2,
                                    }}
                                  />
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
                          <MaskedNumber
                            value={Math.abs(tx.amount)}
                            options={{
                              style: "currency",
                              currency: tx.currency || appCurrency,
                            }}
                          />
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
      {dialog}
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
    totalValue: PropTypes.number,
    currency: PropTypes.string,
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
