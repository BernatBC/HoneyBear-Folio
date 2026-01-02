import { useState, useEffect } from "react";
import PropTypes from "prop-types";
import { PrivacyContext } from "./privacy";

export function PrivacyProvider({ children }) {
  const [isPrivacyMode, setIsPrivacyMode] = useState(() => {
    try {
      return localStorage.getItem("hb_privacy_mode") === "true";
    } catch {
      return false;
    }
  });

  const togglePrivacyMode = () => {
    setIsPrivacyMode((prev) => !prev);
  };

  useEffect(() => {
    try {
      localStorage.setItem("hb_privacy_mode", isPrivacyMode);
    } catch {
      // ignore
    }
  }, [isPrivacyMode]);

  return (
    <PrivacyContext.Provider value={{ isPrivacyMode, togglePrivacyMode }}>
      {children}
    </PrivacyContext.Provider>
  );
}

PrivacyProvider.propTypes = {
  children: PropTypes.node.isRequired,
};
