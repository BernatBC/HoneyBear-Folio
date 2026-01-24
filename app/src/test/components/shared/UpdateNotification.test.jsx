import { render, screen, waitFor } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import UpdateNotification from "../../../components/shared/UpdateNotification";

// Mock i18n
vi.mock("../../../i18n/i18n", () => ({
  t: (key) => {
    const translations = {
      "update.title": "Update Available",
      "update.available_text": "A new version is available",
      "update.update_now": "Update Now",
      "update.later": "Later",
      "update.show_release_notes": "Show release notes",
    };
    return translations[key] || key;
  },
}));

// Mock Tauri updater plugin
const mockCheck = vi.fn();
vi.mock("@tauri-apps/plugin-updater", () => ({
  check: () => mockCheck(),
}));

// Mock Tauri process plugin
const mockRelaunch = vi.fn();
vi.mock("@tauri-apps/plugin-process", () => ({
  relaunch: () => mockRelaunch(),
}));

// Mock dev settings
let devSettings = {};
vi.mock("../../../config/dev-settings", () => ({
  getDevSetting: (key) => devSettings[key],
}));

describe("UpdateNotification", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    devSettings = {};
    mockCheck.mockResolvedValue(null);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("renders nothing when no update is available", async () => {
    mockCheck.mockResolvedValue(null);

    const { container } = render(<UpdateNotification />);

    await waitFor(() => {
      expect(container.firstChild).toBeNull();
    });
  });

  it("renders nothing when update check returns no available update", async () => {
    mockCheck.mockResolvedValue({ available: false });

    const { container } = render(<UpdateNotification />);

    await waitFor(() => {
      expect(container.firstChild).toBeNull();
    });
  });

  it("does not check for updates when FORCE_HIDE_UPDATE_POPUP is enabled", async () => {
    devSettings.FORCE_HIDE_UPDATE_POPUP = true;

    render(<UpdateNotification />);

    await waitFor(() => {
      expect(mockCheck).not.toHaveBeenCalled();
    });
  });

  it("shows update notification when update is available", async () => {
    mockCheck.mockResolvedValue({
      available: true,
      version: "1.2.0",
      body: "## What's New\n\n- Bug fixes",
      downloadAndInstall: vi.fn(),
    });

    render(<UpdateNotification />);

    await waitFor(() => {
      // Check for translated title
      expect(screen.getByText("Update Available")).toBeInTheDocument();
    });
  });

  it("shows Update Now button when update is available", async () => {
    mockCheck.mockResolvedValue({
      available: true,
      version: "1.2.0",
      body: "Release notes",
      downloadAndInstall: vi.fn(),
    });

    render(<UpdateNotification />);

    await waitFor(() => {
      expect(screen.getByText("Update Now")).toBeInTheDocument();
    });
  });

  it("shows Later button when update is available", async () => {
    mockCheck.mockResolvedValue({
      available: true,
      version: "1.2.0",
      body: "Release notes",
      downloadAndInstall: vi.fn(),
    });

    render(<UpdateNotification />);

    await waitFor(() => {
      expect(screen.getByText("Later")).toBeInTheDocument();
    });
  });

  it("handles update check failure gracefully", async () => {
    const consoleSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    mockCheck.mockRejectedValue(new Error("Network error"));

    const { container } = render(<UpdateNotification />);

    await waitFor(() => {
      expect(consoleSpy).toHaveBeenCalledWith(
        "Failed to check for updates:",
        expect.any(Error),
      );
    });

    // Should not crash, render nothing
    expect(container.firstChild).toBeNull();

    consoleSpy.mockRestore();
  });
});
