import { describe, it, expect, beforeEach, vi } from "vitest";
import { get } from "svelte/store";
import { defaultMockConfig } from "../../tests/__mocks__/ipc";

const mockApi = vi.hoisted(() => ({
  getConfig: vi.fn().mockResolvedValue({ savedFilters: [] }),
  updateConfig: vi.fn().mockResolvedValue({}),
  listFiles: vi.fn().mockResolvedValue([]),
  listFolders: vi.fn().mockResolvedValue([]),
}));

vi.mock("../../src/lib/ipc", () => ({
  api: mockApi,
  isTauri: vi.fn().mockReturnValue(false),
}));

import { tagFilter, searchQuery, activeSavedFilter } from "../../src/lib/stores/files";
import {
  applySavedFilter,
  clearSavedFilter,
  matchesSavedFilter,
  createSavedFilter,
  updateSavedFilter,
  deleteSavedFilter,
  loadSavedFilters,
} from "../../src/lib/stores/savedFilters";
import type { SavedFilter } from "../../src/lib/types";

const filter1: SavedFilter = { name: "bugs", tag: "bug", query: "crash", icon: "" };
const filter2: SavedFilter = { name: "features", tag: "feat", query: "new", icon: "star" };

beforeEach(() => {
  tagFilter.set("");
  searchQuery.set("");
  activeSavedFilter.set(null);
  vi.clearAllMocks();
  mockApi.getConfig.mockResolvedValue({ ...defaultMockConfig, savedFilters: [filter1, filter2] });
  mockApi.updateConfig.mockResolvedValue({ ...defaultMockConfig });
});

describe("applySavedFilter", () => {
  it("sets tagFilter, searchQuery, and activeSavedFilter", () => {
    applySavedFilter(filter1);
    expect(get(tagFilter)).toBe("bug");
    expect(get(searchQuery)).toBe("crash");
    expect(get(activeSavedFilter)).toEqual(filter1);
  });
});

describe("clearSavedFilter", () => {
  it("resets tagFilter, searchQuery, and activeSavedFilter", () => {
    applySavedFilter(filter1);
    clearSavedFilter();
    expect(get(tagFilter)).toBe("");
    expect(get(searchQuery)).toBe("");
    expect(get(activeSavedFilter)).toBeNull();
  });
});

describe("matchesSavedFilter", () => {
  it("returns true when tag and query match", () => {
    expect(matchesSavedFilter(filter1, "bug", "crash")).toBe(true);
  });

  it("returns false when tag differs", () => {
    expect(matchesSavedFilter(filter1, "other", "crash")).toBe(false);
  });

  it("returns false when query differs", () => {
    expect(matchesSavedFilter(filter1, "bug", "other")).toBe(false);
  });
});

describe("createSavedFilter", () => {
  it("appends a new filter and calls updateConfig", async () => {
    await createSavedFilter("new", "tag", "q");
    expect(mockApi.updateConfig).toHaveBeenCalledWith({
      savedFilters: [filter1, filter2, { name: "new", tag: "tag", query: "q", icon: "" }],
    });
  });
});

describe("updateSavedFilter", () => {
  it("updates filter at valid index", async () => {
    await updateSavedFilter(0, { name: "renamed" });
    expect(mockApi.updateConfig).toHaveBeenCalledWith({
      savedFilters: [{ ...filter1, name: "renamed" }, filter2],
    });
  });

  it("does not call updateConfig for out-of-range index", async () => {
    await updateSavedFilter(5, { name: "nope" });
    expect(mockApi.updateConfig).not.toHaveBeenCalled();
  });

  it("does not call updateConfig for negative index", async () => {
    await updateSavedFilter(-1, { name: "nope" });
    expect(mockApi.updateConfig).not.toHaveBeenCalled();
  });
});

describe("deleteSavedFilter", () => {
  it("removes filter at index and calls updateConfig", async () => {
    await deleteSavedFilter(0);
    expect(mockApi.updateConfig).toHaveBeenCalledWith({
      savedFilters: [filter2],
    });
  });

  it("clears active filter when the deleted filter matches active", async () => {
    activeSavedFilter.set(filter1);
    await deleteSavedFilter(0);
    expect(get(activeSavedFilter)).toBeNull();
    expect(get(tagFilter)).toBe("");
    expect(get(searchQuery)).toBe("");
  });

  it("does not clear active filter when deleted filter does not match active", async () => {
    activeSavedFilter.set(filter2);
    await deleteSavedFilter(0);
    // Active filter2 should remain untouched since deleted filter1 != filter2
    expect(get(activeSavedFilter)).toEqual(filter2);
  });

  it("does not clear when no active filter", async () => {
    activeSavedFilter.set(null);
    await deleteSavedFilter(0);
    expect(get(activeSavedFilter)).toBeNull();
  });
});

describe("loadSavedFilters", () => {
  it("returns saved filters from config", async () => {
    const result = await loadSavedFilters();
    expect(result).toEqual([filter1, filter2]);
  });

  it("returns empty array when savedFilters is empty", async () => {
    mockApi.getConfig.mockResolvedValue({ ...defaultMockConfig, savedFilters: [] });
    const result = await loadSavedFilters();
    expect(result).toEqual([]);
  });

  it("returns empty array when savedFilters is nullish", async () => {
    mockApi.getConfig.mockResolvedValue({ ...defaultMockConfig, savedFilters: undefined });
    const result = await loadSavedFilters();
    expect(result).toEqual([]);
  });
});
