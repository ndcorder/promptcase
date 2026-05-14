import { describe, it, expect, beforeEach, vi } from "vitest";
import { get } from "svelte/store";

const mockApi = vi.hoisted(() => ({
  updateConfig: vi.fn().mockResolvedValue({}),
  getConfig: vi.fn().mockResolvedValue({ theme: "dark" }),
}));

vi.mock("../../src/lib/ipc", () => ({
  api: mockApi,
  isTauri: vi.fn().mockReturnValue(false),
}));

import { currentTheme, setTheme, initTheme } from "../../src/lib/stores/theme";

beforeEach(() => {
  currentTheme.set("dark");
  document.documentElement.removeAttribute("data-theme");
  vi.clearAllMocks();
});

describe("setTheme", () => {
  it("updates store, DOM attribute, and persists via api", async () => {
    await setTheme("light");
    expect(get(currentTheme)).toBe("light");
    expect(document.documentElement.getAttribute("data-theme")).toBe("light");
    expect(mockApi.updateConfig).toHaveBeenCalledWith({ theme: "light" });
  });

  it("warns but does not throw when api fails", async () => {
    mockApi.updateConfig.mockRejectedValue(new Error("fail"));
    const spy = vi.spyOn(console, "warn").mockImplementation(() => {});

    await setTheme("dark");
    expect(get(currentTheme)).toBe("dark");
    expect(spy).toHaveBeenCalledWith("Failed to persist theme:", expect.any(Error));
    spy.mockRestore();
  });
});

describe("initTheme", () => {
  it("loads light theme from config", async () => {
    mockApi.getConfig.mockResolvedValue({ theme: "light" });

    await initTheme();
    expect(get(currentTheme)).toBe("light");
    expect(document.documentElement.getAttribute("data-theme")).toBe("light");
  });

  it("defaults non-light config value to dark", async () => {
    mockApi.getConfig.mockResolvedValue({ theme: "purple" });

    await initTheme();
    expect(get(currentTheme)).toBe("dark");
    expect(document.documentElement.getAttribute("data-theme")).toBe("dark");
  });

  it("falls back to prefers-color-scheme dark on error", async () => {
    mockApi.getConfig.mockRejectedValue(new Error("no config"));
    Object.defineProperty(window, "matchMedia", {
      writable: true,
      value: vi.fn().mockReturnValue({ matches: true }),
    });

    await initTheme();
    expect(get(currentTheme)).toBe("dark");
    expect(document.documentElement.getAttribute("data-theme")).toBe("dark");
  });

  it("falls back to prefers-color-scheme light on error", async () => {
    mockApi.getConfig.mockRejectedValue(new Error("no config"));
    Object.defineProperty(window, "matchMedia", {
      writable: true,
      value: vi.fn().mockReturnValue({ matches: false }),
    });

    await initTheme();
    expect(get(currentTheme)).toBe("light");
    expect(document.documentElement.getAttribute("data-theme")).toBe("light");
  });
});
