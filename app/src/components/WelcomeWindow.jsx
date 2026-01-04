import { useState, useEffect } from "react";
import { useTheme } from "../contexts/theme-core";
import { useNumberFormat } from "../contexts/number-format";
import { CURRENCIES } from "../utils/currencies";
import CustomSelect from "./CustomSelect";
import { t } from "../i18n/i18n";
import { Check } from "lucide-react";
import "../styles/Modal.css";

export default function WelcomeWindow() {
  const [isVisible, setIsVisible] = useState(false);
  const { theme, setTheme } = useTheme();
  const {
    locale,
    setLocale,
    currency,
    setCurrency,
    dateFormat,
    setDateFormat,
  } = useNumberFormat();

  useEffect(() => {
    const hasRun = localStorage.getItem("hb_first_run_completed");
    if (!hasRun) {
      setIsVisible(true);
    }
  }, []);

  const handleComplete = () => {
    localStorage.setItem("hb_first_run_completed", "true");
    setIsVisible(false);
  };

  if (!isVisible) return null;

  return (
    <div className="modal-overlay" style={{ zIndex: 9999 }}>
      <div
        className="modal-container"
        style={{ maxWidth: "500px", width: "90%" }}
      >
        <div className="modal-header">
          <h2 className="modal-title text-xl font-bold">
            {t("Welcome to HoneyBear Folio")}
          </h2>
        </div>
        <div className="modal-body p-6">
          <p className="mb-6 text-slate-600 dark:text-slate-400">
            {t("Let's set up your preferences to get started.")}
          </p>

          {/* Theme Selection */}
          <div className="mb-6">
            <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">
              {t("Theme")}
            </label>
            <CustomSelect
              value={theme}
              onChange={setTheme}
              options={[
                { value: "light", label: t("settings.theme.light") },
                { value: "dark", label: t("settings.theme.dark") },
                { value: "system", label: t("settings.theme.system") },
              ]}
              placeholder={t("settings.select_theme_placeholder")}
            />
          </div>

          {/* Currency Selection */}
          <div className="mb-6">
            <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">
              {t("Currency")}
            </label>
            <CustomSelect
              value={currency}
              onChange={setCurrency}
              options={CURRENCIES.map((c) => ({
                value: c.code,
                label: `${c.code} - ${c.name} (${c.symbol})`,
              }))}
              placeholder={t("settings.select_currency_placeholder")}
            />
          </div>

          {/* Locale Selection */}
          <div className="mb-6">
            <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">
              {t("Number Format")}
            </label>
            <CustomSelect
              value={locale}
              onChange={setLocale}
              options={[
                { value: "en-US", label: "1,234.56" },
                { value: "de-DE", label: "1.234,56" },
                { value: "fr-FR", label: "1 234,56" },
                { value: "de-CH", label: "1'234.56" },
                { value: "en-IN", label: "1,23,456.78" },
              ]}
              placeholder={t("settings.select_format_placeholder")}
            />
          </div>
          {/* Date Format Selection */}
          <div className="mb-6">
            <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">
              {t("Date Format")}
            </label>
            <CustomSelect
              value={dateFormat}
              onChange={setDateFormat}
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
            />
          </div>
        </div>
        <div className="modal-footer">
          <button
            onClick={handleComplete}
            className="bg-brand-600 hover:bg-brand-700 text-white px-6 py-2 rounded-lg flex items-center gap-2 font-medium transition-colors"
          >
            <Check size={18} />
            {t("Get Started")}
          </button>
        </div>
      </div>
    </div>
  );
}
