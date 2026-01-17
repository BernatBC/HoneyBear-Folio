import { IS_RELEASE } from "../utils/version";

/**
 * Development settings configuration.
 * These settings are ONLY applied when IS_RELEASE is false.
 */
const DEV_SETTINGS = {
  // UI Flow Overrides
  FORCE_WELCOME_SCREEN: false, // If true, always show welcome screen (ignores localStorage)
  FORCE_HIDE_UPDATE_POPUP: false, // If true, never check for updates
  FORCE_SHOW_UPDATE_POPUP: false, // If true, mocks an available update (useful for UI testing)

  // Toast Testing (triggers on app mount)
  FORCE_SUCCESS_TOAST: false,
  FORCE_FAILURE_TOAST: false,
};

/**
 * Helper to get a development setting.
 * Returns undefined if we are in a release build.
 * @param {string} key - The setting key from DEV_SETTINGS
 * @returns {any} The setting value or undefined
 */
export function getDevSetting(key) {
  if (IS_RELEASE) {
    return undefined;
  }
  return DEV_SETTINGS[key];
}
