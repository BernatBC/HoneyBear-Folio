import { render } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import DevTools from "../../../components/shared/DevTools";

// Mock toast context
const mockShowToast = vi.fn();
vi.mock("../../../contexts/toast", () => ({
  useToast: () => ({ showToast: mockShowToast }),
}));

// Mock dev settings
let devSettings = {};
vi.mock("../../../config/dev-settings", () => ({
  getDevSetting: (key) => devSettings[key],
}));

describe("DevTools", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    devSettings = {};
  });

  it("renders nothing (null)", () => {
    const { container } = render(<DevTools />);

    expect(container.firstChild).toBeNull();
  });

  it("shows success toast when FORCE_SUCCESS_TOAST is enabled", () => {
    devSettings.FORCE_SUCCESS_TOAST = true;

    render(<DevTools />);

    expect(mockShowToast).toHaveBeenCalledWith("Dev: Forced Success Toast", {
      type: "success",
    });
  });

  it("shows error toast when FORCE_FAILURE_TOAST is enabled", () => {
    devSettings.FORCE_FAILURE_TOAST = true;

    render(<DevTools />);

    expect(mockShowToast).toHaveBeenCalledWith("Dev: Forced Failure Toast", {
      type: "error",
    });
  });

  it("shows both toasts when both settings are enabled", () => {
    devSettings.FORCE_SUCCESS_TOAST = true;
    devSettings.FORCE_FAILURE_TOAST = true;

    render(<DevTools />);

    expect(mockShowToast).toHaveBeenCalledTimes(2);
    expect(mockShowToast).toHaveBeenCalledWith("Dev: Forced Success Toast", {
      type: "success",
    });
    expect(mockShowToast).toHaveBeenCalledWith("Dev: Forced Failure Toast", {
      type: "error",
    });
  });

  it("does not show any toast when settings are disabled", () => {
    devSettings.FORCE_SUCCESS_TOAST = false;
    devSettings.FORCE_FAILURE_TOAST = false;

    render(<DevTools />);

    expect(mockShowToast).not.toHaveBeenCalled();
  });
});
