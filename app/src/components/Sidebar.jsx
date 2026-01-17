import { useState, useMemo, useRef, useEffect } from "react";
import PropTypes from "prop-types";
import ImportModal from "./ImportModal";
import ExportModal from "./ExportModal";
import SettingsModal from "./SettingsModal";
import AccountModal from "./AccountModal";
import AccountList from "./AccountList";
import {
  Plus,
  CreditCard,
  TrendingUp,
  LayoutDashboard,
  List,
  PieChart,
  Calculator,
  Download,
  Upload,
  Settings,
  Eye,
  EyeOff,
  PanelLeftClose,
  ArrowUpDown,
} from "lucide-react";
import { computeNetWorth } from "../utils/networth";
import { t } from "../i18n/i18n";
import "../styles/Sidebar.css";
import { useFormatNumber } from "../utils/format";
import { usePrivacy } from "../contexts/privacy";

export default function Sidebar({
  accounts,
  marketValues,
  selectedId,
  onSelectAccount,
  onUpdate,
  onClose,
}) {
  const [showImportModal, setShowImportModal] = useState(false);
  const [showExportModal, setShowExportModal] = useState(false);
  const [showSettingsModal, setShowSettingsModal] = useState(false);
  const [showAccountModal, setShowAccountModal] = useState(false);

  // Compute total balance using helper so logic is shared with Dashboard/App
  const totalBalance = computeNetWorth(accounts, marketValues);
  const formatNumber = useFormatNumber();
  const formattedTotalBalance = formatNumber(totalBalance, {
    style: "currency",
  });
  const { isPrivacyMode, togglePrivacyMode } = usePrivacy();

  const [showSortMenu, setShowSortMenu] = useState(false);
  const [sortConfig, setSortConfig] = useState({
    field: "name",
    direction: "asc",
  });
  const sortMenuRef = useRef(null);

  useEffect(() => {
    function handleClickOutside(event) {
      if (sortMenuRef.current && !sortMenuRef.current.contains(event.target)) {
        setShowSortMenu(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, []);

  const sortedAccounts = useMemo(() => {
    const list = [...accounts];
    list.sort((a, b) => {
      let valA, valB;

      if (sortConfig.field === "name") {
        valA = a.name.toLowerCase();
        valB = b.name.toLowerCase();
      } else if (sortConfig.field === "balance") {
        valA = Number(a.balance);
        valB = Number(b.balance);
      } else if (sortConfig.field === "value") {
        const cashA = Number(a.balance);
        const marketA = marketValues?.[a.id] ? Number(marketValues[a.id]) : 0;
        valA = cashA + marketA;

        const cashB = Number(b.balance);
        const marketB = marketValues?.[b.id] ? Number(marketValues[b.id]) : 0;
        valB = cashB + marketB;
      }

      if (valA < valB) return sortConfig.direction === "asc" ? -1 : 1;
      if (valA > valB) return sortConfig.direction === "asc" ? 1 : -1;
      return 0;
    });
    return list;
  }, [accounts, marketValues, sortConfig]);

  const handleSort = (field, direction) => {
    setSortConfig({ field, direction });
    setShowSortMenu(false);
  };

  const handleSelect = (id) => {
    onSelectAccount(id);
  };

  return (
    <div className="sidebar-container">
      {/* Header */}
      <div className="sidebar-header">
        <div className="flex items-center justify-between mb-8">
          <div className="sidebar-logo-container mb-0">
            <img
              src="/icon.png"
              alt="HoneyBear Folio"
              className="w-10 h-10 object-contain"
            />
            <div>
              <h1 className="sidebar-title">{t("sidebar.title")}</h1>
              <p className="sidebar-subtitle">{t("sidebar.subtitle")}</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="text-slate-500 hover:text-white transition-colors p-1.5 rounded-lg hover:bg-slate-800 cursor-pointer"
            title="Hide Sidebar"
          >
            <PanelLeftClose className="w-5 h-5" />
          </button>
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

        {/* Accounts */}
        <div>
          <div className="sidebar-section-header">
            <h2 className="sidebar-section-title-inline">
              {t("accounts.accounts")}
            </h2>
            <div className="flex items-center gap-1">
              <div className="relative" ref={sortMenuRef}>
                <button
                  onClick={() => setShowSortMenu(!showSortMenu)}
                  className="sidebar-add-button"
                  title={t("sort.sort_by")}
                >
                  <ArrowUpDown className="w-3.5 h-3.5" />
                </button>
                {showSortMenu && (
                  <div className="absolute right-0 top-full mt-2 w-48 bg-slate-800 border border-slate-700 rounded-lg shadow-xl z-50 overflow-hidden">
                    <div className="py-1">
                      <div className="px-3 py-2 text-xs font-semibold text-slate-500 uppercase tracking-wider bg-slate-800/50 border-b border-slate-700/50">
                        {t("sort.sort_by")}
                      </div>
                      {[
                        {
                          label: t("sort.name_asc"),
                          field: "name",
                          dir: "asc",
                        },
                        {
                          label: t("sort.name_desc"),
                          field: "name",
                          dir: "desc",
                        },
                        {
                          label: t("sort.balance_asc"),
                          field: "balance",
                          dir: "asc",
                        },
                        {
                          label: t("sort.balance_desc"),
                          field: "balance",
                          dir: "desc",
                        },
                        {
                          label: t("sort.value_asc"),
                          field: "value",
                          dir: "asc",
                        },
                        {
                          label: t("sort.value_desc"),
                          field: "value",
                          dir: "desc",
                        },
                      ].map((opt) => (
                        <button
                          key={`${opt.field}-${opt.dir}`}
                          onClick={() => handleSort(opt.field, opt.dir)}
                          className={`w-full text-left px-3 py-2 text-sm hover:bg-slate-700 transition-colors flex items-center justify-between ${
                            sortConfig.field === opt.field &&
                            sortConfig.direction === opt.dir
                              ? "text-brand-400 bg-slate-700/50"
                              : "text-slate-300"
                          }`}
                        >
                          {opt.label}
                          {sortConfig.field === opt.field &&
                            sortConfig.direction === opt.dir && (
                              <div className="w-1.5 h-1.5 rounded-full bg-brand-500"></div>
                            )}
                        </button>
                      ))}
                    </div>
                  </div>
                )}
              </div>
              <button
                onClick={() => setShowAccountModal(true)}
                className="sidebar-add-button"
              >
                <Plus className="w-4 h-4" />
              </button>
            </div>
          </div>

          <AccountList
            accounts={sortedAccounts}
            selectedId={selectedId}
            onSelectAccount={onSelectAccount}
            marketValues={marketValues}
            Icon={CreditCard}
          />
        </div>
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

      {showAccountModal && (
        <AccountModal
          onClose={() => setShowAccountModal(false)}
          onUpdate={onUpdate}
        />
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
  onClose: PropTypes.func.isRequired,
};
