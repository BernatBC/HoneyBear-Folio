import { createContext, useContext } from "react";

export const PrivacyContext = createContext({
  isPrivacyMode: false,
  togglePrivacyMode: () => {},
});

export function usePrivacy() {
  return useContext(PrivacyContext);
}
