import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { get, writable } from "svelte/store";
import { createMockApi, mockIpcModule } from "../__mocks__/ipc";
import type { PromptFile } from "../../src/lib/types";

let mockApi: ReturnType<typeof createMockApi>;
let mockActiveFile: ReturnType<typeof writable<PromptFile | null>>;
let mockEditorContent: ReturnType<typeof writable<string>>;
let mockAddToast: ReturnType<typeof vi.fn>;

function setupMocks() {
  mockApi = createMockApi();
  mockActiveFile = writable<PromptFile | null>(null);
  mockEditorContent = writable<string>("current content");
  mockAddToast = vi.fn();

  vi.doMock("../../src/lib/ipc", () => mockIpcModule(mockApi));
  vi.doMock("../../src/lib/stores/editor", () => ({
    activeFile: mockActiveFile,
    editorContent: mockEditorContent,
    fileHistory: writable([]),
  }));
  vi.doMock("../../src/lib/stores/toast", () => ({
    addToast: mockAddToast,
  }));
}

async function loadModule() {
  return await import("../../src/lib/stores/compare");
}

beforeEach(() => {
  vi.resetModules();
  setupMocks();
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("openCompare", () => {
  it("returns early when no activeFile", async () => {
    mockActiveFile.set(null);
    const mod = await loadModule();
    await mod.openCompare("abc123", "Version A");
    expect(mockApi.gitShowFile).not.toHaveBeenCalled();
    expect(get(mod.compareState).visible).toBe(false);
  });

  it("loads both commits when commitB is provided", async () => {
    mockActiveFile.set({ path: "test.md", frontmatter: {} as any, body: "", raw: "" });
    mockApi.gitShowFile.mockResolvedValueOnce("content A").mockResolvedValueOnce("content B");
    const mod = await loadModule();
    await mod.openCompare("aaa", "Label A", "bbb", "Label B");
    const state = get(mod.compareState);
    expect(state.visible).toBe(true);
    expect(state.path).toBe("test.md");
    expect(state.versionA).toEqual({ label: "Label A", commit: "aaa", content: "content A" });
    expect(state.versionB).toEqual({ label: "Label B", commit: "bbb", content: "content B" });
  });

  it("uses editorContent when commitB is not provided", async () => {
    mockActiveFile.set({ path: "test.md", frontmatter: {} as any, body: "", raw: "" });
    mockApi.gitShowFile.mockResolvedValue("content A");
    mockEditorContent.set("my editor content");
    const mod = await loadModule();
    await mod.openCompare("aaa", "Label A");
    const state = get(mod.compareState);
    expect(state.versionB!.content).toBe("my editor content");
    expect(state.versionB!.label).toBe("Current");
    expect(state.versionB!.commit).toBe("working");
  });

  it("uses default labels when labelB is not provided with commitB", async () => {
    mockActiveFile.set({ path: "test.md", frontmatter: {} as any, body: "", raw: "" });
    mockApi.gitShowFile.mockResolvedValueOnce("A").mockResolvedValueOnce("B");
    const mod = await loadModule();
    await mod.openCompare("aaa1234", "Label A", "bbb5678");
    const state = get(mod.compareState);
    expect(state.versionB!.label).toBe("bbb5678"); // commitB.slice(0,7)
  });

  it("uses default labelB 'Current' when no commitB and no labelB", async () => {
    mockActiveFile.set({ path: "test.md", frontmatter: {} as any, body: "", raw: "" });
    mockApi.gitShowFile.mockResolvedValue("A");
    const mod = await loadModule();
    await mod.openCompare("aaa", "Label A");
    expect(get(mod.compareState).versionB!.label).toBe("Current");
  });

  it("shows toast on error", async () => {
    mockActiveFile.set({ path: "test.md", frontmatter: {} as any, body: "", raw: "" });
    mockApi.gitShowFile.mockRejectedValue(new Error("git error"));
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const mod = await loadModule();
    await mod.openCompare("aaa", "Label A");
    expect(mockAddToast).toHaveBeenCalledWith("Failed to load version", "error");
    expect(get(mod.compareState).visible).toBe(false);
    errorSpy.mockRestore();
  });
});

describe("closeCompare", () => {
  it("resets all stores", async () => {
    mockActiveFile.set({ path: "test.md", frontmatter: {} as any, body: "", raw: "" });
    mockApi.gitShowFile.mockResolvedValue("content");
    const mod = await loadModule();
    await mod.openCompare("aaa", "A");
    mod.compareSelectionMode.set(true);
    mod.selectedCommits.set(["x"]);
    mod.closeCompare();
    expect(get(mod.compareState)).toEqual({ visible: false, path: null, versionA: null, versionB: null });
    expect(get(mod.compareSelectionMode)).toBe(false);
    expect(get(mod.selectedCommits)).toEqual([]);
  });
});

describe("toggleCommitSelection", () => {
  it("adds first commit to selection", async () => {
    const mod = await loadModule();
    await mod.toggleCommitSelection("abc");
    expect(get(mod.selectedCommits)).toEqual(["abc"]);
  });

  it("deselects a commit that is already selected", async () => {
    const mod = await loadModule();
    mod.selectedCommits.set(["abc"]);
    await mod.toggleCommitSelection("abc");
    expect(get(mod.selectedCommits)).toEqual([]);
  });

  it("triggers openCompare when second commit is selected", async () => {
    mockActiveFile.set({ path: "test.md", frontmatter: {} as any, body: "", raw: "" });
    mockApi.gitShowFile.mockResolvedValueOnce("content1").mockResolvedValueOnce("content2");
    const mod = await loadModule();
    mod.selectedCommits.set(["first1234567"]);
    await mod.toggleCommitSelection("second1234567");
    const state = get(mod.compareState);
    expect(state.visible).toBe(true);
    expect(state.versionA!.label).toBe("first12"); // slice(0,7)
    expect(state.versionB!.label).toBe("second1"); // slice(0,7)
    expect(get(mod.compareSelectionMode)).toBe(false);
    expect(get(mod.selectedCommits)).toEqual([]);
  });
});
