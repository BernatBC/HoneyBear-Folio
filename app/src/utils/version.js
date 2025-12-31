// Small helper to compute a displayable version string.
// Rules:
// - In production builds we prefer the package.json version injected at build time
// - In development builds we show the current commit (if available) or "development"

export const APP_VERSION =
  typeof __APP_VERSION__ !== "undefined" ? __APP_VERSION__ : null;
export const APP_COMMIT =
  typeof __APP_COMMIT__ !== "undefined" ? __APP_COMMIT__ : null;

// A release build is a production build with a version available
export const IS_RELEASE = import.meta.env.PROD === true && !!APP_VERSION;

export function getDisplayVersion() {
  const isProd = import.meta.env.PROD === true;

  // If this is a production build and we have a version, show it
  if (isProd && APP_VERSION) {
    return APP_VERSION;
  }

  // Otherwise, prefer showing a short commit id when available
  if (APP_COMMIT) {
    return `dev (${APP_COMMIT})`;
  }

  // Final fallback
  return "development";
}

export default getDisplayVersion;
