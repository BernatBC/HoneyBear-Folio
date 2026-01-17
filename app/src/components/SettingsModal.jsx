import PropTypes from "prop-types";
import {
  Settings,
  SlidersHorizontal,
  Globe,
  HelpCircle,
  Info,
  ExternalLink,
  Github,
} from "lucide-react";
import "../styles/Modal.css";
import "../styles/SettingsModal.css";
import { Modal, ModalHeader, ModalBody, ModalFooter } from "./Modal";
import { useNumberFormat } from "../contexts/number-format";
import { useTheme } from "../contexts/theme-core";
import { formatNumberWithLocale } from "../utils/format";
import { CURRENCIES } from "../utils/currencies";
import CustomSelect from "./CustomSelect";
import ErrorBoundary from "./ErrorBoundary";
import { useState, useEffect } from "react";
import { invoke } from "@tauri-apps/api/core";
import { save } from "@tauri-apps/plugin-dialog";
import { open } from "@tauri-apps/plugin-shell";
import { t } from "../i18n/i18n";
import { formatDateForUI } from "../utils/format";
import { getDisplayVersion, IS_RELEASE, APP_VERSION } from "../utils/version";

import { useCustomRate } from "../hooks/useCustomRate";
import CONTRIBUTORS from "../config/contributors";
import THIRD_PARTY_LICENSES from "../config/licenses";
import { ChevronDown, ChevronUp } from "lucide-react";

const GITHUB_REPO = "https://github.com/BernatBC/HoneyBear-Folio";
const LICENSE_URL = `${GITHUB_REPO}/blob/main/LICENSE`;

export default function SettingsModal({ onClose }) {
  const {
    locale,
    setLocale,
    currency,
    setCurrency,
    dateFormat,
    setDateFormat,
    firstDayOfWeek,
    setFirstDayOfWeek,
  } = useNumberFormat();
  const { theme, setTheme } = useTheme();
  const [dbPath, setDbPath] = useState("");
  const { checkAndPrompt, dialog } = useCustomRate();
  const [showAllLicenses, setShowAllLicenses] = useState(false);
  const [fontSize, setFontSize] = useState(() => {
    try {
      const v = localStorage.getItem("hb_font_size");
      return v ? parseFloat(v) : 1.0;
    } catch {
      return 1.0;
    }
  });

  useEffect(() => {
    try {
      document.documentElement.style.setProperty(
        "--hb-font-size",
        `${fontSize}`,
      );
      localStorage.setItem("hb_font_size", String(fontSize));
    } catch (e) {
      console.error("Failed to apply font size:", e);
    }
  }, [fontSize]);

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

  async function openExternal(url) {
    try {
      await open(url);
    } catch (e) {
      console.error("Failed to open external URL:", e);
    }
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
      localStorage.removeItem("hb_font_size");
      localStorage.removeItem("hb_date_format");
      localStorage.removeItem("hb_first_day_of_week");
    } catch {
      /* ignore */
    }
    setLocale("en-US");
    setCurrency("USD");
    setTheme("system");
    setFontSize(1.0);
    setDateFormat("YYYY-MM-DD");
    setFirstDayOfWeek(1);
    try {
      await invoke("reset_db_path");
      const p = await invoke("get_db_path_command");
      setDbPath(p);
    } catch (e) {
      console.error("Failed to reset DB path:", e);
    }
  }

  const [activeTab, setActiveTab] = useState("general");

  // Example labels that show the current date in each available date format
  const _today = new Date();
  const dateFormatOptions = [
    { value: "YYYY-MM-DD", label: formatDateForUI(_today, "YYYY-MM-DD") },
    { value: "YYYY/MM/DD", label: formatDateForUI(_today, "YYYY/MM/DD") },
    { value: "MM/DD/YYYY", label: formatDateForUI(_today, "MM/DD/YYYY") },
    { value: "DD/MM/YYYY", label: formatDateForUI(_today, "DD/MM/YYYY") },
    { value: "DD-MM-YYYY", label: formatDateForUI(_today, "DD-MM-YYYY") },
    { value: "DD.MM.YYYY", label: formatDateForUI(_today, "DD.MM.YYYY") },
    { value: "DD MMM YYYY", label: formatDateForUI(_today, "DD MMM YYYY") },
    { value: "MMM DD, YYYY", label: formatDateForUI(_today, "MMM DD, YYYY") },
    { value: "MMMM D, YYYY", label: formatDateForUI(_today, "MMMM D, YYYY") },
  ];

  const modal = (
    <Modal onClose={onClose} size="3xl" className="settings-modal-container">
      <ErrorBoundary>
        <ModalHeader onClose={onClose}>
          <Settings className="w-6 h-6 text-brand-400" />
          {t("settings.title")}
        </ModalHeader>

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
            <button
              role="tab"
              aria-selected={activeTab === "about"}
              onClick={() => setActiveTab("about")}
              className={`settings-tab ${activeTab === "about" ? "settings-tab-active" : ""}`}
            >
              <Info className="w-4 h-4 text-slate-400" />
              <span>{t("settings.about")}</span>
            </button>
          </div>

          <ModalBody className="flex-1">
            <div className="settings-section-title">
              <h3 className="settings-section-heading">
                {activeTab === "general"
                  ? t("settings.general")
                  : activeTab === "formats"
                    ? t("settings.formats")
                    : t("settings.about")}
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
                    <label className="modal-label">{t("settings.theme")}</label>
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
                      data-tooltip="Adjust font size to control UI scale
                      (smaller = more content fits, larger = easier to read)."
                      role="button"
                      tabIndex={0}
                      aria-label="Adjusts font size of the entire application UI"
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
                      {t("settings.font_size")}
                    </label>
                  </div>
                  <div className="text-sm text-slate-500">
                    {Math.round(fontSize * 100)}%
                  </div>
                </div>
                <div className="relative mt-1 settings-slider">
                  <input
                    type="range"
                    min={0.75}
                    max={1.25}
                    step={0.05}
                    value={fontSize}
                    onChange={(e) => setFontSize(Number(e.target.value))}
                    className="w-full"
                    aria-label={t("settings.font_size")}
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
                    onChange={async (v) => {
                      setCurrency(v);
                      if (v) await checkAndPrompt(v);
                    }}
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
                    options={dateFormatOptions}
                    placeholder={t("settings.select_date_format_placeholder")}
                    fullWidth={false}
                  />
                </div>

                <div className="flex items-center justify-between mt-4">
                  <div className="label-with-help">
                    <span
                      className="help-wrapper"
                      data-tooltip="Choose the first day of the week for calendars."
                      role="button"
                      tabIndex={0}
                      aria-label="Choose the first day of the week for calendars"
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
                      {t("settings.first_day_of_week")}
                    </label>
                  </div>
                </div>
                <div className="relative settings-select">
                  <CustomSelect
                    value={firstDayOfWeek}
                    onChange={(v) => setFirstDayOfWeek(Number(v))}
                    options={[
                      { value: 1, label: t("Monday") },
                      { value: 2, label: t("Tuesday") },
                      { value: 3, label: t("Wednesday") },
                      { value: 4, label: t("Thursday") },
                      { value: 5, label: t("Friday") },
                      { value: 6, label: t("Saturday") },
                      { value: 0, label: t("Sunday") },
                    ]}
                    placeholder={t("settings.select_first_day_placeholder")}
                    fullWidth={false}
                  />
                </div>
              </>
            )}

            {activeTab === "about" && (
              <>
                {/* App Header */}
                <div className="about-header">
                  <img
                    src="/icon.png"
                    alt="HoneyBear Folio"
                    className="w-16 h-16 object-contain mb-3"
                  />
                  <h3 className="about-app-name">HoneyBear Folio</h3>
                  <div className="about-version-badge">
                    <span>{t("about.version")}:</span>
                    {IS_RELEASE && APP_VERSION ? (
                      <a
                        href={`${GITHUB_REPO}/releases/tag/v${APP_VERSION}`}
                        className="about-version-link"
                        onClick={(e) => {
                          e.preventDefault();
                          openExternal(
                            `${GITHUB_REPO}/releases/tag/v${APP_VERSION}`,
                          );
                        }}
                      >
                        v{getDisplayVersion()}
                      </a>
                    ) : (
                      <span>{getDisplayVersion()}</span>
                    )}
                  </div>
                </div>

                {/* Copyright */}
                <div className="about-section">
                  <h4 className="about-section-title">
                    {t("about.copyright")}
                  </h4>
                  <p className="about-section-content">© 2025 BernatBC</p>
                </div>

                {/* License */}
                <div className="about-section">
                  <h4 className="about-section-title">{t("about.license")}</h4>
                  <p className="about-license-text">
                    {t("about.license_text")}
                  </p>
                  <a
                    href={LICENSE_URL}
                    className="about-link"
                    onClick={(e) => {
                      e.preventDefault();
                      openExternal(LICENSE_URL);
                    }}
                  >
                    <ExternalLink className="w-3.5 h-3.5" />
                    {t("about.view_license")}
                  </a>
                </div>

                {/* Third Party Licenses */}
                <div className="about-section">
                  <h4 className="about-section-title">
                    {t("about.third_party")}
                  </h4>
                  {showAllLicenses && (
                    <ul className="about-license-list">
                      {THIRD_PARTY_LICENSES.map((l) => (
                        <li key={l.name}>
                          <a
                            href={l.url}
                            className="about-link"
                            onClick={(e) => {
                              e.preventDefault();
                              openExternal(l.url);
                            }}
                          >
                            {l.name}
                          </a>
                          <span className="about-license-meta">
                            ({l.license})
                          </span>
                        </li>
                      ))}
                    </ul>
                  )}

                  <div className="mt-2">
                    <button
                      onClick={() => setShowAllLicenses(!showAllLicenses)}
                      className="inline-flex items-center gap-1 text-xs px-2 py-1 rounded-full bg-slate-200 dark:bg-slate-600 text-slate-600 dark:text-slate-200 hover:bg-slate-300 dark:hover:bg-slate-500 transition-colors"
                    >
                      {showAllLicenses ? (
                        <>
                          <span>{t("about.third_party_hide")}</span>
                          <ChevronUp className="w-3 h-3" />
                        </>
                      ) : (
                        <>
                          <span>
                            {t("about.third_party_show", {
                              count: THIRD_PARTY_LICENSES.length,
                            })}
                          </span>
                          <ChevronDown className="w-3 h-3" />
                        </>
                      )}
                    </button>
                  </div>
                </div>

                <div className="about-divider" />

                {/* Contributors */}
                <div className="about-section">
                  <h4 className="about-section-title">
                    {t("about.contributors")}
                  </h4>
                  {CONTRIBUTORS.map((c) => {
                    const profileUrl =
                      c.github || `https://github.com/${c.username}`;
                    const avatarUrl = `https://avatars.githubusercontent.com/${c.username}?s=120&v=4`;
                    return (
                      <a
                        key={c.username}
                        href={profileUrl}
                        className="about-contributor about-contributor-link"
                        onClick={(e) => {
                          e.preventDefault();
                          openExternal(profileUrl);
                        }}
                      >
                        <img
                          src={avatarUrl}
                          alt={`${c.username} avatar`}
                          className="about-contributor-avatar"
                        />
                        <div className="about-contributor-info">
                          <span className="about-contributor-name">
                            {c.username}
                          </span>
                          <span className="about-contributor-role">
                            {t(c.roleKey)}
                          </span>
                        </div>
                      </a>
                    );
                  })}
                </div>

                <div className="about-divider" />

                {/* Links */}
                <div className="about-section">
                  <div className="about-links">
                    <a
                      href={GITHUB_REPO}
                      className="about-link"
                      onClick={(e) => {
                        e.preventDefault();
                        openExternal(GITHUB_REPO);
                      }}
                    >
                      <Github className="w-3.5 h-3.5" />
                      {t("about.github")}
                    </a>
                    <a
                      href={`${GITHUB_REPO}/issues`}
                      className="about-link"
                      onClick={(e) => {
                        e.preventDefault();
                        openExternal(`${GITHUB_REPO}/issues`);
                      }}
                    >
                      <ExternalLink className="w-3.5 h-3.5" />
                      {t("about.issues")}
                    </a>
                  </div>
                </div>
              </>
            )}
          </ModalBody>
        </div>

        <ModalFooter>
          <button
            type="button"
            onClick={handleResetDefaults}
            className="reset-button"
            data-tooltip="Reset to defaults"
            aria-label="Reset to defaults"
          >
            Reset to defaults
          </button>
        </ModalFooter>
      </ErrorBoundary>
    </Modal>
  );

  if (typeof document === "undefined") return null;
  return (
    <>
      {modal}
      {dialog}
    </>
  );
}

SettingsModal.propTypes = {
  onClose: PropTypes.func.isRequired,
};
