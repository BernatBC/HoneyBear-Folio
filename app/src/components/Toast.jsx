import { createContext, useContext, useState, useCallback } from "react";
import PropTypes from "prop-types";
import "../styles/Toast.css";

const ToastContext = createContext(null);

export function ToastProvider({ children }) {
  const [toasts, setToasts] = useState([]);

  const removeToast = useCallback((id) => {
    setToasts((t) => t.filter((x) => x.id !== id));
  }, []);

  const showToast = useCallback(
    (message, { type = "info", duration = 4000 } = {}) => {
      const id = `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
      setToasts((t) => [...t, { id, message, type }]);

      if (duration > 0) {
        setTimeout(() => removeToast(id), duration);
      }

      return id;
    },
    [removeToast],
  );

  return (
    <ToastContext.Provider value={{ showToast }}>
      {children}
      <div className="toast-container" aria-live="polite" aria-atomic="true">
        {toasts.map((t) => (
          <div key={t.id} className={`toast toast-${t.type}`} role="status">
            <div className="toast-content">
              <span className="toast-message">{t.message}</span>
              <button
                aria-label="Dismiss"
                className="toast-close"
                onClick={() => removeToast(t.id)}
              >
                ×
              </button>
            </div>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

ToastProvider.propTypes = {
  children: PropTypes.node,
};

export function useToast() {
  const ctx = useContext(ToastContext);
  // If there's no provider (e.g., in isolated tests), return a safe noop implementation
  if (!ctx) return { showToast: () => {} };
  return ctx;
}

export default ToastProvider;
