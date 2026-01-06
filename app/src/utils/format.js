import { useNumberFormat } from "../contexts/number-format";
import { usePrivacy } from "../contexts/privacy";
import { CURRENCIES } from "./currencies";

export function formatNumberWithLocale(value, locale, options = {}) {
  if (value === undefined || value === null || Number.isNaN(Number(value)))
    return "";

  const opts = {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
    ...options,
  };

  const num = Number(value);

  // Custom currency formatting to respect 'position' from CURRENCIES list
  if (opts.style === "currency" && opts.currency) {
    const currencyDef = CURRENCIES.find((c) => c.code === opts.currency);
    if (currencyDef) {
      // Format the number as decimal first (preserving locale separators)
      const decimalOptions = { ...opts, style: "decimal" };
      delete decimalOptions.currency;
      delete decimalOptions.currencyDisplay;

      let formattedValue;
      try {
        formattedValue = new Intl.NumberFormat(
          locale || undefined,
          decimalOptions,
        ).format(Math.abs(num));
      } catch {
        formattedValue = Math.abs(num).toFixed(opts.maximumFractionDigits);
      }

      const symbol = currencyDef.symbol;
      const isNegative = num < 0;
      const sign = isNegative ? "-" : "";

      if (currencyDef.position === "left") {
        // Left: -$10.00 or $10.00
        return `${sign}${symbol}${formattedValue}`;
      } else {
        // Right: -10.00 € or 10.00 €
        return `${sign}${formattedValue}\u00A0${symbol}`;
      }
    }
  }

  // Try to use the provided locale, but gracefully fallback to the runtime default
  // if the locale is unsupported or an error occurs (e.g., corrupted value in localStorage).
  try {
    const formatter = new Intl.NumberFormat(
      // Use undefined to let the runtime choose the default if locale is falsy
      locale || undefined,
      opts,
    );
    return formatter.format(num);
  } catch {
    try {
      const fallback = new Intl.NumberFormat(undefined, opts);
      return fallback.format(num);
    } catch {
      // As a last resort, return a simple stringified number with fixed decimals
      return num.toFixed(opts.maximumFractionDigits);
    }
  }
}

export function useFormatNumber() {
  const { locale, currency } = useNumberFormat();
  const { isPrivacyMode } = usePrivacy();

  return (value, options = {}) => {
    const finalOptions = { ...options };
    if (finalOptions.style === "currency" && !finalOptions.currency) {
      finalOptions.currency = currency || "USD";
    }

    if (isPrivacyMode && !options?.ignorePrivacy) {
      if (finalOptions.style === "currency") {
        // Keep currency symbol visible but mask the numeric amount with
        // as many bullets as the localized numeric string length.
        const currencyDef = CURRENCIES.find(
          (c) => c.code === finalOptions.currency,
        ) ||
          CURRENCIES.find((c) => c.code === currency) || {
            symbol: finalOptions.currency || "¤",
            position: "left",
          };
        const symbol = currencyDef.symbol || finalOptions.currency || "¤";
        const isNegative = Number(value) < 0;
        const sign = isNegative ? "-" : "";

        // Build decimal options (same fraction digits as finalOptions)
        const decimalOptions = { ...finalOptions, style: "decimal" };
        delete decimalOptions.currency;
        delete decimalOptions.currencyDisplay;

        // Use the localized formatter to determine the visible numeric length
        let formattedNumeric = formatNumberWithLocale(
          value,
          locale,
          decimalOptions,
        );
        // Remove any leading sign characters that may be present
        formattedNumeric = String(formattedNumeric).replace(/^[+-]/, "");
        const len = Math.max(formattedNumeric.length, 1);
        const masked = "•".repeat(len);

        if (currencyDef.position === "left") {
          return `${sign}${symbol}${masked}`;
        } else {
          return `${sign}${masked}\u00A0${symbol}`;
        }
      }

      // Non-currency values: mask with as many bullets as the localized formatted value
      let formatted = formatNumberWithLocale(value, locale, finalOptions);
      formatted = String(formatted).replace(/^[+-]/, "");
      const length = Math.max(formatted.length, 1);
      return "•".repeat(length);
    }

    return formatNumberWithLocale(value, locale, finalOptions);
  };
}

// Parse a localized number string into a JS number.
export function parseNumberWithLocale(str, locale) {
  if (str === undefined || str === null) return NaN;
  if (typeof str === "number") return str;

  const s = String(str).trim();
  if (s === "") return NaN;

  // Normalize common whitespace characters used as group separators
  let normalized = s.replace(/\u00A0|\u202F|\s/g, "");

  try {
    const parts = new Intl.NumberFormat(locale || undefined).formatToParts(
      12345.6,
    );
    const group = parts.find((p) => p.type === "group")?.value || ",";
    const decimal = parts.find((p) => p.type === "decimal")?.value || ".";

    // Remove group separators
    if (group) {
      const escapedGroup = group.replace(/[-/\\^$*+?.()|[\]{}]/g, "\\$&");
      normalized = normalized.replace(new RegExp(escapedGroup, "g"), "");
    }

    // Replace locale decimal separator with dot
    if (decimal && decimal !== ".") {
      const escapedDecimal = decimal.replace(/[-/\\^$*+?.()|[\]{}]/g, "\\$&");
      normalized = normalized.replace(new RegExp(escapedDecimal, "g"), ".");
    }
  } catch {
    // If Intl fails, fall back to a conservative clean-up:
    normalized = normalized.replace(/,/g, "");
  }

  // Keep only digits, dot, minus and plus
  normalized = normalized.replace(/[^0-9.+-]/g, "");

  const num = parseFloat(normalized);
  return Number.isNaN(num) ? NaN : num;
}

export function useParseNumber() {
  const { locale } = useNumberFormat();
  return (str) => parseNumberWithLocale(str, locale);
}

// Date format helpers used for UI-only date formatting. These do NOT affect
// import/export formats which continue to use ISO dates.
export const DATE_FORMATS = {
  "YYYY-MM-DD": { datePicker: "yyyy-MM-dd" },
  "YYYY/MM/DD": { datePicker: "yyyy/MM/dd" },
  "MM/DD/YYYY": { datePicker: "MM/dd/yyyy" },
  "DD/MM/YYYY": { datePicker: "dd/MM/yyyy" },
  "DD-MM-YYYY": { datePicker: "dd-MM-yyyy" },
  "DD.MM.YYYY": { datePicker: "dd.MM.yyyy" },
  "DD MMM YYYY": { datePicker: "dd MMM yyyy" },
  "MMM DD, YYYY": { datePicker: "MMM dd, yyyy" },
  "MMMM D, YYYY": { datePicker: "MMMM d, yyyy" },
};

function pad2(n) {
  return String(n).padStart(2, "0");
}

export function formatDateForUI(value, formatKey, _locale) {
  if (!value) return "";
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return "";

  switch (formatKey) {
    case "YYYY-MM-DD":
      return `${date.getFullYear()}-${pad2(date.getMonth() + 1)}-${pad2(
        date.getDate(),
      )}`;
    case "YYYY/MM/DD":
      return `${date.getFullYear()}/${pad2(date.getMonth() + 1)}/${pad2(
        date.getDate(),
      )}`;
    case "MM/DD/YYYY":
      return `${pad2(date.getMonth() + 1)}/${pad2(date.getDate())}/${date.getFullYear()}`;
    case "DD/MM/YYYY":
      return `${pad2(date.getDate())}/${pad2(date.getMonth() + 1)}/${date.getFullYear()}`;
    case "DD-MM-YYYY":
      return `${pad2(date.getDate())}-${pad2(date.getMonth() + 1)}-${date.getFullYear()}`;
    case "DD.MM.YYYY":
      return `${pad2(date.getDate())}.${pad2(date.getMonth() + 1)}.${date.getFullYear()}`;
    case "DD MMM YYYY":
      // Use English month names for UI display (independent of number locale)
      return date.toLocaleDateString("en-US", {
        day: "2-digit",
        month: "short",
        year: "numeric",
      });
    case "MMM DD, YYYY":
      // short month name format — force English month names to avoid mixing with number locale
      return date.toLocaleDateString("en-US", {
        month: "short",
        day: "2-digit",
        year: "numeric",
      });
    case "MMMM D, YYYY":
      // full month name (e.g. "January 3, 2026") — force English months
      return date.toLocaleDateString("en-US", {
        month: "long",
        day: "numeric",
        year: "numeric",
      });
    default:
      return date.toISOString().split("T")[0];
  }
}

export function getDatePickerFormat(formatKey) {
  return DATE_FORMATS[formatKey]?.datePicker || "yyyy-MM-dd";
}

export function useFormatDate() {
  const { dateFormat, locale } = useNumberFormat();
  return (value) => formatDateForUI(value, dateFormat, locale);
}

export function formatNumberForExport(value) {
  if (value === undefined || value === null) return "";
  if (typeof value === "number") return String(value);
  const s = String(value).trim();
  if (s === "") return "";

  // Remove common non-breaking/grouping spaces
  let normalized = s.replace(/\u00A0|\u202F|\s/g, "");

  // If contains comma and no dot, treat comma as decimal separator (e.g. "1234,56").
  // If contains both comma and dot, assume commas are thousand separators and remove them (e.g. "1,234.56").
  if (normalized.includes(",") && !normalized.includes(".")) {
    normalized = normalized.replace(/,/g, ".");
  } else if (normalized.includes(",") && normalized.includes(".")) {
    normalized = normalized.replace(/,/g, "");
  }

  // Keep only digits, decimal point, sign characters
  normalized = normalized.replace(/[^0-9.+-]/g, "");
  const num = parseFloat(normalized);
  return Number.isNaN(num) ? s : String(num);
}
