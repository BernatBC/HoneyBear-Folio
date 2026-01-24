import { renderHook, act } from "@testing-library/react";
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import useIsDark from "../../hooks/useIsDark";

describe("useIsDark", () => {
  beforeEach(() => {
    // Reset document class
    document.documentElement.classList.remove("dark");
  });

  afterEach(() => {
    document.documentElement.classList.remove("dark");
  });

  it("returns false when dark class is not present", () => {
    const { result } = renderHook(() => useIsDark());

    expect(result.current).toBe(false);
  });

  it("returns true when dark class is present", () => {
    document.documentElement.classList.add("dark");

    const { result } = renderHook(() => useIsDark());

    expect(result.current).toBe(true);
  });

  it("updates when dark class is added", async () => {
    const { result } = renderHook(() => useIsDark());

    expect(result.current).toBe(false);

    act(() => {
      document.documentElement.classList.add("dark");
    });

    // MutationObserver is async, wait for next tick
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 0));
    });

    expect(result.current).toBe(true);
  });

  it("updates when dark class is removed", async () => {
    document.documentElement.classList.add("dark");

    const { result } = renderHook(() => useIsDark());

    expect(result.current).toBe(true);

    act(() => {
      document.documentElement.classList.remove("dark");
    });

    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 0));
    });

    expect(result.current).toBe(false);
  });

  it("initializes correctly with existing dark class", () => {
    document.documentElement.classList.add("dark");

    const { result } = renderHook(() => useIsDark());

    expect(result.current).toBe(true);
  });

  it("does not update for non-class attribute changes", async () => {
    const { result } = renderHook(() => useIsDark());

    expect(result.current).toBe(false);

    act(() => {
      document.documentElement.setAttribute("data-test", "value");
    });

    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 0));
    });

    expect(result.current).toBe(false);
  });

  it("handles multiple class changes", async () => {
    const { result } = renderHook(() => useIsDark());

    // Add dark
    act(() => {
      document.documentElement.classList.add("dark");
    });
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 0));
    });
    expect(result.current).toBe(true);

    // Remove dark
    act(() => {
      document.documentElement.classList.remove("dark");
    });
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 0));
    });
    expect(result.current).toBe(false);

    // Add dark again
    act(() => {
      document.documentElement.classList.add("dark");
    });
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 0));
    });
    expect(result.current).toBe(true);
  });

  it("cleans up MutationObserver on unmount", () => {
    const { unmount } = renderHook(() => useIsDark());

    // Should not throw when unmounting
    expect(() => unmount()).not.toThrow();
  });
});
