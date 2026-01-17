import { useState, useLayoutEffect } from "react";

export default function useIsDark() {
  const [isDark, setIsDark] = useState(() => {
    if (typeof window !== "undefined") {
      return document.documentElement.classList.contains("dark");
    }
    return false;
  });

  useLayoutEffect(() => {
    // Observe changes to the documentElement class and update state when needed
    const checkDark = () =>
      setIsDark(document.documentElement.classList.contains("dark"));

    // Do an initial check synchronously to ensure state matches the DOM before paint
    checkDark();

    // Observe changes
    const observer = new MutationObserver(() => {
      checkDark();
    });

    observer.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ["class"],
    });

    return () => observer.disconnect();
  }, []);

  return isDark;
}
