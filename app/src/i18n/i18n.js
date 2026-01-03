import en from "./en.json";

let current = en;

export function setLocale(localeObj) {
  current = localeObj;
}

function interpolate(str, vars) {
  if (!vars) return str;
  return String(str).replace(/\{(.*?)\}/g, (_, k) => {
    return vars[k] === undefined ? `{${k}}` : String(vars[k]);
  });
}

export function t(key, vars) {
  const s = (current && current[key]) || key;
  return interpolate(s, vars);
}

export function useTranslation() {
  return { t };
}

export default { t, setLocale, useTranslation };
