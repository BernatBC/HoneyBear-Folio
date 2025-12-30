import { createContext, useContext } from "react";

export const ToastContext = createContext(null);

export function useToast() {
  const ctx = useContext(ToastContext);
  // If there's no provider (e.g., in isolated tests), return a safe noop implementation
  if (!ctx) return { showToast: () => {} };
  return ctx;
}
