import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

describe("version utilities", () => {
  let originalEnv;

  beforeEach(() => {
    // Store original import.meta.env
    originalEnv = { ...import.meta.env };
    // Reset modules to get fresh imports
    vi.resetModules();
  });

  afterEach(() => {
    // Restore original env
    Object.assign(import.meta.env, originalEnv);
    vi.resetModules();
  });

  describe("getDisplayVersion", () => {
    it("returns version in production when APP_VERSION is defined", async () => {
      // Mock production environment
      import.meta.env.PROD = true;
      
      // Mock the global variables
      globalThis.__APP_VERSION__ = "1.2.3";
      globalThis.__APP_COMMIT__ = "abc1234";
      
      const { getDisplayVersion } = await import("../../utils/version.js");
      
      expect(getDisplayVersion()).toBe("1.2.3");
      
      delete globalThis.__APP_VERSION__;
      delete globalThis.__APP_COMMIT__;
    });

    it("returns dev with commit when not in production and commit is available", async () => {
      import.meta.env.PROD = false;
      
      globalThis.__APP_VERSION__ = undefined;
      globalThis.__APP_COMMIT__ = "abc1234";
      
      const { getDisplayVersion } = await import("../../utils/version.js");
      
      expect(getDisplayVersion()).toBe("dev (abc1234)");
      
      delete globalThis.__APP_COMMIT__;
    });

    it("returns 'development' as fallback", async () => {
      import.meta.env.PROD = false;
      
      // Ensure globals are undefined
      globalThis.__APP_VERSION__ = undefined;
      globalThis.__APP_COMMIT__ = undefined;
      
      const { getDisplayVersion } = await import("../../utils/version.js");
      
      expect(getDisplayVersion()).toBe("development");
    });
  });

  describe("IS_RELEASE", () => {
    it("is true when PROD is true and APP_VERSION is defined", async () => {
      import.meta.env.PROD = true;
      globalThis.__APP_VERSION__ = "1.0.0";
      
      const { IS_RELEASE } = await import("../../utils/version.js");
      
      expect(IS_RELEASE).toBe(true);
      
      delete globalThis.__APP_VERSION__;
    });

    it("is false when PROD is false", async () => {
      import.meta.env.PROD = false;
      globalThis.__APP_VERSION__ = "1.0.0";
      
      const { IS_RELEASE } = await import("../../utils/version.js");
      
      expect(IS_RELEASE).toBe(false);
      
      delete globalThis.__APP_VERSION__;
    });

    it("is false when APP_VERSION is not defined", async () => {
      import.meta.env.PROD = true;
      globalThis.__APP_VERSION__ = undefined;
      
      const { IS_RELEASE } = await import("../../utils/version.js");
      
      expect(IS_RELEASE).toBe(false);
    });
  });

  describe("exports", () => {
    it("exports APP_VERSION", async () => {
      globalThis.__APP_VERSION__ = "2.0.0";
      
      const { APP_VERSION } = await import("../../utils/version.js");
      
      expect(APP_VERSION).toBe("2.0.0");
      
      delete globalThis.__APP_VERSION__;
    });

    it("exports APP_COMMIT", async () => {
      globalThis.__APP_COMMIT__ = "def5678";
      
      const { APP_COMMIT } = await import("../../utils/version.js");
      
      expect(APP_COMMIT).toBe("def5678");
      
      delete globalThis.__APP_COMMIT__;
    });

    it("exports getDisplayVersion as default", async () => {
      const versionModule = await import("../../utils/version.js");
      
      expect(versionModule.default).toBe(versionModule.getDisplayVersion);
    });
  });
});
