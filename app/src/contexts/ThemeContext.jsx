import { useEffect, useState } from "react";
import PropTypes from "prop-types";
import { ThemeContext } from "./theme-core";

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
      const systemTheme = window.matchMedia("(prefers-color-scheme: dark)")
        .matches
        ? "dark"
        : "light";
      applyTheme(systemTheme);

      const mediaQuery = window.matchMedia("(prefers-color-scheme: dark)");
      const handleChange = (e) => {
        applyTheme(e.matches ? "dark" : "light");
      };

      mediaQuery.addEventListener("change", handleChange);
      return () => mediaQuery.removeEventListener("change", handleChange);
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
