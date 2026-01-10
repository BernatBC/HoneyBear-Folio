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

  const [dateFormat, setDateFormat] = useState(() => {
    try {
      return localStorage.getItem("hb_date_format") || "YYYY-MM-DD";
    } catch {
      return "YYYY-MM-DD";
    }
  });

  const [firstDayOfWeek, setFirstDayOfWeek] = useState(() => {
    try {
      const v = localStorage.getItem("hb_first_day_of_week");
      return v !== null ? parseInt(v, 10) : 1; // Default to Monday
    } catch {
      return 1;
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

  useEffect(() => {
    try {
      localStorage.setItem("hb_date_format", dateFormat);
    } catch {
      // ignore
    }
  }, [dateFormat]);

  useEffect(() => {
    try {
      localStorage.setItem("hb_first_day_of_week", String(firstDayOfWeek));
    } catch {
      // ignore
    }
  }, [firstDayOfWeek]);

  return (
    <NumberFormatContext.Provider
      value={{
        locale,
        setLocale,
        currency,
        setCurrency,
        dateFormat,
        setDateFormat,
        firstDayOfWeek,
        setFirstDayOfWeek,
      }}
    >
      {children}
    </NumberFormatContext.Provider>
  );
}

NumberFormatProvider.propTypes = {
  children: PropTypes.node.isRequired,
};
