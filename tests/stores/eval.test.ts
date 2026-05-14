import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { get } from "svelte/store";
import { createMockApi, mockIpcModule } from "../__mocks__/ipc";
import type { TestCaseResult } from "../../src/lib/types";

type ListenCallback<T> = (event: { payload: T }) => void;
let listeners: Map<string, ListenCallback<any>>;
let unlistenFns: Map<string, ReturnType<typeof vi.fn>>;
let mockApi: ReturnType<typeof createMockApi>;

function setupMocks() {
  listeners = new Map();
  unlistenFns = new Map();
  mockApi = createMockApi();

  vi.doMock("@tauri-apps/api/event", () => ({
    listen: vi.fn(async (event: string, cb: ListenCallback<any>) => {
      listeners.set(event, cb);
      const unlisten = vi.fn();
      unlistenFns.set(event, unlisten);
      return unlisten;
    }),
  }));
  vi.doMock("../../src/lib/ipc", () => mockIpcModule(mockApi));
}

async function loadModule() {
  return await import("../../src/lib/stores/eval");
}

beforeEach(() => {
  vi.resetModules();
  setupMocks();
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("initEvalListeners", () => {
  it("sets up eval-result and eval-done listeners", async () => {
    const mod = await loadModule();
    await mod.initEvalListeners();
    expect(listeners.has("eval-result")).toBe(true);
    expect(listeners.has("eval-done")).toBe(true);
  });

  it("is a no-op on second call", async () => {
    const mod = await loadModule();
    await mod.initEvalListeners();
    const firstSize = listeners.size;
    await mod.initEvalListeners();
    expect(listeners.size).toBe(firstSize);
  });
});

describe("event handling", () => {
  it("eval-result event appends to evalResults", async () => {
    const mod = await loadModule();
    await mod.initEvalListeners();
    const result: TestCaseResult = {
      name: "test1",
      passed: true,
      assertionResults: [],
      responseText: "ok",
      durationMs: 100,
      tokenCount: 50,
    };
    listeners.get("eval-result")!({ payload: result });
    expect(get(mod.evalResults)).toEqual([result]);
    // Append a second
    const result2: TestCaseResult = { ...result, name: "test2" };
    listeners.get("eval-result")!({ payload: result2 });
    expect(get(mod.evalResults)).toEqual([result, result2]);
  });

  it("eval-done event sets summary and stops running", async () => {
    const mod = await loadModule();
    await mod.initEvalListeners();
    mod.evalRunning.set(true);
    const summary = { passed: 3, total: 5 };
    listeners.get("eval-done")!({ payload: summary });
    expect(get(mod.evalRunning)).toBe(false);
    expect(get(mod.evalSummary)).toEqual(summary);
  });
});

describe("destroyEvalListeners", () => {
  it("calls all unlisten functions and resets state", async () => {
    const mod = await loadModule();
    await mod.initEvalListeners();
    mod.destroyEvalListeners();
    expect(unlistenFns.get("eval-result")!).toHaveBeenCalled();
    expect(unlistenFns.get("eval-done")!).toHaveBeenCalled();
    // Can reinitialize after destroy
    listeners.clear();
    unlistenFns.clear();
    await mod.initEvalListeners();
    expect(listeners.has("eval-result")).toBe(true);
  });
});

describe("runEval", () => {
  it("resets stores and calls api.runEval on success", async () => {
    const mod = await loadModule();
    mod.evalResults.set([{} as TestCaseResult]);
    mod.evalSummary.set({ passed: 1, total: 1 });
    mod.evalError.set("old error");
    await mod.runEval("test.md", "anthropic", "claude-sonnet-4-20250514", 0.7, 1024);
    expect(get(mod.evalResults)).toEqual([]);
    expect(get(mod.evalSummary)).toBeNull();
    expect(get(mod.evalError)).toBeNull();
    expect(get(mod.evalRunning)).toBe(true);
    expect(mockApi.runEval).toHaveBeenCalledWith("test.md", "anthropic", "claude-sonnet-4-20250514", 0.7, 1024);
  });

  it("sets error and stops running on failure", async () => {
    mockApi.runEval.mockRejectedValue(new Error("eval failed"));
    const mod = await loadModule();
    await mod.runEval("test.md", "anthropic", "model", 0.5, 512);
    expect(get(mod.evalRunning)).toBe(false);
    expect(get(mod.evalError)).toBe("Error: eval failed");
  });
});
