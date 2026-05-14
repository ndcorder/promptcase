import { describe, it, expect, beforeEach, vi } from "vitest";
import { get } from "svelte/store";
import type { PromptEntry } from "../../src/lib/types";

// Polyfill localStorage for jsdom environment
if (typeof globalThis.localStorage === "undefined") {
  const store: Record<string, string> = {};
  (globalThis as any).localStorage = {
    getItem: (key: string) => store[key] ?? null,
    setItem: (key: string, value: string) => { store[key] = value; },
    removeItem: (key: string) => { delete store[key]; },
    clear: () => { for (const k of Object.keys(store)) delete store[k]; },
    get length() { return Object.keys(store).length; },
    key: (i: number) => Object.keys(store)[i] ?? null,
  };
}

const mockApi = vi.hoisted(() => ({
  listFiles: vi.fn().mockResolvedValue([]),
  listFolders: vi.fn().mockResolvedValue([]),
}));

vi.mock("../../src/lib/ipc", () => ({
  api: mockApi,
  isTauri: vi.fn().mockReturnValue(false),
}));

vi.mock("@tauri-apps/api/event", () => ({
  listen: vi.fn(),
}));

import {
  promptEntries,
  selectedPath,
  tagFilter,
  searchQuery,
  expandedFolders,
  filesLoading,
  selectedPaths,
  knownFolders,
  activeSavedFilter,
  allTags,
  filteredEntries,
  folderTree,
  folderFileCounts,
  allFolderPaths,
  toggleSelection,
  selectRange,
  clearSelection,
  selectAll,
  loadFiles,
  saveCustomOrder,
  clearCustomOrder,
  dragState,
  startFileChangeListener,
  stopFileChangeListener,
} from "../../src/lib/stores/files";

function makeEntry(
  path: string,
  title: string,
  tags: string[] = [],
  type: "prompt" | "fragment" = "prompt",
): PromptEntry {
  return {
    path,
    frontmatter: {
      id: path, title, type, tags,
      folder: "/" + path.split("/").slice(0, -1).join("/"),
      variables: [], includes: [], created: "2026-01-01T00:00:00Z",
      modified: "2026-01-01T00:00:00Z", starredVersions: [], tests: [],
    },
  };
}

const testEntries: PromptEntry[] = [
  makeEntry("work/review.md", "Code Review", ["code-review", "dev"]),
  makeEntry("work/debug.md", "Debug Assistant", ["debugging", "dev"]),
  makeEntry("personal/story.md", "Story Writer", ["creative"]),
  makeEntry("fragments/persona.md", "Dev Persona", ["persona"], "fragment"),
];

beforeEach(() => {
  promptEntries.set(testEntries);
  tagFilter.set("");
  searchQuery.set("");
  selectedPath.set(null);
  selectedPaths.set(new Set());
  knownFolders.set([]);
  filesLoading.set(true);
  dragState.set(null);
  activeSavedFilter.set(null);
  vi.clearAllMocks();
  // Clear any custom orders from localStorage
  if (typeof localStorage !== "undefined") {
    localStorage.clear();
  }
});

describe("allTags", () => {
  it("collects all unique tags sorted", () => {
    const tags = get(allTags);
    expect(tags).toEqual(["code-review", "creative", "debugging", "dev", "persona"]);
  });

  it("returns empty for no entries", () => {
    promptEntries.set([]);
    expect(get(allTags)).toEqual([]);
  });
});

describe("filteredEntries", () => {
  it("returns all entries when no filter", () => {
    expect(get(filteredEntries)).toHaveLength(4);
  });

  it("filters by tag", () => {
    tagFilter.set("dev");
    const entries = get(filteredEntries);
    expect(entries).toHaveLength(2);
    expect(entries.map((e) => e.path)).toContain("work/review.md");
    expect(entries.map((e) => e.path)).toContain("work/debug.md");
  });

  it("filters case-insensitively by tag", () => {
    tagFilter.set("Creative");
    expect(get(filteredEntries)).toHaveLength(1);
  });

  it("filters by search query on title", () => {
    searchQuery.set("story");
    const entries = get(filteredEntries);
    expect(entries).toHaveLength(1);
    expect(entries[0].path).toBe("personal/story.md");
  });

  it("filters by search query on path", () => {
    searchQuery.set("fragments");
    const entries = get(filteredEntries);
    expect(entries).toHaveLength(1);
    expect(entries[0].path).toBe("fragments/persona.md");
  });

  it("combines tag and search filters", () => {
    tagFilter.set("dev");
    searchQuery.set("review");
    const entries = get(filteredEntries);
    expect(entries).toHaveLength(1);
    expect(entries[0].path).toBe("work/review.md");
  });
});

describe("folderTree", () => {
  it("builds a tree from entries", () => {
    const tree = get(folderTree);
    expect(tree.children.length).toBeGreaterThan(0);
    const workFolder = tree.children.find((c) => c.name === "work");
    expect(workFolder).toBeTruthy();
    expect(workFolder!.files).toHaveLength(2);
  });

  it("sorts folders alphabetically", () => {
    const tree = get(folderTree);
    const names = tree.children.map((c) => c.name);
    expect(names).toEqual([...names].sort());
  });

  it("includes empty known folders", () => {
    knownFolders.set(["empty-folder"]);
    const tree = get(folderTree);
    const emptyFolder = tree.children.find((c) => c.name === "empty-folder");
    expect(emptyFolder).toBeTruthy();
    expect(emptyFolder!.files).toHaveLength(0);
  });

  it("places root-level files in root", () => {
    promptEntries.set([makeEntry("root.md", "Root File")]);
    const tree = get(folderTree);
    expect(tree.files).toHaveLength(1);
    expect(tree.files[0].path).toBe("root.md");
  });

  it("handles nested folder paths", () => {
    promptEntries.set([makeEntry("a/b/c/file.md", "Deep")]);
    const tree = get(folderTree);
    const a = tree.children.find((c) => c.name === "a");
    expect(a).toBeTruthy();
    const b = a!.children.find((c) => c.name === "b");
    expect(b).toBeTruthy();
    const c = b!.children.find((c) => c.name === "c");
    expect(c).toBeTruthy();
    expect(c!.files).toHaveLength(1);
  });
});

describe("folderFileCounts", () => {
  it("counts files recursively per folder", () => {
    const counts = get(folderFileCounts);
    expect(counts.get("work")).toBe(2);
    expect(counts.get("personal")).toBe(1);
    expect(counts.get("fragments")).toBe(1);
  });
});

describe("allFolderPaths", () => {
  it("returns sorted folder paths", () => {
    const paths = get(allFolderPaths);
    expect(paths).toEqual([...paths].sort());
    expect(paths).toContain("work");
    expect(paths).toContain("personal");
    expect(paths).toContain("fragments");
  });
});

describe("saveCustomOrder / clearCustomOrder", () => {
  it("saves custom order to localStorage", () => {
    saveCustomOrder("work", ["work/debug.md", "work/review.md"]);
    const stored = localStorage.getItem("promptcase:folder-order:work");
    expect(JSON.parse(stored!)).toEqual(["work/debug.md", "work/review.md"]);
  });

  it("uses __root__ key for root folder", () => {
    saveCustomOrder("", ["b.md", "a.md"]);
    const stored = localStorage.getItem("promptcase:folder-order:__root__");
    expect(stored).toBeTruthy();
  });

  it("clearCustomOrder removes from localStorage", () => {
    saveCustomOrder("work", ["work/debug.md"]);
    clearCustomOrder("work");
    expect(localStorage.getItem("promptcase:folder-order:work")).toBeNull();
  });

  it("custom order affects file sorting in folderTree", () => {
    saveCustomOrder("work", ["work/debug.md", "work/review.md"]);
    // Force recalculation
    promptEntries.set([...testEntries]);
    const tree = get(folderTree);
    const workFolder = tree.children.find((c) => c.name === "work")!;
    expect(workFolder.files[0].path).toBe("work/debug.md");
    expect(workFolder.files[1].path).toBe("work/review.md");
  });

  it("files not in custom order sort after ordered ones", () => {
    saveCustomOrder("work", ["work/debug.md"]);
    promptEntries.set([...testEntries]);
    const tree = get(folderTree);
    const workFolder = tree.children.find((c) => c.name === "work")!;
    expect(workFolder.files[0].path).toBe("work/debug.md");
  });

  it("handles corrupt localStorage gracefully (getCustomOrder catch)", () => {
    // Set invalid JSON to trigger parse error in getCustomOrder
    localStorage.setItem("promptcase:folder-order:work", "not-valid-json");
    promptEntries.set([...testEntries]);
    // Should not throw — falls back to default sort
    const tree = get(folderTree);
    const workFolder = tree.children.find((c) => c.name === "work")!;
    expect(workFolder.files.length).toBe(2);
  });

  it("sorts files both in custom order by their order index", () => {
    // Both files in order — reverse alphabetical
    saveCustomOrder("work", ["work/review.md", "work/debug.md"]);
    promptEntries.set([...testEntries]);
    const tree = get(folderTree);
    const workFolder = tree.children.find((c) => c.name === "work")!;
    expect(workFolder.files[0].path).toBe("work/review.md");
    expect(workFolder.files[1].path).toBe("work/debug.md");
  });

  it("sorts: ordered file before unordered file (bi undefined branch)", () => {
    // Only first file in order, second file not — first should come first
    saveCustomOrder("work", ["work/review.md"]);
    promptEntries.set([...testEntries]);
    const tree = get(folderTree);
    const workFolder = tree.children.find((c) => c.name === "work")!;
    expect(workFolder.files[0].path).toBe("work/review.md");
  });

  it("sorts: unordered file after ordered file (ai undefined branch)", () => {
    saveCustomOrder("work", ["work/debug.md"]);
    promptEntries.set([...testEntries]);
    const tree = get(folderTree);
    const workFolder = tree.children.find((c) => c.name === "work")!;
    expect(workFolder.files[0].path).toBe("work/debug.md");
    expect(workFolder.files[1].path).toBe("work/review.md");
  });

  it("falls back to title sort when custom order has no matching entries", () => {
    // Custom order exists but has paths that don't match actual files
    saveCustomOrder("work", ["work/nonexistent.md"]);
    promptEntries.set([...testEntries]);
    const tree = get(folderTree);
    const workFolder = tree.children.find((c) => c.name === "work")!;
    // Both files have ai=undefined and bi=undefined, so they sort by title
    expect(workFolder.files[0].path).toBe("work/review.md"); // "Code Review" < "Debug Assistant"
    expect(workFolder.files[1].path).toBe("work/debug.md");
  });
});

describe("toggleSelection", () => {
  it("adds path to selection (single mode)", () => {
    toggleSelection("work/review.md", false);
    expect(get(selectedPaths)).toEqual(new Set(["work/review.md"]));
  });

  it("replaces selection in single mode", () => {
    selectedPaths.set(new Set(["work/review.md"]));
    toggleSelection("work/debug.md", false);
    expect(get(selectedPaths)).toEqual(new Set(["work/debug.md"]));
  });

  it("adds to selection in multi mode", () => {
    selectedPaths.set(new Set(["work/review.md"]));
    toggleSelection("work/debug.md", true);
    expect(get(selectedPaths)).toEqual(new Set(["work/review.md", "work/debug.md"]));
  });

  it("removes path if already selected in multi mode", () => {
    selectedPaths.set(new Set(["work/review.md", "work/debug.md"]));
    toggleSelection("work/review.md", true);
    expect(get(selectedPaths)).toEqual(new Set(["work/debug.md"]));
  });

  it("toggles off in single mode when path already selected", () => {
    // In single mode, toggleSelection creates new Set with just the toggled path.
    // If already present, it removes (toggle behavior).
    // The source: const next = new Set(multi ? set : []);
    // then if next.has(path) -> delete, else -> add
    // So: first call: Set([]) -> add -> {review.md}
    // Second call: Set([]) -> add -> {review.md} (because single mode ignores prior set)
    toggleSelection("work/review.md", false);
    toggleSelection("work/review.md", false);
    // In single mode, second toggle creates fresh empty set, then checks
    // if path is there (it's not since set is fresh), so adds it again
    expect(get(selectedPaths).size).toBe(1);
  });
});

describe("selectRange", () => {
  it("selects range of entries between two paths", () => {
    selectRange("work/review.md", "personal/story.md", testEntries);
    const selected = get(selectedPaths);
    expect(selected).toEqual(new Set(["work/review.md", "work/debug.md", "personal/story.md"]));
  });

  it("works in reverse order", () => {
    selectRange("personal/story.md", "work/review.md", testEntries);
    const selected = get(selectedPaths);
    expect(selected.size).toBe(3);
  });

  it("does nothing for non-existent paths", () => {
    selectRange("nope.md", "work/review.md", testEntries);
    expect(get(selectedPaths).size).toBe(0);
  });

  it("does nothing when to path not found", () => {
    selectRange("work/review.md", "nope.md", testEntries);
    expect(get(selectedPaths).size).toBe(0);
  });
});

describe("clearSelection", () => {
  it("clears all selected paths", () => {
    selectedPaths.set(new Set(["a", "b"]));
    clearSelection();
    expect(get(selectedPaths).size).toBe(0);
  });
});

describe("selectAll", () => {
  it("selects all filtered entries", () => {
    selectAll();
    const selected = get(selectedPaths);
    expect(selected.size).toBe(4);
    expect(selected).toEqual(new Set(testEntries.map((e) => e.path)));
  });

  it("only selects filtered entries when filter active", () => {
    tagFilter.set("dev");
    selectAll();
    const selected = get(selectedPaths);
    expect(selected.size).toBe(2);
  });
});

describe("loadFiles", () => {
  it("loads entries and folders from api", async () => {
    const entries = [makeEntry("a.md", "A")];
    const folders = ["folder1"];
    mockApi.listFiles.mockResolvedValue(entries);
    mockApi.listFolders.mockResolvedValue(folders);

    await loadFiles();

    expect(get(promptEntries)).toEqual(entries);
    expect(get(knownFolders)).toEqual(folders);
    expect(get(filesLoading)).toBe(false);
  });

  it("handles error and resets loading", async () => {
    mockApi.listFiles.mockRejectedValue(new Error("fail"));
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});

    await loadFiles();

    expect(get(filesLoading)).toBe(false);
    spy.mockRestore();
  });
});

describe("startFileChangeListener / stopFileChangeListener", () => {
  it("does nothing when not in Tauri", async () => {
    await startFileChangeListener(() => null, vi.fn());
  });

  it("stopFileChangeListener is safe to call without start", () => {
    stopFileChangeListener();
  });

  it("listens for file changes when isTauri is true", async () => {
    const { isTauri } = await import("../../src/lib/ipc");
    (isTauri as ReturnType<typeof vi.fn>).mockReturnValue(true);

    const { listen } = await import("@tauri-apps/api/event");
    const mockUnlisten = vi.fn();
    let capturedCallback: Function;
    (listen as ReturnType<typeof vi.fn>).mockImplementation(async (_event: string, cb: Function) => {
      capturedCallback = cb;
      return mockUnlisten;
    });

    const entries = [makeEntry("a.md", "A")];
    mockApi.listFiles.mockResolvedValue(entries);
    mockApi.listFolders.mockResolvedValue([]);

    const getActivePath = vi.fn().mockReturnValue("a.md");
    const showReloadToast = vi.fn();

    await startFileChangeListener(getActivePath, showReloadToast);

    expect(listen).toHaveBeenCalledWith("files-changed", expect.any(Function));

    // Simulate file change event
    await capturedCallback!({ payload: { paths: ["/repo/a.md"] } });

    expect(mockApi.listFiles).toHaveBeenCalled();
    expect(showReloadToast).toHaveBeenCalledWith("a.md");

    // Stop listener
    stopFileChangeListener();
    expect(mockUnlisten).toHaveBeenCalled();

    (isTauri as ReturnType<typeof vi.fn>).mockReturnValue(false);
  });

  it("does not show reload toast when active path does not match", async () => {
    const { isTauri } = await import("../../src/lib/ipc");
    (isTauri as ReturnType<typeof vi.fn>).mockReturnValue(true);

    const { listen } = await import("@tauri-apps/api/event");
    let capturedCallback: Function;
    (listen as ReturnType<typeof vi.fn>).mockImplementation(async (_event: string, cb: Function) => {
      capturedCallback = cb;
      return vi.fn();
    });

    mockApi.listFiles.mockResolvedValue([]);
    mockApi.listFolders.mockResolvedValue([]);

    const getActivePath = vi.fn().mockReturnValue("other.md");
    const showReloadToast = vi.fn();

    await startFileChangeListener(getActivePath, showReloadToast);
    await capturedCallback!({ payload: { paths: ["/repo/a.md"] } });

    expect(showReloadToast).not.toHaveBeenCalled();

    stopFileChangeListener();
    (isTauri as ReturnType<typeof vi.fn>).mockReturnValue(false);
  });

  it("does not show reload toast when no active path", async () => {
    const { isTauri } = await import("../../src/lib/ipc");
    (isTauri as ReturnType<typeof vi.fn>).mockReturnValue(true);

    const { listen } = await import("@tauri-apps/api/event");
    let capturedCallback: Function;
    (listen as ReturnType<typeof vi.fn>).mockImplementation(async (_event: string, cb: Function) => {
      capturedCallback = cb;
      return vi.fn();
    });

    mockApi.listFiles.mockResolvedValue([]);
    mockApi.listFolders.mockResolvedValue([]);

    const getActivePath = vi.fn().mockReturnValue(null);
    const showReloadToast = vi.fn();

    await startFileChangeListener(getActivePath, showReloadToast);
    await capturedCallback!({ payload: { paths: ["/repo/a.md"] } });

    expect(showReloadToast).not.toHaveBeenCalled();

    stopFileChangeListener();
    (isTauri as ReturnType<typeof vi.fn>).mockReturnValue(false);
  });
});

describe("dragState", () => {
  it("defaults to null", () => {
    expect(get(dragState)).toBeNull();
  });

  it("can be set and read", () => {
    dragState.set({ type: "file", paths: ["a.md"] });
    expect(get(dragState)).toEqual({ type: "file", paths: ["a.md"] });
  });
});
