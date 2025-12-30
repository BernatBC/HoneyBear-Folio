import { useNumberFormat } from "../contexts/number-format";

export function formatNumberWithLocale(value, locale, options = {}) {
  if (value === undefined || value === null || Number.isNaN(Number(value)))
    return "";

  const opts = {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
    ...options,
  };

  const num = Number(value);

  // Try to use the provided locale, but gracefully fallback to the runtime default
  // if the locale is unsupported or an error occurs (e.g., corrupted value in localStorage).
  try {
    const formatter = new Intl.NumberFormat(
      // Use undefined to let the runtime choose the default if locale is falsy
      locale || undefined,
      opts,
    );
    return formatter.format(num);
  } catch (e) {
    try {
      const fallback = new Intl.NumberFormat(undefined, opts);
      return fallback.format(num);
    } catch (e2) {
      // As a last resort, return a simple stringified number with fixed decimals
      return num.toFixed(opts.maximumFractionDigits);
    }
  }
}

export function useFormatNumber() {
  const { locale } = useNumberFormat();
  return (value, options) => formatNumberWithLocale(value, locale, options);
}
