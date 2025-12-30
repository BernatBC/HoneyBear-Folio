import { useNumberFormat } from "../contexts/NumberFormatContext";

export function formatNumberWithLocale(value, locale, options = {}) {
  if (value === undefined || value === null || Number.isNaN(Number(value)))
    return "";
  const opts = {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
    ...options,
  };
  return Number(value).toLocaleString(locale, opts);
}

export function useFormatNumber() {
  const { locale } = useNumberFormat();
  return (value, options) => formatNumberWithLocale(value, locale, options);
}
