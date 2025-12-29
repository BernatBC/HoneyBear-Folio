import { useState } from "react";
import PropTypes from "prop-types";
import { invoke } from "@tauri-apps/api/core";
import ImportModal from "./ImportModal";
import ExportModal from "./ExportModal";
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
} from "lucide-react";
import packageJson from "../../package.json";
import "../styles/Sidebar.css";

export default function Sidebar({
  accounts,
  marketValues,
  selectedId,
  onSelectAccount,
  onUpdate,
}) {
  const [isAdding, setIsAdding] = useState(false);
  const [showImportModal, setShowImportModal] = useState(false);
  const [showExportModal, setShowExportModal] = useState(false);
  const [newAccountName, setNewAccountName] = useState("");
  const [newAccountBalance, setNewAccountBalance] = useState("");
  const [newAccountType, setNewAccountType] = useState("cash");

  const totalBalance = accounts.reduce((sum, acc) => {
    if (acc.kind === "brokerage") {
      return (
        sum +
        (marketValues[acc.id] !== undefined
          ? marketValues[acc.id]
          : acc.balance)
      );
    }
    return sum + acc.balance;
  }, 0);

  async function handleAddAccount(e) {
    e.preventDefault();
    try {
      await invoke("create_account", {
        name: newAccountName,
        balance: parseFloat(newAccountBalance) || 0.0,
        kind: newAccountType,
      });
      setNewAccountName("");
      setNewAccountBalance("");
      setNewAccountType("cash");
      setIsAdding(false);
      onUpdate();
    } catch (e) {
      console.error("Failed to create account:", e);
    }
  }

  const handleSelect = (id) => {
    onSelectAccount(id);
  };

  return (
    <div className="sidebar-container">
      {/* Header */}
      <div className="sidebar-header">
        <div className="sidebar-logo-container">
          <div className="sidebar-logo-icon">
            <Wallet className="w-6 h-6 text-white" />
          </div>
          <div>
            <h1 className="sidebar-title">HoneyBear Folio</h1>
            <p className="sidebar-subtitle">Portfolio Tracker</p>
          </div>
        </div>

        {/* Net Worth Card */}
        <div className="net-worth-card">
          <div className="net-worth-label">
            <TrendingUp className="w-3.5 h-3.5" />
            Net Worth
          </div>
          <div className="net-worth-value">
            {totalBalance.toLocaleString("en-US", {
              minimumFractionDigits: 2,
              maximumFractionDigits: 2,
            })}{" "}
            €
          </div>
        </div>
      </div>

      {/* Navigation */}
      <div className="sidebar-nav">
        <div>
          <h2 className="sidebar-section-title">Overview</h2>
          <div className="space-y-1">
            <button
              onClick={() => handleSelect("dashboard")}
              className={`sidebar-nav-item group ${
                selectedId === "dashboard"
                  ? "sidebar-nav-item-active"
                  : "sidebar-nav-item-inactive"
              }`}
            >
              <LayoutDashboard
                className={`sidebar-nav-icon ${selectedId === "dashboard" ? "sidebar-nav-icon-active" : "sidebar-nav-icon-inactive"}`}
              />
              <span className="font-medium">Dashboard</span>
            </button>

            <button
              onClick={() => handleSelect("investment-dashboard")}
              className={`sidebar-nav-item group ${
                selectedId === "investment-dashboard"
                  ? "sidebar-nav-item-active"
                  : "sidebar-nav-item-inactive"
              }`}
            >
              <PieChart
                className={`sidebar-nav-icon ${selectedId === "investment-dashboard" ? "sidebar-nav-icon-active" : "sidebar-nav-icon-inactive"}`}
              />
              <span className="font-medium">Investments</span>
            </button>

            <button
              onClick={() => handleSelect("fire-calculator")}
              className={`sidebar-nav-item group ${
                selectedId === "fire-calculator"
                  ? "sidebar-nav-item-active"
                  : "sidebar-nav-item-inactive"
              }`}
            >
              <Calculator
                className={`sidebar-nav-icon ${selectedId === "fire-calculator" ? "sidebar-nav-icon-active" : "sidebar-nav-icon-inactive"}`}
              />
              <span className="font-medium">FIRE Calculator</span>
            </button>

            <button
              onClick={() => handleSelect("all")}
              className={`sidebar-nav-item group ${
                selectedId === "all"
                  ? "sidebar-nav-item-active"
                  : "sidebar-nav-item-inactive"
              }`}
            >
              <List
                className={`sidebar-nav-icon ${selectedId === "all" ? "sidebar-nav-icon-active" : "sidebar-nav-icon-inactive"}`}
              />
              <span className="font-medium">All Transactions</span>
            </button>
          </div>
        </div>

        {/* Cash Accounts */}
        <div>
          <div className="sidebar-section-header">
            <h2 className="sidebar-section-title-inline">Cash Accounts</h2>
            <button
              onClick={() => {
                setIsAdding(true);
                setNewAccountType("cash");
              }}
              className="sidebar-add-button"
            >
              <Plus className="w-4 h-4" />
            </button>
          </div>

          <div className="space-y-1">
            {accounts
              .filter((acc) => acc.kind === "cash")
              .map((account) => (
                <button
                  key={account.id}
                  onClick={() => handleSelect(account.id)}
                  className={`sidebar-nav-item justify-between group ${
                    selectedId === account.id
                      ? "sidebar-nav-item-active"
                      : "sidebar-nav-item-inactive"
                  }`}
                >
                  <div className="flex items-center gap-3">
                    <CreditCard
                      className={`sidebar-nav-icon ${selectedId === account.id ? "sidebar-nav-icon-active" : "sidebar-nav-icon-inactive"}`}
                    />
                    <span className="font-medium truncate max-w-[120px]">
                      {account.name}
                    </span>
                  </div>
                  <span
                    className={`text-sm font-medium ${selectedId === account.id ? "text-blue-100" : "text-slate-500 group-hover:text-slate-300"}`}
                  >
                    {account.balance.toLocaleString("en-US", {
                      minimumFractionDigits: 2,
                      maximumFractionDigits: 2,
                    })}{" "}
                    €
                  </span>
                </button>
              ))}
          </div>
        </div>

        {/* Brokerage Accounts */}
        <div>
          <div className="sidebar-section-header">
            <h2 className="sidebar-section-title-inline">Brokerage Accounts</h2>
            <button
              onClick={() => {
                setIsAdding(true);
                setNewAccountType("brokerage");
              }}
              className="sidebar-add-button"
            >
              <Plus className="w-4 h-4" />
            </button>
          </div>

          <div className="space-y-1">
            {accounts
              .filter((acc) => acc.kind === "brokerage")
              .map((account) => (
                <button
                  key={account.id}
                  onClick={() => handleSelect(account.id)}
                  className={`sidebar-nav-item justify-between group ${
                    selectedId === account.id
                      ? "sidebar-nav-item-active"
                      : "sidebar-nav-item-inactive"
                  }`}
                >
                  <div className="flex items-center gap-3">
                    <TrendingUp
                      className={`sidebar-nav-icon ${selectedId === account.id ? "sidebar-nav-icon-active" : "sidebar-nav-icon-inactive"}`}
                    />
                    <span className="font-medium truncate max-w-[120px]">
                      {account.name}
                    </span>
                  </div>
                  <span
                    className={`text-sm font-medium ${selectedId === account.id ? "text-blue-100" : "text-slate-500 group-hover:text-slate-300"}`}
                  >
                    {(marketValues[account.id] !== undefined
                      ? marketValues[account.id]
                      : account.balance
                    ).toLocaleString("en-US", {
                      minimumFractionDigits: 2,
                      maximumFractionDigits: 2,
                    })}{" "}
                    €
                  </span>
                </button>
              ))}
          </div>
        </div>
        {isAdding && (
          <div className="sidebar-form-container">
            <form onSubmit={handleAddAccount} className="sidebar-form">
              <div className="sidebar-form-header">
                <span className="sidebar-form-title">
                  New {newAccountType === "cash" ? "Cash" : "Brokerage"} Account
                </span>
                <button
                  type="button"
                  onClick={() => setIsAdding(false)}
                  className="sidebar-form-close"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
              <input
                type="text"
                placeholder="Account Name"
                value={newAccountName}
                onChange={(e) => setNewAccountName(e.target.value)}
                className="sidebar-input"
                autoFocus
              />
              <input
                type="number"
                step="0.01"
                placeholder="Initial Balance"
                value={newAccountBalance}
                onChange={(e) => setNewAccountBalance(e.target.value)}
                className="sidebar-input"
              />
              <button type="submit" className="sidebar-submit-button">
                <Check className="w-4 h-4" />
                <span className="text-white">Create Account</span>
              </button>
            </form>
          </div>
        )}
      </div>

      {/* Footer */}
      <div className="sidebar-footer">
        <div className="sidebar-footer-buttons">
          <button
            onClick={() => setShowImportModal(true)}
            className="sidebar-footer-button"
          >
            <Upload className="w-4 h-4" />
            <span className="text-xs font-medium">Import</span>
          </button>
          <button
            onClick={() => setShowExportModal(true)}
            className="sidebar-footer-button"
          >
            <Download className="w-4 h-4" />
            <span className="text-xs font-medium">Export</span>
          </button>
        </div>
        <div className="sidebar-version">
          v{packageJson.version} • HoneyBear Folio
        </div>
      </div>

      {showImportModal && (
        <ImportModal
          onClose={() => setShowImportModal(false)}
          onImportComplete={() => {
            onUpdate();
          }}
        />
      )}

      {showExportModal && (
        <ExportModal onClose={() => setShowExportModal(false)} />
      )}
    </div>
  );
}

Sidebar.propTypes = {
  accounts: PropTypes.arrayOf(
    PropTypes.shape({
      id: PropTypes.oneOfType([PropTypes.string, PropTypes.number]).isRequired,
      name: PropTypes.string.isRequired,
      balance: PropTypes.number.isRequired,
      kind: PropTypes.string.isRequired,
    }),
  ).isRequired,
  marketValues: PropTypes.object.isRequired,
  selectedId: PropTypes.oneOfType([PropTypes.string, PropTypes.number])
    .isRequired,
  onSelectAccount: PropTypes.func.isRequired,
  onUpdate: PropTypes.func.isRequired,
};
