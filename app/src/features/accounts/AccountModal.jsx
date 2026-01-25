import PropTypes from "prop-types";
import { useState } from "react";
import { Check, Wallet, Globe } from "lucide-react";
import "../../styles/Modal.css";
import { invoke } from "@tauri-apps/api/core";
import {
  Modal,
  ModalHeader,
  ModalBody,
  ModalFooter,
} from "../../components/ui/Modal";
import { t } from "../../i18n/i18n"; // Assuming translation hook/function exists
import { CURRENCIES } from "../../utils/currencies";
import CustomSelect from "../../components/ui/CustomSelect";
import { useCustomRate } from "../../hooks/useCustomRate";
import { useToast } from "../../contexts/toast";
import { useParseNumber } from "../../utils/format";

export default function AccountModal({
  onClose,
  onUpdate,
  account = null,
  isEditing = false,
}) {
  const [name, setName] = useState(account?.name || "");
  const [balanceStr, setBalanceStr] = useState("");
  const [currency, setCurrency] = useState(account?.currency || "");

  const { showToast } = useToast();
  const parseNumber = useParseNumber();
  const { checkAndPrompt, dialog } = useCustomRate();

  async function handleSubmit(e) {
    e.preventDefault();
    const nameTrimmed = name.trim();

    if (nameTrimmed.length === 0) {
      showToast(
        t("account.error.empty_name") || "Account name cannot be empty",
        { type: "warning" },
      );
      return;
    }

    try {
      if (isEditing) {
        await invoke("update_account", {
          id: account.id,
          name: nameTrimmed,
          currency: currency || null,
        });
        showToast(t("account.updated") || "Account updated", {
          type: "success",
        });
      } else {
        const balance = parseNumber(balanceStr) || 0.0;
        await invoke("create_account", {
          name: nameTrimmed,
          balance,
          currency: currency || null,
        });
        showToast(t("account.created") || "Account created", {
          type: "success",
        });
      }
      onUpdate();
      onClose();
    } catch (err) {
      console.error(err);
      const msg = String(err || "");
      if (msg.includes("already exists")) {
        showToast(
          t("error.account_exists", { name: nameTrimmed }) ||
            `Account "${nameTrimmed}" already exists`,
          {
            type: "warning",
          },
        );
      } else {
        showToast(t("error.something_went_wrong") || "Something went wrong", {
          type: "danger",
        });
      }
    }
  }

  return (
    <Modal onClose={onClose} className="!p-6 !pb-4">
      <ModalHeader
        onClose={onClose}
        title={isEditing ? t("account.edit_account") : t("account.new_account")}
        icon={Wallet}
      />

      <ModalBody>
        <form id="account-form" onSubmit={handleSubmit} className="space-y-4">
          <p className="text-sm text-slate-500 dark:text-slate-400">
            {isEditing
              ? t("account.edit_description")
              : t("account.new_description")}
          </p>

          <div className="space-y-4">
            {/* Account Name */}
            <div>
              <label className="modal-label">{t("account.field.name")}</label>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder={t("account.placeholder.name")}
                className="form-input"
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
                    className="form-input"
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
                onChange={async (val) => {
                  setCurrency(val);
                  if (val) await checkAndPrompt(val);
                }}
                icon={Globe}
              />
            </div>
          </div>
        </form>
      </ModalBody>

      <ModalFooter>
        <button type="button" onClick={onClose} className="btn-secondary">
          {t("account.cancel")}
        </button>
        <button type="submit" form="account-form" className="btn-primary">
          <Check className="w-4 h-4 text-white" />
          <span className="text-white">
            {isEditing
              ? t("account.save_changes")
              : t("account.create_account")}
          </span>
        </button>
      </ModalFooter>
      {dialog}
    </Modal>
  );
}

AccountModal.propTypes = {
  onClose: PropTypes.func.isRequired,
  onUpdate: PropTypes.func.isRequired,
  account: PropTypes.object,
  isEditing: PropTypes.bool,
};
