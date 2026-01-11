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

export default function AccountModal({ onClose, onUpdate, account = null, isEditing = false }) {
  const [name, setName] = useState(account?.name || "");
  const [balanceStr, setBalanceStr] = useState("");
  const [currency, setCurrency] = useState(account?.currency || "");

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
      if (isEditing) {
        await invoke("update_account", {
          id: account.id,
          name: nameTrimmed,
          currency: currency || null,
        });
        showToast(t("account.updated") || "Account updated", { type: "success" });
      } else {
        const balance = parseNumber(balanceStr) || 0.0;
        await invoke("create_account", {
          name: nameTrimmed,
          balance,
          currency: currency || null,
        });
        showToast(t("account.created") || "Account created", { type: "success" });
      }
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
      <div className="modal-container w-full max-w-md">
        <div className="modal-header">
          <h2 className="modal-title">
            <Wallet className="w-5 h-5 text-blue-500" />
            {isEditing ? t("account.edit_account") : t("account.new_account")}
          </h2>
          <button
            onClick={onClose}
            className="modal-close-button"
            aria-label="Close"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="modal-body">
          <p className="text-sm text-slate-500 dark:text-slate-400 mb-2">
            {isEditing ? t("account.edit_description") : t("account.new_description")}
          </p>

          <div className="space-y-4">
            {/* Account Name */}
            <div>
              <label className="modal-label">
                {t("account.field.name")}
              </label>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder={t("account.placeholder.name")}
                className="w-full bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-slate-100 text-sm rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 block p-2.5 placeholder-slate-500 transition-all outline-none"
                autoFocus
              />
            </div>

            {/* Initial Balance (Only for new accounts) */}
            {!isEditing && (
              <div>
                <label className="modal-label">
                  {t("account.field.initial_balance")}
                </label>
                <div className="relative">
                  <input
                    type="text"
                    inputMode="decimal"
                    value={balanceStr}
                    onChange={(e) => setBalanceStr(e.target.value)}
                    placeholder={t("account.placeholder.balance")}
                    className="w-full bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-slate-100 text-sm rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 block p-2.5 pl-9 placeholder-slate-500 transition-all outline-none"
                  />
                </div>
              </div>
            )}

            {/* Currency Selection */}
            <div>
              <label className="modal-label flex items-center justify-between">
                <span>{t("account.field.currency")}</span>
                <span className="text-xs font-normal text-slate-500 italic uppercase">
                  {t("account.field.currency_optional")}
                </span>
              </label>
              <CustomSelect
                value={currency}
                options={[
                  { value: "", label: t("account.default_currency") },
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

          <div className="modal-footer">
            <button
              type="button"
              onClick={onClose}
              className="modal-cancel-button"
            >
              {t("account.cancel")}
            </button>
            <button
              type="submit"
              className="modal-action-button"
            >
              <Check className="w-4 h-4 text-white" />
              <span className="text-white">
                {isEditing ? t("account.save_changes") : t("account.create_account")}
              </span>
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
  account: PropTypes.object,
  isEditing: PropTypes.bool,
};
