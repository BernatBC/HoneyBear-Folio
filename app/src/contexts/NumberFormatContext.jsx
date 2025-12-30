import React, { createContext, useContext, useState, useEffect } from "react";

const NumberFormatContext = createContext(null);

export function NumberFormatProvider({ children }) {
  const [locale, setLocale] = useState(() => {
    try {
      return localStorage.getItem("hb_number_format") || "en-US";
    } catch (e) {
      return "en-US";
    }
  });

  useEffect(() => {
    try {
      localStorage.setItem("hb_number_format", locale);
    } catch (e) {
      // ignore
    }
  }, [locale]);

  return (
    <NumberFormatContext.Provider value={{ locale, setLocale }}>
      {children}
    </NumberFormatContext.Provider>
  );
}

export function useNumberFormat() {
  const ctx = useContext(NumberFormatContext);
  if (!ctx) {
    throw new Error("useNumberFormat must be used within NumberFormatProvider");
  }
  return ctx;
}
