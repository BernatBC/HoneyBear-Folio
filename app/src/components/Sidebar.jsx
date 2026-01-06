import { useState } from "react";
import PropTypes from "prop-types";
import { invoke } from "@tauri-apps/api/core";
import ImportModal from "./ImportModal";
import ExportModal from "./ExportModal";
import SettingsModal from "./SettingsModal";
import AccountList from "./AccountList";
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
  Settings,
  Eye,
  EyeOff,
} from "lucide-react";
import { getDisplayVersion, IS_RELEASE } from "../utils/version";
import { computeNetWorth } from "../utils/networth";
import { t } from "../i18n/i18n";
import "../styles/Sidebar.css";
import { useFormatNumber, useParseNumber } from "../utils/format";
import { usePrivacy } from "../contexts/privacy";

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
  const [showSettingsModal, setShowSettingsModal] = useState(false);
  const [newAccountName, setNewAccountName] = useState("");
  const [newAccountBalance, setNewAccountBalance] = useState("");
  const [newAccountType, setNewAccountType] = useState("cash");

  // Compute total balance using helper so logic is shared with Dashboard/App
  const totalBalance = computeNetWorth(accounts, marketValues);
  const formatNumber = useFormatNumber();
  const formattedTotalBalance = formatNumber(totalBalance, { style: "currency" });
  const parseNumber = useParseNumber();
  const { isPrivacyMode, togglePrivacyMode } = usePrivacy();

  async function handleAddAccount(e) {
    e.preventDefault();
    try {
      const balance =
        newAccountType === "cash" ? parseNumber(newAccountBalance) || 0.0 : 0.0;
      await invoke("create_account", {
        name: newAccountName,
        balance,
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
            <h1 className="sidebar-title">{t("sidebar.title")}</h1>
            <p className="sidebar-subtitle">{t("sidebar.subtitle")}</p>
          </div>
        </div>

        {/* Net Worth Card */}
        <div className="net-worth-card">
          <div className="flex items-center justify-between mb-2">
            <div className="net-worth-label !mb-0">
              <TrendingUp className="w-3.5 h-3.5" />
              {t("sidebar.net_worth")}
            </div>
            <button
              onClick={togglePrivacyMode}
              className="text-slate-400 hover:text-white transition-colors p-1 rounded-md hover:bg-slate-700/50"
              title={
                isPrivacyMode
                  ? t("sidebar.show_values")
                  : t("sidebar.hide_values")
              }
            >
              {isPrivacyMode ? (
                <EyeOff className="w-4 h-4" />
              ) : (
                <Eye className="w-4 h-4" />
              )}
            </button>
          </div>
          <div
            className={`net-worth-value ${
              formattedTotalBalance.length > 20
                ? "text-lg"
                : formattedTotalBalance.length > 15
                  ? "text-xl"
                  : "text-2xl"
            }`}
          >
            {formattedTotalBalance}
          </div>
        </div>
      </div>

      {/* Navigation */}
      <div className="sidebar-nav">
        <div>
          <h2 className="sidebar-section-title">{t("nav.overview")}</h2>
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
              <span className="font-medium">{t("nav.dashboard")}</span>
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
              <span className="font-medium">{t("nav.investments")}</span>
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
              <span className="font-medium">{t("nav.fire_calculator")}</span>
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
              <span className="font-medium">{t("nav.all_transactions")}</span>
            </button>
          </div>
        </div>

        {/* Cash Accounts */}
        <div>
          <div className="sidebar-section-header">
            <h2 className="sidebar-section-title-inline">
              {t("accounts.cash")}
            </h2>
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

          <AccountList
            accounts={accounts}
            kind="cash"
            selectedId={selectedId}
            onSelectAccount={onSelectAccount}
            Icon={CreditCard}
          />
        </div>

        {/* Brokerage Accounts */}
        <div>
          <div className="sidebar-section-header">
            <h2 className="sidebar-section-title-inline">
              {t("accounts.brokerage")}
            </h2>
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

          <AccountList
            accounts={accounts}
            kind="brokerage"
            selectedId={selectedId}
            onSelectAccount={onSelectAccount}
            marketValues={marketValues}
            Icon={TrendingUp}
          />
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
              {newAccountType === "cash" && (
                <input
                  type="text"
                  inputMode="decimal"
                  placeholder="Initial Balance"
                  value={newAccountBalance}
                  onChange={(e) => setNewAccountBalance(e.target.value)}
                  className="sidebar-input"
                />
              )}
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
            <span className="text-xs font-medium">{t("footer.import")}</span>
          </button>
          <button
            onClick={() => setShowExportModal(true)}
            className="sidebar-footer-button"
          >
            <Download className="w-4 h-4" />
            <span className="text-xs font-medium">{t("footer.export")}</span>
          </button>
          <button
            onClick={() => setShowSettingsModal(true)}
            className="sidebar-footer-button"
          >
            <Settings className="w-4 h-4" />
            <span className="text-xs font-medium">{t("footer.settings")}</span>
          </button>
        </div>
        <div className="sidebar-version">
          {IS_RELEASE ? `v${getDisplayVersion()}` : getDisplayVersion()} •
          {t("footer.version_suffix")}
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

      {showSettingsModal && (
        <SettingsModal onClose={() => setShowSettingsModal(false)} />
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
