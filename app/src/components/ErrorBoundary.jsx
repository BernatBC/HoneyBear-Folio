import React from "react";
import PropTypes from "prop-types";
import { t } from "../i18n/i18n";

export default class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }

  componentDidCatch(error, info) {
    // Log full details to the console so we can inspect stack traces
    console.error("ErrorBoundary caught an error:", error, info);

    // Also store component stack in state so users without devtools (e.g. Tauri WebView)
    // can inspect the error details directly in the UI.
    this.setState({ info: info?.componentStack || "" });
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="p-4 m-4 rounded border border-rose-200 bg-rose-50 dark:bg-rose-900/10 dark:border-rose-800 text-rose-700 dark:text-rose-300">
          <strong>{t("error.something_went_wrong")}</strong>
          <div className="mt-2 text-sm">{t("error.check_console")}</div>

          {/* Expandable error details so users can see stack traces without devtools */}
          <details className="mt-3 bg-white dark:bg-slate-800 p-3 rounded border border-slate-100 dark:border-slate-700 text-xs text-slate-700 dark:text-slate-300">
            <summary className="cursor-pointer">
              {t("error.show_details")}
            </summary>
            <pre className="mt-2 whitespace-pre-wrap break-words text-xs">
              {this.state.error && this.state.error.stack
                ? this.state.error.stack
                : String(this.state.error)}
              {this.state.info && (
                <>
                  {"\n\n"}Component Stack:\n
                  {this.state.info}
                </>
              )}
            </pre>

            <div className="mt-2 flex gap-2">
              <button
                className="inline-flex items-center gap-2 px-3 py-1 rounded bg-slate-100 dark:bg-slate-700 text-sm"
                onClick={() => {
                  try {
                    const text =
                      (this.state.error && this.state.error.stack) ||
                      String(this.state.error) ||
                      "";
                    navigator.clipboard && navigator.clipboard.writeText(text);
                  } catch {
                    /* ignore clipboard failures */
                  }
                }}
              >
                Copy
              </button>
              <button
                className="inline-flex items-center gap-2 px-3 py-1 rounded bg-rose-600 text-white text-sm"
                onClick={() => window.location.reload()}
              >
                Reload
              </button>
            </div>
          </details>
        </div>
      );
    }
    return this.props.children;
  }
}

ErrorBoundary.propTypes = {
  children: PropTypes.node,
};

ErrorBoundary.defaultProps = {
  children: null,
};
