import { createContext, useContext } from "react";

export const NumberFormatContext = createContext(null);

export function useNumberFormat() {
  const ctx = useContext(NumberFormatContext);
  if (!ctx) {
    throw new Error("useNumberFormat must be used within NumberFormatProvider");
  }
  return ctx;
}
