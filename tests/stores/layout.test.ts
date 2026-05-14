import { describe, it, expect, beforeEach, vi } from "vitest";
import { get } from "svelte/store";

const mockApi = vi.hoisted(() => ({
  getConfig: vi.fn().mockResolvedValue({ sidebarPosition: "left" }),
}));

vi.mock("../../src/lib/ipc", () => ({
  api: mockApi,
  isTauri: vi.fn().mockReturnValue(false),
}));

import {
  sidebarPosition,
  showTagManager,
  showImportText,
  showScanResults,
  initLayout,
} from "../../src/lib/stores/layout";

beforeEach(() => {
  sidebarPosition.set("left");
  showTagManager.set(false);
  showImportText.set(false);
  showScanResults.set(false);
  vi.clearAllMocks();
});

describe("store defaults", () => {
  it("sidebarPosition defaults to left", () => {
    expect(get(sidebarPosition)).toBe("left");
  });

  it("showTagManager defaults to false", () => {
    expect(get(showTagManager)).toBe(false);
  });

  it("showImportText defaults to false", () => {
    expect(get(showImportText)).toBe(false);
  });

  it("showScanResults defaults to false", () => {
    expect(get(showScanResults)).toBe(false);
  });
});

describe("initLayout", () => {
  it("sets sidebarPosition to right from config", async () => {
    mockApi.getConfig.mockResolvedValue({ sidebarPosition: "right" });

    await initLayout();
    expect(get(sidebarPosition)).toBe("right");
  });

  it("defaults non-right config value to left", async () => {
    mockApi.getConfig.mockResolvedValue({ sidebarPosition: "top" });

    await initLayout();
    expect(get(sidebarPosition)).toBe("left");
  });

  it("sets sidebarPosition to left from config", async () => {
    mockApi.getConfig.mockResolvedValue({ sidebarPosition: "left" });

    await initLayout();
    expect(get(sidebarPosition)).toBe("left");
  });

  it("keeps default on error", async () => {
    mockApi.getConfig.mockRejectedValue(new Error("fail"));

    await initLayout();
    expect(get(sidebarPosition)).toBe("left");
  });
});
