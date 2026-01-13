import { useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import CustomRateDialog from "../components/CustomRateDialog";

export function useCustomRate() {
  const [dialogState, setDialogState] = useState({
    isOpen: false,
    currency: "",
    resolve: null,
  });

  const checkAndPrompt = async (currency) => {
    if (!currency || currency === "USD") return true;

    try {
      // Check availability
      const isAvailable = await invoke("check_currency_availability", {
        currency,
      });

      // Check if we already have a custom rate
      const existingRate = await invoke("get_custom_exchange_rate", {
        currency,
      });

      if (isAvailable || existingRate !== null) {
        return true;
      }

      // Need to prompt
      return new Promise((resolve) => {
        setDialogState({
          isOpen: true,
          currency,
          resolve,
        });
      });
    } catch (e) {
      console.error("Failed to check currency:", e);
      return true;
    }
  };

  const handleConfirm = async (rate) => {
    const { currency, resolve } = dialogState;
    try {
      await invoke("set_custom_exchange_rate", { currency, rate });
      if (resolve) resolve(true);
    } catch (e) {
      console.error(e);
      if (resolve) resolve(false);
    }
    setDialogState({ isOpen: false, currency: "", resolve: null });
  };

  const handleCancel = () => {
    if (dialogState.resolve) dialogState.resolve(false);
    setDialogState({ isOpen: false, currency: "", resolve: null });
  };

  const dialog = (
    <CustomRateDialog
      isOpen={dialogState.isOpen}
      currency={dialogState.currency}
      onConfirm={handleConfirm}
      onCancel={handleCancel}
    />
  );

  return { checkAndPrompt, dialog };
}
