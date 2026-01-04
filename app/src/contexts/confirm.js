import { createContext, useContext } from "react";

export const ConfirmContext = createContext(null);

export function useConfirm() {
  const ctx = useContext(ConfirmContext);
  if (!ctx) {
    // Fallback if provider is missing
    return () => Promise.resolve(false);
  }
  return ctx.confirm;
}
