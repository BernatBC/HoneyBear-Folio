import { useState, useEffect } from "react";
import PropTypes from "prop-types";
import { NumberFormatContext } from "./number-format";

export function NumberFormatProvider({ children }) {
  const [locale, setLocale] = useState(() => {
    try {
      return localStorage.getItem("hb_number_format") || "en-US";
    } catch {
      return "en-US";
    }
  });

  const [currency, setCurrency] = useState(() => {
    try {
      return localStorage.getItem("hb_currency") || "USD";
    } catch {
      return "USD";
    }
  });

  useEffect(() => {
    try {
      localStorage.setItem("hb_number_format", locale);
    } catch {
      // ignore
    }
  }, [locale]);

  useEffect(() => {
    try {
      localStorage.setItem("hb_currency", currency);
    } catch {
      // ignore
    }
  }, [currency]);

  return (
    <NumberFormatContext.Provider
      value={{ locale, setLocale, currency, setCurrency }}
    >
      {children}
    </NumberFormatContext.Provider>
  );
}

NumberFormatProvider.propTypes = {
  children: PropTypes.node.isRequired,
};
