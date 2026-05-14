import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { get, writable } from "svelte/store";
import type { PromptFile, TabInfo, LintResult, CommitEntry } from "../../src/lib/types";

const { mockApi, mockLoadFiles, mockScheduleDebouncedCommit, mockAddToast } = vi.hoisted(() => ({
  mockApi: {
    getConfig: vi.fn().mockResolvedValue({
      editorFontFamily: "Monaco",
      editorFontSize: 16,
      editorWordWrap: false,
      editorLineNumbers: false,
      editorShowInvisibles: true,
      tokenCountModels: ["gpt-4"],
    }),
    readFile: vi.fn(),
    writeFile: vi.fn().mockResolvedValue({ ok: true }),
    lintFile: vi.fn().mockResolvedValue([]),
    gitLog: vi.fn().mockResolvedValue([]),
    markFileWriting: vi.fn().mockResolvedValue({ ok: true }),
    unmarkFileWriting: vi.fn().mockResolvedValue({ ok: true }),
    clearRecovery: vi.fn().mockResolvedValue({ ok: true }),
    countTokens: vi.fn().mockResolvedValue(42),
    saveRecovery: vi.fn().mockResolvedValue({ ok: true }),
  },
  mockLoadFiles: vi.fn().mockResolvedValue(undefined),
  mockScheduleDebouncedCommit: vi.fn(),
  mockAddToast: vi.fn(),
}));

vi.mock("../../src/lib/ipc", () => ({
  api: mockApi,
  isTauri: vi.fn().mockReturnValue(false),
}));

vi.mock("../../src/lib/stores/files", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../src/lib/stores/files")>();
  return { ...actual, loadFiles: mockLoadFiles };
});

vi.mock("../../src/lib/stores/commit", () => ({
  scheduleDebouncedCommit: mockScheduleDebouncedCommit,
}));

vi.mock("../../src/lib/stores/toast", () => ({
  addToast: mockAddToast,
}));

import {
  editorConfig,
  loadEditorConfig,
  openTabs,
  activeFile,
  editorContent,
  tabBuffers,
  lintResults,
  fileHistory,
  tokenCounts,
  showPreview,
  resolvedText,
  variableValues,
  showSidebar,
  showInspector,
  showBottomPanel,
  isLoading,
  activeTab,
  hasUnsavedChanges,
  openFile,
  saveFile,
  closeTab,
  updateTokenCounts,
  markModified,
  startRecoveryAutoSave,
  stopRecoveryAutoSave,
} from "../../src/lib/stores/editor";

const makeFile = (path: string, body = "hello"): PromptFile => ({
  path,
  frontmatter: {
    id: path, title: path.split("/").pop()!, type: "prompt", tags: [],
    folder: "/", variables: [], includes: [], created: "", modified: "",
    starredVersions: [], tests: [],
  },
  body,
  raw: `---\n---\n${body}`,
});

beforeEach(() => {
  openTabs.set([]);
  activeFile.set(null);
  editorContent.set("");
  tabBuffers.set(new Map());
  lintResults.set([]);
  fileHistory.set([]);
  tokenCounts.set({});
  isLoading.set(false);
  showPreview.set(false);
  vi.clearAllMocks();
  vi.useRealTimers();
});

afterEach(() => {
  stopRecoveryAutoSave();
});

describe("store defaults", () => {
  it("openTabs starts empty", () => expect(get(openTabs)).toEqual([]));
  it("activeFile starts null", () => expect(get(activeFile)).toBeNull());
  it("editorContent starts empty", () => expect(get(editorContent)).toBe(""));
  it("showSidebar starts true", () => expect(get(showSidebar)).toBe(true));
  it("showInspector starts true", () => expect(get(showInspector)).toBe(true));
  it("showBottomPanel starts true", () => expect(get(showBottomPanel)).toBe(true));
  it("showPreview starts false", () => expect(get(showPreview)).toBe(false));
});

describe("activeTab", () => {
  it("returns the active tab", () => {
    openTabs.set([
      { path: "a.md", title: "A", modified: false, active: false },
      { path: "b.md", title: "B", modified: false, active: true },
    ]);
    expect(get(activeTab)?.path).toBe("b.md");
  });

  it("returns undefined when no tabs", () => {
    expect(get(activeTab)).toBeUndefined();
  });
});

describe("hasUnsavedChanges", () => {
  it("returns false when no file", () => {
    expect(get(hasUnsavedChanges)).toBe(false);
  });

  it("returns false when content matches file body", () => {
    activeFile.set(makeFile("a.md", "hello"));
    editorContent.set("hello");
    expect(get(hasUnsavedChanges)).toBe(false);
  });

  it("returns true when content differs", () => {
    activeFile.set(makeFile("a.md", "hello"));
    editorContent.set("changed");
    expect(get(hasUnsavedChanges)).toBe(true);
  });
});

describe("loadEditorConfig", () => {
  it("loads config from api", async () => {
    await loadEditorConfig();
    expect(get(editorConfig)).toEqual({
      editorFontFamily: "Monaco",
      editorFontSize: 16,
      editorWordWrap: false,
      editorLineNumbers: false,
      editorShowInvisibles: true,
    });
  });

  it("keeps defaults on error", async () => {
    mockApi.getConfig.mockRejectedValueOnce(new Error("fail"));
    const before = get(editorConfig);
    await loadEditorConfig();
    expect(get(editorConfig)).toEqual(before);
  });
});

describe("openFile", () => {
  it("opens a new file and creates a tab", async () => {
    const file = makeFile("test.md", "content");
    mockApi.readFile.mockResolvedValue(file);

    await openFile("test.md");

    expect(get(openTabs)).toHaveLength(1);
    expect(get(openTabs)[0].active).toBe(true);
    expect(get(activeFile)).toEqual(file);
    expect(get(editorContent)).toBe("content");
  });

  it("switches to existing tab without creating duplicate", async () => {
    const file = makeFile("test.md");
    mockApi.readFile.mockResolvedValue(file);
    openTabs.set([
      { path: "test.md", title: "test.md", modified: false, active: false },
      { path: "other.md", title: "other.md", modified: false, active: true },
    ]);

    await openFile("test.md");

    expect(get(openTabs)).toHaveLength(2);
    expect(get(openTabs).find((t) => t.path === "test.md")!.active).toBe(true);
    expect(get(openTabs).find((t) => t.path === "other.md")!.active).toBe(false);
  });

  it("restores from tab buffer if buffered content exists", async () => {
    const file = makeFile("test.md", "original");
    mockApi.readFile.mockResolvedValue(file);
    tabBuffers.set(new Map([["test.md", "buffered-content"]]));

    await openFile("test.md");

    expect(get(editorContent)).toBe("buffered-content");
  });

  it("saves current buffer before switching tabs", async () => {
    const fileA = makeFile("a.md", "original-a");
    const fileB = makeFile("b.md", "original-b");
    mockApi.readFile.mockResolvedValue(fileB);

    activeFile.set(fileA);
    editorContent.set("modified-a");
    openTabs.set([{ path: "a.md", title: "A", modified: true, active: true }]);

    await openFile("b.md");

    expect(get(tabBuffers).get("a.md")).toBe("modified-a");
  });

  it("does not save buffer when content matches file body", async () => {
    const fileA = makeFile("a.md", "same");
    const fileB = makeFile("b.md", "other");
    mockApi.readFile.mockResolvedValue(fileB);

    activeFile.set(fileA);
    editorContent.set("same");
    openTabs.set([{ path: "a.md", title: "A", modified: false, active: true }]);

    await openFile("b.md");

    expect(get(tabBuffers).has("a.md")).toBe(false);
  });

  it("handles error when opening file", async () => {
    mockApi.readFile.mockRejectedValue(new Error("read failed"));

    await openFile("bad.md");

    expect(mockAddToast).toHaveBeenCalledWith("Failed to open file", "error");
    expect(get(isLoading)).toBe(false);
  });

  it("loads history and lint in parallel", async () => {
    const file = makeFile("test.md");
    const history: CommitEntry[] = [{ hash: "abc", date: "", message: "init", additions: 1, deletions: 0 }];
    const lint: LintResult[] = [{ rule: "r1", severity: "warning", message: "warn" }];
    mockApi.readFile.mockResolvedValue(file);
    mockApi.gitLog.mockResolvedValue(history);
    mockApi.lintFile.mockResolvedValue(lint);

    await openFile("test.md");

    expect(get(fileHistory)).toEqual(history);
    expect(get(lintResults)).toEqual(lint);
  });

  it("handles gitLog failure gracefully", async () => {
    const file = makeFile("test.md");
    mockApi.readFile.mockResolvedValue(file);
    mockApi.gitLog.mockRejectedValue(new Error("git fail"));
    mockApi.lintFile.mockResolvedValue([]);

    await openFile("test.md");

    expect(get(fileHistory)).toEqual([]);
  });

  it("handles lintFile failure gracefully", async () => {
    const file = makeFile("test.md");
    mockApi.readFile.mockResolvedValue(file);
    mockApi.gitLog.mockResolvedValue([]);
    mockApi.lintFile.mockRejectedValue(new Error("lint fail"));

    await openFile("test.md");

    expect(get(lintResults)).toEqual([]);
  });

  it("updates tab title from frontmatter", async () => {
    const file = makeFile("test.md");
    file.frontmatter.title = "My Prompt";
    mockApi.readFile.mockResolvedValue(file);

    await openFile("test.md");

    expect(get(openTabs)[0].title).toBe("My Prompt");
  });
});

describe("saveFile", () => {
  it("saves file content and clears buffer", async () => {
    const file = makeFile("test.md", "original");
    activeFile.set(file);
    editorContent.set("updated");
    tabBuffers.set(new Map([["test.md", "updated"]]));
    openTabs.set([{ path: "test.md", title: "test.md", modified: true, active: true }]);

    await saveFile();

    expect(mockApi.writeFile).toHaveBeenCalledWith("test.md", undefined, "updated");
    expect(get(openTabs)[0].modified).toBe(false);
    expect(get(tabBuffers).has("test.md")).toBe(false);
    expect(mockScheduleDebouncedCommit).toHaveBeenCalledWith("test.md");
    expect(mockLoadFiles).toHaveBeenCalled();
    expect(mockAddToast).toHaveBeenCalledWith("File saved", "success", 2000);
  });

  it("does nothing when no active file", async () => {
    activeFile.set(null);
    await saveFile();
    expect(mockApi.writeFile).not.toHaveBeenCalled();
  });

  it("handles save error", async () => {
    activeFile.set(makeFile("test.md"));
    editorContent.set("content");
    mockApi.writeFile.mockRejectedValueOnce(new Error("write fail"));

    await saveFile();

    expect(mockAddToast).toHaveBeenCalledWith("Failed to save file", "error");
    expect(get(isLoading)).toBe(false);
  });

  it("updates activeFile body after save", async () => {
    activeFile.set(makeFile("test.md", "old"));
    editorContent.set("new content");
    openTabs.set([{ path: "test.md", title: "test.md", modified: true, active: true }]);

    await saveFile();

    expect(get(activeFile)!.body).toBe("new content");
  });

  it("handles markFileWriting failure gracefully", async () => {
    activeFile.set(makeFile("test.md"));
    editorContent.set("content");
    openTabs.set([{ path: "test.md", title: "test.md", modified: true, active: true }]);
    mockApi.markFileWriting.mockRejectedValueOnce(new Error("nope"));

    await saveFile();

    expect(mockApi.writeFile).toHaveBeenCalled();
  });

  it("refreshes lint results after save", async () => {
    activeFile.set(makeFile("test.md"));
    editorContent.set("content");
    openTabs.set([{ path: "test.md", title: "test.md", modified: true, active: true }]);
    const lint: LintResult[] = [{ rule: "r1", severity: "error", message: "err" }];
    mockApi.lintFile.mockResolvedValue(lint);

    await saveFile();

    expect(get(lintResults)).toEqual(lint);
  });
});

describe("closeTab", () => {
  it("closes a tab and activates next", () => {
    openTabs.set([
      { path: "a.md", title: "A", modified: false, active: true },
      { path: "b.md", title: "B", modified: false, active: false },
    ]);
    mockApi.readFile.mockResolvedValue(makeFile("b.md"));

    closeTab("a.md");

    const tabs = get(openTabs);
    expect(tabs).toHaveLength(1);
    expect(tabs[0].path).toBe("b.md");
    expect(tabs[0].active).toBe(true);
  });

  it("clears state when last tab is closed", () => {
    openTabs.set([{ path: "a.md", title: "A", modified: false, active: true }]);

    closeTab("a.md");

    expect(get(openTabs)).toEqual([]);
    expect(get(activeFile)).toBeNull();
    expect(get(editorContent)).toBe("");
  });

  it("removes buffer for closed tab", () => {
    tabBuffers.set(new Map([["a.md", "buffered"]]));
    openTabs.set([{ path: "a.md", title: "A", modified: false, active: true }]);

    closeTab("a.md");

    expect(get(tabBuffers).has("a.md")).toBe(false);
  });

  it("does nothing for non-existent path", () => {
    openTabs.set([{ path: "a.md", title: "A", modified: false, active: true }]);
    closeTab("nonexistent.md");
    expect(get(openTabs)).toHaveLength(1);
  });

  it("does not switch when closing inactive tab", () => {
    openTabs.set([
      { path: "a.md", title: "A", modified: false, active: true },
      { path: "b.md", title: "B", modified: false, active: false },
    ]);

    closeTab("b.md");

    const tabs = get(openTabs);
    expect(tabs).toHaveLength(1);
    expect(tabs[0].path).toBe("a.md");
    expect(tabs[0].active).toBe(true);
  });

  it("activates last tab when closing last in list", () => {
    openTabs.set([
      { path: "a.md", title: "A", modified: false, active: false },
      { path: "b.md", title: "B", modified: false, active: true },
    ]);
    mockApi.readFile.mockResolvedValue(makeFile("a.md"));

    closeTab("b.md");

    const tabs = get(openTabs);
    expect(tabs).toHaveLength(1);
    expect(tabs[0].active).toBe(true);
  });
});

describe("updateTokenCounts", () => {
  it("counts tokens for each model in config", async () => {
    mockApi.getConfig.mockResolvedValue({ tokenCountModels: ["gpt-4", "claude"] });
    mockApi.countTokens.mockImplementation(async (_text: string, model: string) =>
      model === "gpt-4" ? 10 : 20,
    );

    await updateTokenCounts("hello world");

    expect(get(tokenCounts)).toEqual({ "gpt-4": 10, claude: 20 });
  });

  it("ignores errors silently", async () => {
    mockApi.getConfig.mockRejectedValueOnce(new Error("fail"));
    await updateTokenCounts("test");
    // should not throw
  });
});

describe("markModified", () => {
  it("sets the active tab to modified", () => {
    const file = makeFile("test.md");
    activeFile.set(file);
    openTabs.set([{ path: "test.md", title: "test.md", modified: false, active: true }]);

    markModified();

    expect(get(openTabs)[0].modified).toBe(true);
  });

  it("does nothing when no active file", () => {
    activeFile.set(null);
    openTabs.set([{ path: "test.md", title: "test.md", modified: false, active: true }]);

    markModified();

    expect(get(openTabs)[0].modified).toBe(false);
  });
});

describe("recovery auto-save", () => {
  it("startRecoveryAutoSave does nothing when isTauri is false", () => {
    vi.useFakeTimers();
    startRecoveryAutoSave();
    vi.advanceTimersByTime(10000);
    expect(mockApi.saveRecovery).not.toHaveBeenCalled();
  });

  it("stopRecoveryAutoSave is safe when no interval", () => {
    stopRecoveryAutoSave();
  });

  it("saves recovery when isTauri is true and has unsaved changes", async () => {
    const { isTauri } = await import("../../src/lib/ipc");
    (isTauri as ReturnType<typeof vi.fn>).mockReturnValue(true);
    vi.useFakeTimers();

    const file = makeFile("test.md", "original");
    activeFile.set(file);
    editorContent.set("modified");

    startRecoveryAutoSave();
    vi.advanceTimersByTime(3000);

    expect(mockApi.saveRecovery).toHaveBeenCalledWith("test.md", "modified");

    stopRecoveryAutoSave();
    (isTauri as ReturnType<typeof vi.fn>).mockReturnValue(false);
  });

  it("does not save when no unsaved changes", async () => {
    const { isTauri } = await import("../../src/lib/ipc");
    (isTauri as ReturnType<typeof vi.fn>).mockReturnValue(true);
    vi.useFakeTimers();

    const file = makeFile("test.md", "same");
    activeFile.set(file);
    editorContent.set("same");

    startRecoveryAutoSave();
    vi.advanceTimersByTime(3000);

    expect(mockApi.saveRecovery).not.toHaveBeenCalled();

    stopRecoveryAutoSave();
    (isTauri as ReturnType<typeof vi.fn>).mockReturnValue(false);
  });

  it("does not save when no active file", async () => {
    const { isTauri } = await import("../../src/lib/ipc");
    (isTauri as ReturnType<typeof vi.fn>).mockReturnValue(true);
    vi.useFakeTimers();

    activeFile.set(null);
    editorContent.set("something");

    startRecoveryAutoSave();
    vi.advanceTimersByTime(3000);

    expect(mockApi.saveRecovery).not.toHaveBeenCalled();

    stopRecoveryAutoSave();
    (isTauri as ReturnType<typeof vi.fn>).mockReturnValue(false);
  });

  it("does not start twice", async () => {
    const { isTauri } = await import("../../src/lib/ipc");
    (isTauri as ReturnType<typeof vi.fn>).mockReturnValue(true);
    vi.useFakeTimers();

    const file = makeFile("test.md", "original");
    activeFile.set(file);
    editorContent.set("modified");

    startRecoveryAutoSave();
    startRecoveryAutoSave(); // second call should be no-op
    vi.advanceTimersByTime(3000);

    // Should only have one interval firing
    expect(mockApi.saveRecovery).toHaveBeenCalledTimes(1);

    stopRecoveryAutoSave();
    (isTauri as ReturnType<typeof vi.fn>).mockReturnValue(false);
  });

  it("stopRecoveryAutoSave stops the interval", async () => {
    const { isTauri } = await import("../../src/lib/ipc");
    (isTauri as ReturnType<typeof vi.fn>).mockReturnValue(true);
    vi.useFakeTimers();

    const file = makeFile("test.md", "original");
    activeFile.set(file);
    editorContent.set("modified");

    startRecoveryAutoSave();
    stopRecoveryAutoSave();
    vi.advanceTimersByTime(10000);

    expect(mockApi.saveRecovery).not.toHaveBeenCalled();
    (isTauri as ReturnType<typeof vi.fn>).mockReturnValue(false);
  });
});

describe("panel toggles", () => {
  it("toggles sidebar visibility", () => {
    expect(get(showSidebar)).toBe(true);
    showSidebar.set(false);
    expect(get(showSidebar)).toBe(false);
  });

  it("toggles inspector visibility", () => {
    expect(get(showInspector)).toBe(true);
    showInspector.set(false);
    expect(get(showInspector)).toBe(false);
  });

  it("toggles bottom panel visibility", () => {
    expect(get(showBottomPanel)).toBe(true);
    showBottomPanel.set(false);
    expect(get(showBottomPanel)).toBe(false);
  });

  it("toggles preview", () => {
    expect(get(showPreview)).toBe(false);
    showPreview.set(true);
    expect(get(showPreview)).toBe(true);
  });
});
