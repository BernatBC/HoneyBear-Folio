import PropTypes from "prop-types";
import { X, Settings, SlidersHorizontal, Globe } from "lucide-react";
import { createPortal } from "react-dom";
import "../styles/Modal.css";
import "../styles/SettingsModal.css";
import { useNumberFormat } from "../contexts/number-format";
import { useTheme } from "../contexts/theme-core";
import { formatNumberWithLocale } from "../utils/format";
import { CURRENCIES } from "../utils/currencies";
import CustomSelect from "./CustomSelect";
import ErrorBoundary from "./ErrorBoundary";
import { useState, useEffect } from "react";
import { invoke } from "@tauri-apps/api/core";
import { save } from "@tauri-apps/plugin-dialog";

export default function SettingsModal({ onClose }) {
  const { locale, setLocale, currency, setCurrency } = useNumberFormat();
  const { theme, setTheme } = useTheme();
  const [dbPath, setDbPath] = useState("");

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
    } catch {
      /* ignore */
    }
    setLocale("en-US");
    setCurrency("USD");
    setTheme("system");
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
              Settings
            </h2>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={handleResetDefaults}
                className="bg-slate-700 hover:bg-slate-600 text-white text-sm py-1 px-2 rounded"
                title="Reset to defaults"
              >
                Reset to defaults
              </button>
              <button onClick={onClose} className="modal-close-button" aria-label="Close settings">
                <X className="w-5 h-5" />
              </button>
            </div>
          </div>

          <div className="settings-content flex">
            <div className="settings-tabs" role="tablist" aria-label="Settings tabs">
              <button
                role="tab"
                aria-selected={activeTab === "general"}
                onClick={() => setActiveTab("general")}
                className={`settings-tab ${activeTab === "general" ? "settings-tab-active" : ""}`}
              >
                <SlidersHorizontal className="w-4 h-4 text-slate-400" />
                <span>General</span>
              </button>
              <button
                role="tab"
                aria-selected={activeTab === "formats"}
                onClick={() => setActiveTab("formats")}
                className={`settings-tab ${activeTab === "formats" ? "settings-tab-active" : ""}`}
              >
                <Globe className="w-4 h-4 text-slate-400" />
                <span>Formats</span>
              </button>
            </div>

            <div className="modal-body flex-1">
              {activeTab === "general" && (
                <>
                  <div className="flex items-center justify-between">
                    <label className="modal-label">General</label>
                  </div>

                  <div className="flex items-center justify-between mt-6">
                    <label className="modal-label">Theme</label>
                  </div>
                  <div className="relative settings-select">
                    <CustomSelect
                      value={theme}
                      onChange={(v) => setTheme(v)}
                      options={[
                        { value: "light", label: "Light" },
                        { value: "dark", label: "Dark" },
                        { value: "system", label: "System" },
                      ]}
                      placeholder={"Select theme"}
                      fullWidth={false}
                    />
                  </div>

                  <div className="flex items-center justify-between mt-6">
                    <label className="modal-label">Database file</label>
                  </div>
                  <div className="relative">
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        className="bg-slate-700 hover:bg-slate-600 text-white text-sm py-1 px-2 rounded w-full sm:w-[20rem] max-w-full text-left overflow-hidden truncate"
                        onClick={handleSelectDb}
                        title={dbPath || "Select DB file"}
                      >
                        {dbPath && dbPath.length > 0 ? dbPath : "Select DB file"}
                      </button>
                    </div>
                  </div>
                </>
              )}

              {activeTab === "formats" && (
                <>
                  <div className="flex items-center justify-between">
                    <label className="modal-label">Currency</label>
                  </div>
                  <div className="relative settings-select">
                    <CustomSelect
                      value={currency}
                      onChange={(v) => setCurrency(v)}
                      options={CURRENCIES.map((c) => ({
                        value: c.code,
                        label: `${c.code} - ${c.name} (${c.symbol})`,
                      }))}
                      placeholder={"Select currency"}
                      fullWidth={false}
                    />
                  </div>

                  <div className="flex items-center justify-between mt-6">
                    <label className="modal-label">Number format</label>
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
                      placeholder={"Select format"}
                      fullWidth={false}
                    />
                  </div>
                  <p className="text-slate-400 mt-3">Example: {example}</p>
                </>
              )}

            </div>
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
