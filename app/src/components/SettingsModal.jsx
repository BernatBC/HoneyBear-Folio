import PropTypes from "prop-types";
import { X, Settings } from "lucide-react";
import { createPortal } from "react-dom";
import "../styles/SettingsModal.css";
import { useNumberFormat } from "../contexts/number-format";
import { useTheme } from "../contexts/theme-core";
import { formatNumberWithLocale } from "../utils/format";
import CustomSelect from "./CustomSelect";
import ErrorBoundary from "./ErrorBoundary";

export default function SettingsModal({ onClose }) {
  const { locale, setLocale } = useNumberFormat();
  const { theme, setTheme } = useTheme();

  // Helpful debug logs so we can see exactly what's causing the ErrorBoundary to trigger
  try {
    // Log contextual values that the component depends on
    console.debug("SettingsModal render", { locale, theme });
  } catch (err) {
    console.error("SettingsModal failed to read context values:", err);
  }

  const example = formatNumberWithLocale(1234.56, locale);

  let modal;
  try {
    modal = (
      <div className="modal-overlay">
        <ErrorBoundary>
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
                  placeholder={"Select format"}
                />
              </div>
              <p className="text-slate-400 mt-3">Example: {example}</p>

              <div className="flex items-center justify-between mt-6">
                <label className="modal-label">Theme</label>
              </div>
              <div className="relative">
                <CustomSelect
                  value={theme}
                  onChange={(v) => setTheme(v)}
                  options={[
                    { value: "light", label: "Light" },
                    { value: "dark", label: "Dark" },
                    { value: "system", label: "System" },
                  ]}
                  placeholder={"Select theme"}
                />
              </div>
            </div>
          </div>
        </ErrorBoundary>
      </div>
    );
  } catch (err) {
    console.error("Error while rendering SettingsModal:", err);
    // Re-throw to let the ErrorBoundary (and global handlers) display the overlay
    throw err;
  }

  if (typeof document === "undefined") return null;
  return createPortal(modal, document.body);
}

SettingsModal.propTypes = {
  onClose: PropTypes.func.isRequired,
};
