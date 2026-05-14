import { describe, it, expect, beforeEach, vi } from "vitest";
import { get } from "svelte/store";

const mockApi = vi.hoisted(() => ({
  listTags: vi.fn().mockResolvedValue([]),
  renameTag: vi.fn().mockResolvedValue(0),
  deleteTag: vi.fn().mockResolvedValue(0),
  mergeTags: vi.fn().mockResolvedValue(0),
}));

vi.mock("../../src/lib/ipc", () => ({
  api: mockApi,
  isTauri: vi.fn().mockReturnValue(false),
}));

import { tags, tagsLoading, loadTags, renameTag, deleteTag, mergeTags } from "../../src/lib/stores/tags";
import type { TagInfo } from "../../src/lib/types";

beforeEach(() => {
  tags.set([]);
  tagsLoading.set(false);
  vi.clearAllMocks();
  mockApi.listTags.mockResolvedValue([]);
});

describe("loadTags", () => {
  it("sets tagsLoading during load and populates tags on success", async () => {
    const data: TagInfo[] = [{ name: "a", count: 2 }];
    mockApi.listTags.mockResolvedValue(data);

    const promise = loadTags();
    expect(get(tagsLoading)).toBe(true);
    await promise;
    expect(get(tagsLoading)).toBe(false);
    expect(get(tags)).toEqual(data);
  });

  it("logs error and resets loading on failure", async () => {
    const err = new Error("boom");
    mockApi.listTags.mockRejectedValue(err);
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});

    await loadTags();
    expect(get(tagsLoading)).toBe(false);
    expect(spy).toHaveBeenCalledWith("Failed to load tags:", err);
    spy.mockRestore();
  });
});

describe("renameTag", () => {
  it("calls api.renameTag and reloads tags", async () => {
    mockApi.renameTag.mockResolvedValue(3);
    mockApi.listTags.mockResolvedValue([{ name: "new", count: 3 }]);

    const count = await renameTag("old", "new");
    expect(count).toBe(3);
    expect(mockApi.renameTag).toHaveBeenCalledWith("old", "new");
    expect(mockApi.listTags).toHaveBeenCalled();
  });
});

describe("deleteTag", () => {
  it("calls api.deleteTag and reloads tags", async () => {
    mockApi.deleteTag.mockResolvedValue(5);

    const count = await deleteTag("removed");
    expect(count).toBe(5);
    expect(mockApi.deleteTag).toHaveBeenCalledWith("removed");
    expect(mockApi.listTags).toHaveBeenCalled();
  });
});

describe("mergeTags", () => {
  it("calls api.mergeTags and reloads tags", async () => {
    mockApi.mergeTags.mockResolvedValue(7);

    const count = await mergeTags(["a", "b"], "c");
    expect(count).toBe(7);
    expect(mockApi.mergeTags).toHaveBeenCalledWith(["a", "b"], "c");
    expect(mockApi.listTags).toHaveBeenCalled();
  });
});
