import PropTypes from "prop-types";
import { useState, useEffect } from "react";
import { X, Check, Wallet, Globe, DollarSign } from "lucide-react";
import { createPortal } from "react-dom";
import "../styles/Modal.css";
import { invoke } from "@tauri-apps/api/core";
import { t } from "../i18n/i18n"; // Assuming translation hook/function exists
import { CURRENCIES } from "../utils/currencies";
import CustomSelect from "./CustomSelect";
import { useToast } from "../contexts/toast";
import { useParseNumber } from "../utils/format";

export default function AccountModal({ onClose, onUpdate }) {
  const [name, setName] = useState("");
  const [balanceStr, setBalanceStr] = useState("");
  const [currency, setCurrency] = useState("");

  const { showToast } = useToast();
  const parseNumber = useParseNumber();

  async function handleSubmit(e) {
    e.preventDefault();
    const nameTrimmed = name.trim();

    if (nameTrimmed.length === 0) {
      showToast(t("account.error.empty_name") || "Account name cannot be empty", { type: "warning" });
      return;
    }

    try {
      const balance = parseNumber(balanceStr) || 0.0;
      await invoke("create_account", {
        name: nameTrimmed,
        balance,
        currency: currency || null,
      });
      showToast(t("account.created") || "Account created", { type: "success" });
      onUpdate();
      onClose();
    } catch (err) {
      console.error(err);
      const msg = String(err || "");
        if (msg.includes("already exists")) {
            showToast(t("error.account_exists", { name: nameTrimmed }) || `Account "${nameTrimmed}" already exists`, {
            type: "warning",
            });
        } else {
            showToast(t("error.something_went_wrong") || "Something went wrong", { type: "danger" });
        }
    }
  }

  return createPortal(
    <div className="modal-overlay">
      <div className="modal-content w-full max-w-md">
        <div className="modal-header">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-slate-800 rounded-lg border border-slate-700">
              <Wallet className="w-5 h-5 text-blue-400" />
            </div>
            <div>
              <h2 className="text-lg font-semibold text-slate-100">
                {t("account.new_account") || "New Account"}
              </h2>
              <p className="text-sm text-slate-400">
                Create a new account to track your assets
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="text-slate-400 hover:text-white transition-colors p-1 rounded-md hover:bg-slate-800"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          <div className="space-y-4">
            {/* Account Name */}
            <div>
              <label className="block text-xs font-medium text-slate-400 mb-1.5 uppercase tracking-wider">
                Account Name
              </label>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="e.g., Main Savings"
                className="w-full bg-slate-900 border border-slate-700 text-slate-100 text-sm rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 block p-2.5 placeholder-slate-500 transition-all outline-none"
                autoFocus
              />
            </div>

            {/* Initial Balance (Only for new accounts) */}
            {!isEditing && (
              <div>
                <label className="block text-xs font-medium text-slate-400 mb-1.5 uppercase tracking-wider">
                  Initial Balance
                </label>
                <div className="relative">
                  <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                     <DollarSign className="w-4 h-4 text-slate-500" />
                  </div>
                  <input
                    type="text"
                    inputMode="decimal"
                    value={balanceStr}
                    onChange={(e) => setBalanceStr(e.target.value)}
                    placeholder="0.00"
                    className="w-full bg-slate-900 border border-slate-700 text-slate-100 text-sm rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 block p-2.5 pl-9 placeholder-slate-500 transition-all outline-none"
                  />
                </div>
              </div>
            )}

            {/* Currency Selection */}
            <div>
              <label className="block text-xs font-medium text-slate-400 mb-1.5 uppercase tracking-wider">
                Currency <span className="normal-case font-normal text-slate-500">(Optional - Default used if empty)</span>
              </label>
              <CustomSelect
                value={currency}
                options={[
                  { value: "", label: "Default Currency" }, // Option to use default
                  ...CURRENCIES.map((c) => ({
                    value: c.code,
                    label: `${c.code} (${c.symbol}) - ${c.name}`,
                  })),
                ]}
                onChange={setCurrency}
                icon={Globe}
              />
            </div>
          </div>

          <div className="flex justify-end gap-3 pt-4 border-t border-slate-800 mt-6">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-sm font-medium text-slate-300 hover:text-white bg-slate-800 hover:bg-slate-700 rounded-lg transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-white bg-blue-600 hover:bg-blue-500 rounded-lg transition-colors shadow-lg shadow-blue-500/20"
            >
              <Check className="w-4 h-4" />
              Create Account
            </button>
          </div>
        </form>
      </div>
    </div>,
    document.body,
  );
}

AccountModal.propTypes = {
  onClose: PropTypes.func.isRequired,
  onUpdate: PropTypes.func.isRequired,
};
