import PropTypes from "prop-types";
import {
  X,
  Settings,
  SlidersHorizontal,
  Globe,
  HelpCircle,
} from "lucide-react";
import { createPortal } from "react-dom";
import "../styles/Modal.css";
import "../styles/SettingsModal.css";
import { useNumberFormat } from "../contexts/number-format";
import { useTheme } from "../contexts/theme-core";
import { formatNumberWithLocale, formatDateForUI } from "../utils/format";
import { CURRENCIES } from "../utils/currencies";
import CustomSelect from "./CustomSelect";
import ErrorBoundary from "./ErrorBoundary";
import { useState, useEffect } from "react";
import { invoke } from "@tauri-apps/api/core";
import { save } from "@tauri-apps/plugin-dialog";
import { t } from "../i18n/i18n";
export default function SettingsModal({ onClose }) {
  const { locale, setLocale, currency, setCurrency, dateFormat, setDateFormat } = useNumberFormat();
  const { theme, setTheme } = useTheme();
  const [dbPath, setDbPath] = useState("");
  const [txRowPadding, setTxRowPadding] = useState(() => {
    try {
      const v = localStorage.getItem("hb_tx_row_padding");
      return v ? parseInt(v, 10) : 12;
    } catch {
      return 12;
    }
  });

  useEffect(() => {
    try {
      document.documentElement.style.setProperty(
        "--hb-tx-cell-py",
        `${txRowPadding}px`,
      );
      localStorage.setItem("hb_tx_row_padding", String(txRowPadding));
    } catch (e) {
      console.error("Failed to apply tx row padding:", e);
    }
  }, [txRowPadding]);

  // Helpful debug logs so we can see contextual values the component depends on
  try {
    console.debug("SettingsModal render", { locale, theme, currency });
  } catch (e) {
    console.error("SettingsModal failed to read context values:", e);
  }

  const example = formatNumberWithLocale(1234.56, locale, {
    style: "currency",
    currency: currency || "USD",
  });

  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        const p = await invoke("get_db_path_command");
        if (mounted) setDbPath(p);
      } catch (e) {
        console.error("Failed to fetch DB path:", e);
      }
    })();
    return () => {
      mounted = false;
    };
  }, []);

  // Tooltip positioning: compute viewport coords and show tooltip outside scrollable containers
  function showTooltip(e) {
    const el = e.currentTarget;
    try {
      const rect = el.getBoundingClientRect();
      // place tooltip to the right of the control, slightly higher than center
      el.style.setProperty(
        "--tooltip-top",
        `${rect.top + rect.height / 2 - 15}px`,
      );
      el.style.setProperty("--tooltip-left", `${rect.right - 15}px`);
      el.setAttribute("data-tooltip-visible", "true");
      el.setAttribute("data-tooltip-side", "right");
    } catch {
      // ignore measurement errors
    }
  }

  function hideTooltip(e) {
    const el = e.currentTarget;
    el.removeAttribute("data-tooltip-visible");
    el.removeAttribute("data-tooltip-side");
  }

  async function handleSelectDb() {
    try {
      const defaultPath = dbPath && dbPath.length > 0 ? dbPath : undefined;
      const path = await save({
        defaultPath,
        filters: [{ name: "SQLite", extensions: ["db", "sqlite"] }],
      });
      if (path) {
        await invoke("set_db_path", { path });
        const p = await invoke("get_db_path_command");
        setDbPath(p);
      }
    } catch (e) {
      console.error("Failed to select DB file:", e);
    }
  }

  async function handleResetDefaults() {
    try {
      localStorage.removeItem("hb_number_format");
      localStorage.removeItem("hb_currency");
      localStorage.removeItem("hb_theme");
      localStorage.removeItem("hb_tx_row_padding");
      localStorage.removeItem("hb_date_format");
    } catch {
      /* ignore */
    }
    setLocale("en-US");
    setCurrency("USD");
    setTheme("system");
    setTxRowPadding(12);
    setDateFormat("YYYY-MM-DD");
    try {
      await invoke("reset_db_path");
      const p = await invoke("get_db_path_command");
      setDbPath(p);
    } catch (e) {
      console.error("Failed to reset DB path:", e);
    }
  }

  const [activeTab, setActiveTab] = useState("general");

  const modal = (
    <div className="modal-overlay">
      <ErrorBoundary>
        <div className="modal-container settings-modal-container">
          <div className="modal-header">
            <h2 className="modal-title">
              <Settings className="w-6 h-6 text-brand-400" />
              {t("settings.title")}
            </h2>
            <div className="flex items-center gap-2">
              <button
                onClick={onClose}
                className="modal-close-button"
                aria-label="Close settings"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
          </div>

          <div className="settings-content flex">
            <div
              className="settings-tabs"
              role="tablist"
              aria-label="Settings tabs"
            >
              <button
                role="tab"
                aria-selected={activeTab === "general"}
                onClick={() => setActiveTab("general")}
                className={`settings-tab ${activeTab === "general" ? "settings-tab-active" : ""}`}
              >
                <SlidersHorizontal className="w-4 h-4 text-slate-400" />
                <span>{t("settings.general")}</span>
              </button>
              <button
                role="tab"
                aria-selected={activeTab === "formats"}
                onClick={() => setActiveTab("formats")}
                className={`settings-tab ${activeTab === "formats" ? "settings-tab-active" : ""}`}
              >
                <Globe className="w-4 h-4 text-slate-400" />
                <span>{t("settings.formats")}</span>
              </button>
            </div>

            <div className="modal-body flex-1">
              <div className="settings-section-title">
                <h3 className="settings-section-heading">
                  {activeTab === "general"
                    ? t("settings.general")
                    : t("settings.formats")}
                </h3>
              </div>
              {activeTab === "general" && (
                <>
                  <div className="flex items-center justify-between">
                    <div className="label-with-help">
                      <span
                        className="help-wrapper"
                        data-tooltip="Choose light/dark or follow system preference."
                        role="button"
                        tabIndex={0}
                        aria-label="Choose light/dark or follow system preference"
                        onMouseEnter={showTooltip}
                        onFocus={showTooltip}
                        onMouseLeave={hideTooltip}
                        onBlur={hideTooltip}
                      >
                        <HelpCircle
                          className="w-4 h-4 text-slate-400 help-icon"
                          aria-hidden="true"
                        />
                      </span>
                      <label className="modal-label">
                        {t("settings.theme")}
                      </label>
                    </div>
                  </div>
                  <div className="relative settings-select">
                    <CustomSelect
                      value={theme}
                      onChange={(v) => setTheme(v)}
                      options={[
                        { value: "light", label: t("settings.theme.light") },
                        { value: "dark", label: t("settings.theme.dark") },
                        { value: "system", label: t("settings.theme.system") },
                      ]}
                      placeholder={t("settings.select_theme_placeholder")}
                      fullWidth={false}
                    />
                  </div>

                  <div className="flex items-center justify-between">
                    <div className="label-with-help">
                      <span
                        className="help-wrapper"
                        data-tooltip="Path to your local SQLite database file."
                        role="button"
                        tabIndex={0}
                        aria-label="Path to your local SQLite database file"
                        onMouseEnter={showTooltip}
                        onFocus={showTooltip}
                        onMouseLeave={hideTooltip}
                        onBlur={hideTooltip}
                      >
                        <HelpCircle
                          className="w-4 h-4 text-slate-400 help-icon"
                          aria-hidden="true"
                        />
                      </span>
                      <label className="modal-label">
                        {t("settings.database_file")}
                      </label>
                    </div>
                  </div>
                  <div className="relative">
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        className="bg-white dark:bg-slate-700 text-slate-700 dark:text-white text-sm py-1 px-2 rounded w-full sm:w-[20rem] max-w-full text-left overflow-hidden truncate border border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-700 transition-all"
                        onClick={handleSelectDb}
                        data-tooltip={dbPath || t("settings.select_db_file")}
                        aria-label={dbPath || t("settings.select_db_file")}
                        onMouseEnter={showTooltip}
                        onFocus={showTooltip}
                        onMouseLeave={hideTooltip}
                        onBlur={hideTooltip}
                      >
                        {dbPath && dbPath.length > 0
                          ? dbPath
                          : t("settings.select_db_file")}
                      </button>
                    </div>
                  </div>

                  <div className="flex items-center justify-between mt-4">
                    <div className="label-with-help">
                      <span
                        className="help-wrapper"
                        data-tooltip="Adjust row padding to control transaction row height
                      (smaller = more rows)."
                        role="button"
                        tabIndex={0}
                        aria-label="Adjusts padding inside each transaction row (affects visible rows)"
                        onMouseEnter={showTooltip}
                        onFocus={showTooltip}
                        onMouseLeave={hideTooltip}
                        onBlur={hideTooltip}
                      >
                        <HelpCircle
                          className="w-4 h-4 text-slate-400 help-icon"
                          aria-hidden="true"
                        />
                      </span>
                      <label className="modal-label">
                        {t("settings.transaction_row_height")}
                      </label>
                    </div>
                    <div className="text-sm text-slate-500">
                      {txRowPadding}px
                    </div>
                  </div>
                  <div className="relative mt-1 settings-slider">
                    <input
                      type="range"
                      min={4}
                      max={24}
                      step={1}
                      value={txRowPadding}
                      onChange={(e) => setTxRowPadding(Number(e.target.value))}
                      className="w-full"
                      aria-label={t("settings.transaction_row_height")}
                    />
                  </div>
                </>
              )}

              {activeTab === "formats" && (
                <>
                  <div className="flex items-center justify-between">
                    <div className="label-with-help">
                      <span
                        className="help-wrapper"
                        data-tooltip="Default currency used by the app when formatting amounts."
                        role="button"
                        tabIndex={0}
                        aria-label="Default currency used by the app when formatting amounts"
                        onMouseEnter={showTooltip}
                        onFocus={showTooltip}
                        onMouseLeave={hideTooltip}
                        onBlur={hideTooltip}
                      >
                        <HelpCircle
                          className="w-4 h-4 text-slate-400 help-icon"
                          aria-hidden="true"
                        />
                      </span>
                      <label className="modal-label">
                        {t("settings.currency")}
                      </label>
                    </div>
                  </div>
                  <div className="relative settings-select">
                    <CustomSelect
                      value={currency}
                      onChange={(v) => setCurrency(v)}
                      options={CURRENCIES.map((c) => ({
                        value: c.code,
                        label: `${c.code} - ${c.name} (${c.symbol})`,
                      }))}
                      placeholder={t("settings.select_currency_placeholder")}
                      fullWidth={false}
                    />
                  </div>

                  <div className="flex items-center justify-between">
                    <div className="label-with-help">
                      <span
                        className="help-wrapper"
                        data-tooltip="Choose how numbers are grouped and decimal separators are shown."
                        role="button"
                        tabIndex={0}
                        aria-label="Choose how numbers are grouped and decimal separators are shown"
                        onMouseEnter={showTooltip}
                        onFocus={showTooltip}
                        onMouseLeave={hideTooltip}
                        onBlur={hideTooltip}
                      >
                        <HelpCircle
                          className="w-4 h-4 text-slate-400 help-icon"
                          aria-hidden="true"
                        />
                      </span>
                      <label className="modal-label">
                        {t("settings.number_format")}
                      </label>
                    </div>
                  </div>

                  <div className="relative settings-select">
                    <CustomSelect
                      value={locale}
                      onChange={(v) => setLocale(v)}
                      options={[
                        { value: "en-US", label: "1,234.56" },
                        { value: "de-DE", label: "1.234,56" },
                        { value: "fr-FR", label: "1 234,56" },
                        { value: "de-CH", label: "1'234.56" },
                        { value: "en-IN", label: "1,23,456.78" },
                      ]}
                      placeholder={t("settings.select_format_placeholder")}
                      fullWidth={false}
                    />
                  </div>
                  <p className="text-slate-400 mt-3">
                    {t("settings.example", { example })}
                  </p>

                  <div className="flex items-center justify-between mt-4">
                    <div className="label-with-help">
                      <span
                        className="help-wrapper"
                        data-tooltip="Choose how dates are shown in the app. This affects only UI display and will NOT change import/export formats."
                        role="button"
                        tabIndex={0}
                        aria-label="Choose how dates are shown in the app"
                        onMouseEnter={showTooltip}
                        onFocus={showTooltip}
                        onMouseLeave={hideTooltip}
                        onBlur={hideTooltip}
                      >
                        <HelpCircle
                          className="w-4 h-4 text-slate-400 help-icon"
                          aria-hidden="true"
                        />
                      </span>
                      <label className="modal-label">
                        {t("settings.date_format")}
                      </label>
                    </div>
                  </div>
                  <div className="relative settings-select">
                    <CustomSelect
                      value={dateFormat}
                      onChange={(v) => setDateFormat(v)}
                      options={[
                        { value: "YYYY-MM-DD", label: "2026-01-03" },
                        { value: "YYYY/MM/DD", label: "2026/01/03" },
                        { value: "MM/DD/YYYY", label: "01/03/2026" },
                        { value: "DD/MM/YYYY", label: "03/01/2026" },
                        { value: "DD-MM-YYYY", label: "03-01-2026" },
                        { value: "DD.MM.YYYY", label: "03.01.2026" },
                        { value: "DD MMM YYYY", label: "03 Jan 2026" },
                        { value: "MMM DD, YYYY", label: "Jan 03, 2026" },
                        { value: "MMMM D, YYYY", label: "January 3, 2026" },
                      ]}
                      placeholder={t("settings.select_date_format_placeholder")}
                      fullWidth={false}
                    />
                  </div>
                  <p className="text-slate-400 mt-3">
                    {t("settings.example_date", { example: formatDateForUI("2026-01-03", dateFormat, locale) })}
                  </p>
                </>
              )}
            </div>
          </div>

          <div className="modal-footer">
            <button
              type="button"
              onClick={handleResetDefaults}
              className="reset-button"
              data-tooltip="Reset to defaults"
              aria-label="Reset to defaults"
            >
              Reset to defaults
            </button>
          </div>
        </div>
      </ErrorBoundary>
    </div>
  );

  if (typeof document === "undefined") return null;
  return createPortal(modal, document.body);
}

SettingsModal.propTypes = {
  onClose: PropTypes.func.isRequired,
};
