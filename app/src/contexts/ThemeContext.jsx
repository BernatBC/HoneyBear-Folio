import { useEffect, useState } from "react";
import PropTypes from "prop-types";
import { ThemeContext } from "./theme-core";
import { invoke } from "@tauri-apps/api/core";

export function ThemeProvider({ children }) {
  const [theme, setTheme] = useState(() => {
    if (typeof window !== "undefined") {
      return localStorage.getItem("hb_theme") || "system";
    }
    return "system";
  });

  useEffect(() => {
    const root = window.document.documentElement;

    const removeOldTheme = () => {
      root.classList.remove("dark");
      root.classList.remove("light");
    };

    const applyTheme = (themeToApply) => {
      removeOldTheme();
      if (themeToApply === "dark") {
        root.classList.add("dark");
      } else if (themeToApply === "light") {
        root.classList.add("light"); // Optional, usually default
      }
    };

    if (theme === "system") {
      // First try the browser/media query (works on macOS/Windows and newer webviews)
      let mediaQuery;
      let handleChange;
      if (typeof window.matchMedia === "function") {
        mediaQuery = window.matchMedia("(prefers-color-scheme: dark)");
        applyTheme(mediaQuery.matches ? "dark" : "light");
        handleChange = (e) => {
          applyTheme(e.matches ? "dark" : "light");
        };
        try {
          mediaQuery.addEventListener("change", handleChange);
        } catch (e) {
          // Some older webviews only support addListener
          try {
            mediaQuery.addListener(handleChange);
          } catch (e2) {
            /* ignore */
          }
        }
      }

      // Also ask the backend for the system theme (Linux/older webviews may report wrong prefers-color-scheme)
      (async () => {
        try {
          const sys = await invoke("get_system_theme");
          if (sys === "dark" || sys === "light") {
            applyTheme(sys);
          }
        } catch (err) {
          // ignore failures and rely on media query
          console.debug("get_system_theme failed:", err);
        }
      })();

      return () => {
        if (mediaQuery && handleChange) {
          try {
            mediaQuery.removeEventListener("change", handleChange);
          } catch (e) {
            try {
              mediaQuery.removeListener(handleChange);
            } catch (e2) {
              /* ignore */
            }
          }
        }
      };
    } else {
      applyTheme(theme);
    }
  }, [theme]);

  const value = {
    theme,
    setTheme: (newTheme) => {
      setTheme(newTheme);
      localStorage.setItem("hb_theme", newTheme);
    },
  };

  return (
    <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>
  );
}

ThemeProvider.propTypes = {
  children: PropTypes.node.isRequired,
};
