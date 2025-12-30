import PropTypes from "prop-types";
import { X, Settings, ChevronDown } from "lucide-react";
import { createPortal } from "react-dom";
import "../styles/SettingsModal.css";
import { useNumberFormat } from "../contexts/number-format";
import { useTheme } from "../contexts/ThemeContext";
import { formatNumberWithLocale } from "../utils/format";

export default function SettingsModal({ onClose }) {
  const { locale, setLocale } = useNumberFormat();
  const { theme, setTheme } = useTheme();

  const example = formatNumberWithLocale(1234.56, locale);

  const modal = (
    <div className="modal-overlay">
      <div className="modal-container">
        <div className="modal-header">
          <h2 className="modal-title">
            <Settings className="w-6 h-6 text-brand-400" />
            Settings
          </h2>
          <button onClick={onClose} className="modal-close-button">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="modal-body">
          <div className="flex items-center justify-between">
            <label className="modal-label">Number format</label>
            <button
              type="button"
              className="ml-2 bg-slate-700 hover:bg-slate-600 text-white text-sm py-1 px-2 rounded"
              onClick={() => {
                try {
                  localStorage.removeItem("hb_number_format");
                } catch {
                  /* ignore */
                }
                setLocale("en-US");
              }}
            >
              Reset to default
            </button>
          </div>

          <div className="relative">
            <select
              className="modal-select appearance-none pr-8"
              value={locale}
              onChange={(e) => setLocale(e.target.value)}
            >
              <option value="en-US">1,234.56</option>
              <option value="de-DE">1.234,56</option>
              <option value="fr-FR">1 234,56</option>
              <option value="de-CH">1&apos;234.56</option>
              <option value="en-IN">1,23,456.78</option>
            </select>
            <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none text-slate-400 w-4 h-4" />
          </div>
          <p className="text-slate-400 mt-3">Example: {example}</p>

          <div className="flex items-center justify-between mt-6">
            <label className="modal-label">Theme</label>
          </div>
          <div className="relative">
            <select
              className="modal-select appearance-none pr-8"
              value={theme}
              onChange={(e) => setTheme(e.target.value)}
            >
              <option value="light">Light</option>
              <option value="dark">Dark</option>
              <option value="system">System</option>
            </select>
            <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none text-slate-400 w-4 h-4" />
          </div>
        </div>
      </div>
    </div>
  );

  if (typeof document === "undefined") return null;
  return createPortal(modal, document.body);
}

SettingsModal.propTypes = {
  onClose: PropTypes.func.isRequired,
};
