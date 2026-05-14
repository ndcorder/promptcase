import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { get, writable } from "svelte/store";
import { createMockApi, mockIpcModule, defaultMockConfig } from "../__mocks__/ipc";
import type { PromptFile, CommitEntry } from "../../src/lib/types";

let mockApi: ReturnType<typeof createMockApi>;
let mockActiveFile: ReturnType<typeof writable<PromptFile | null>>;
let mockFileHistory: ReturnType<typeof writable<CommitEntry[]>>;

function setupMocks() {
  mockApi = createMockApi();
  mockActiveFile = writable<PromptFile | null>(null);
  mockFileHistory = writable<CommitEntry[]>([]);

  vi.doMock("../../src/lib/ipc", () => mockIpcModule(mockApi));
  vi.doMock("../../src/lib/stores/editor", () => ({
    activeFile: mockActiveFile,
    fileHistory: mockFileHistory,
    editorContent: writable(""),
  }));
}

async function loadModule() {
  return await import("../../src/lib/stores/commit");
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.resetModules();
  setupMocks();
});

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe("initCommitConfig", () => {
  it("loads config from api and applies commitDelayMs", async () => {
    mockApi.getConfig.mockResolvedValue({ ...defaultMockConfig, commitDelayMs: 3000, autoCommit: false });
    const mod = await loadModule();
    await mod.initCommitConfig();
    // After init, autoCommit is false so scheduling should be no-op
    mod.scheduleDebouncedCommit("a.md");
    vi.advanceTimersByTime(10000);
    // No commit calls because autoCommit is disabled
    expect(mockApi.generateCommitMessage).not.toHaveBeenCalled();
  });

  it("uses defaults when getConfig throws", async () => {
    mockApi.getConfig.mockRejectedValue(new Error("fail"));
    const mod = await loadModule();
    await mod.initCommitConfig();
    // Should still work with defaults (autoCommit = true, delay = 5000)
    mod.scheduleDebouncedCommit("a.md");
    vi.advanceTimersByTime(5000);
    await vi.runAllTimersAsync();
    expect(mockApi.generateCommitMessage).toHaveBeenCalledWith("a.md");
  });

  it("keeps default commitDelayMs when config value is null", async () => {
    mockApi.getConfig.mockResolvedValue({ ...defaultMockConfig, commitDelayMs: null, autoCommit: true });
    const mod = await loadModule();
    await mod.initCommitConfig();
    mod.scheduleDebouncedCommit("a.md");
    // Default delay is 5000
    vi.advanceTimersByTime(4999);
    expect(mockApi.generateCommitMessage).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1);
    await vi.runAllTimersAsync();
    expect(mockApi.generateCommitMessage).toHaveBeenCalled();
  });
});

describe("scheduleDebouncedCommit", () => {
  it("adds path and debounces the commit", async () => {
    const mod = await loadModule();
    mod.scheduleDebouncedCommit("a.md");
    mod.scheduleDebouncedCommit("b.md");
    // Timer restarted, so nothing committed yet
    expect(mockApi.generateCommitMessage).not.toHaveBeenCalled();
    vi.advanceTimersByTime(5000);
    await vi.runAllTimersAsync();
    expect(mockApi.generateCommitMessage).toHaveBeenCalledWith("a.md");
    expect(mockApi.generateCommitMessage).toHaveBeenCalledWith("b.md");
  });

  it("does nothing when autoCommit is disabled", async () => {
    mockApi.getConfig.mockResolvedValue({ ...defaultMockConfig, autoCommit: false });
    const mod = await loadModule();
    await mod.initCommitConfig();
    mod.scheduleDebouncedCommit("a.md");
    vi.advanceTimersByTime(10000);
    await vi.runAllTimersAsync();
    expect(mockApi.generateCommitMessage).not.toHaveBeenCalled();
  });

  it("resets debounce timer on repeated calls", async () => {
    const mod = await loadModule();
    mod.scheduleDebouncedCommit("a.md");
    vi.advanceTimersByTime(3000);
    mod.scheduleDebouncedCommit("a.md"); // restart timer
    vi.advanceTimersByTime(3000);
    // Only 3s since last call, not 5s — should not have fired
    expect(mockApi.generateCommitMessage).not.toHaveBeenCalled();
    vi.advanceTimersByTime(2000);
    await vi.runAllTimersAsync();
    expect(mockApi.generateCommitMessage).toHaveBeenCalledTimes(1);
  });
});

describe("flushCommits", () => {
  it("returns early when dirtyFiles is empty", async () => {
    const mod = await loadModule();
    await mod.flushCommits();
    expect(mockApi.generateCommitMessage).not.toHaveBeenCalled();
  });

  it("commits each dirty file", async () => {
    mockApi.generateCommitMessage.mockResolvedValueOnce("msg-a").mockResolvedValueOnce("msg-b");
    const mod = await loadModule();
    mod.scheduleDebouncedCommit("a.md");
    mod.scheduleDebouncedCommit("b.md");
    mod.cancelPendingCommits(); // clear timer but keep dirty files — wait, cancel clears files too
    // Instead, directly trigger flushCommits after scheduling (dirty files exist, timer pending)
    vi.resetModules();
    setupMocks();
    mockApi.generateCommitMessage.mockResolvedValueOnce("msg-a").mockResolvedValueOnce("msg-b");
    const mod2 = await loadModule();
    mod2.scheduleDebouncedCommit("a.md");
    mod2.scheduleDebouncedCommit("b.md");
    vi.advanceTimersByTime(5000);
    await vi.runAllTimersAsync();
    expect(mockApi.commitFile).toHaveBeenCalledWith("a.md", "msg-a");
    expect(mockApi.commitFile).toHaveBeenCalledWith("b.md", "msg-b");
  });

  it("warns and continues when a commit fails", async () => {
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    mockApi.generateCommitMessage.mockResolvedValue("msg");
    mockApi.commitFile.mockRejectedValueOnce(new Error("commit fail"));
    const mod = await loadModule();
    mod.scheduleDebouncedCommit("a.md");
    mod.scheduleDebouncedCommit("b.md");
    vi.advanceTimersByTime(5000);
    await vi.runAllTimersAsync();
    expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining("Failed to commit a.md"), expect.any(Error));
    // b.md should still be attempted
    expect(mockApi.generateCommitMessage).toHaveBeenCalledWith("b.md");
    warnSpy.mockRestore();
  });

  it("refreshes history when activeFile matches a committed path", async () => {
    const historyData: CommitEntry[] = [{ hash: "abc", date: "2025-01-01", message: "m", additions: 1, deletions: 0 }];
    mockApi.gitLog.mockResolvedValue(historyData);
    mockActiveFile.set({ path: "a.md", frontmatter: {} as any, body: "", raw: "" });
    const mod = await loadModule();
    mod.scheduleDebouncedCommit("a.md");
    vi.advanceTimersByTime(5000);
    await vi.runAllTimersAsync();
    expect(mockApi.gitLog).toHaveBeenCalledWith("a.md");
    expect(get(mockFileHistory)).toEqual(historyData);
  });

  it("warns when history refresh fails", async () => {
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    mockApi.gitLog.mockRejectedValue(new Error("log fail"));
    mockActiveFile.set({ path: "a.md", frontmatter: {} as any, body: "", raw: "" });
    const mod = await loadModule();
    mod.scheduleDebouncedCommit("a.md");
    vi.advanceTimersByTime(5000);
    await vi.runAllTimersAsync();
    expect(warnSpy).toHaveBeenCalledWith("Failed to refresh history:", expect.any(Error));
    warnSpy.mockRestore();
  });

  it("does not refresh history when activeFile is null", async () => {
    mockActiveFile.set(null);
    const mod = await loadModule();
    mod.scheduleDebouncedCommit("a.md");
    vi.advanceTimersByTime(5000);
    await vi.runAllTimersAsync();
    expect(mockApi.gitLog).not.toHaveBeenCalled();
  });

  it("does not refresh history when activeFile path not in committed paths", async () => {
    mockActiveFile.set({ path: "other.md", frontmatter: {} as any, body: "", raw: "" });
    const mod = await loadModule();
    mod.scheduleDebouncedCommit("a.md");
    vi.advanceTimersByTime(5000);
    await vi.runAllTimersAsync();
    expect(mockApi.gitLog).not.toHaveBeenCalled();
  });
});

describe("cancelPendingCommits", () => {
  it("clears the timer and dirty files", async () => {
    const mod = await loadModule();
    mod.scheduleDebouncedCommit("a.md");
    mod.cancelPendingCommits();
    vi.advanceTimersByTime(10000);
    await vi.runAllTimersAsync();
    expect(mockApi.generateCommitMessage).not.toHaveBeenCalled();
  });

  it("is safe to call when no timer is pending", async () => {
    const mod = await loadModule();
    expect(() => mod.cancelPendingCommits()).not.toThrow();
  });
});
