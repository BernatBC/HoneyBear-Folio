import { useEffect } from "react";
import { useToast } from "../../contexts/toast";
import { getDevSetting } from "../../config/dev-settings";

export default function DevTools() {
  const { showToast } = useToast();

  useEffect(() => {
    if (getDevSetting("FORCE_SUCCESS_TOAST")) {
      showToast("Dev: Forced Success Toast", { type: "success" });
    }
    if (getDevSetting("FORCE_FAILURE_TOAST")) {
      showToast("Dev: Forced Failure Toast", { type: "error" });
    }
  }, [showToast]);

  return null;
}
