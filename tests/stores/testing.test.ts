import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { get } from "svelte/store";
import { createMockApi, mockIpcModule } from "../__mocks__/ipc";

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
  return await import("../../src/lib/stores/testing");
}

beforeEach(() => {
  vi.resetModules();
  setupMocks();
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("providerModels", () => {
  it("contains anthropic and openai model lists", async () => {
    const mod = await loadModule();
    expect(mod.providerModels.anthropic).toContain("claude-sonnet-4-20250514");
    expect(mod.providerModels.openai).toContain("gpt-4o");
    expect(mod.providerModels.anthropic.length).toBe(3);
    expect(mod.providerModels.openai.length).toBe(4);
  });
});

describe("initTestingListeners", () => {
  it("sets up three event listeners", async () => {
    const mod = await loadModule();
    await mod.initTestingListeners();
    expect(listeners.has("prompt-response-chunk")).toBe(true);
    expect(listeners.has("prompt-response-done")).toBe(true);
    expect(listeners.has("prompt-response-error")).toBe(true);
  });

  it("is a no-op on second call", async () => {
    const mod = await loadModule();
    await mod.initTestingListeners();
    const size = listeners.size;
    await mod.initTestingListeners();
    expect(listeners.size).toBe(size);
  });
});

describe("event handling", () => {
  it("chunk event appends text to responseText", async () => {
    const mod = await loadModule();
    await mod.initTestingListeners();
    listeners.get("prompt-response-chunk")!({ payload: { text: "Hello" } });
    listeners.get("prompt-response-chunk")!({ payload: { text: " World" } });
    expect(get(mod.responseText)).toBe("Hello World");
  });

  it("done event sets token usage and stops running", async () => {
    const mod = await loadModule();
    await mod.initTestingListeners();
    mod.isRunning.set(true);
    listeners.get("prompt-response-done")!({ payload: { model: "m", inputTokens: 10, outputTokens: 20 } });
    expect(get(mod.isRunning)).toBe(false);
    expect(get(mod.tokenUsage)).toEqual({ inputTokens: 10, outputTokens: 20 });
  });

  it("error event sets testError and stops running", async () => {
    const mod = await loadModule();
    await mod.initTestingListeners();
    mod.isRunning.set(true);
    listeners.get("prompt-response-error")!({ payload: { error: "timeout" } });
    expect(get(mod.isRunning)).toBe(false);
    expect(get(mod.testError)).toBe("timeout");
  });
});

describe("destroyTestingListeners", () => {
  it("calls all unlisten functions and allows reinitialization", async () => {
    const mod = await loadModule();
    await mod.initTestingListeners();
    mod.destroyTestingListeners();
    expect(unlistenFns.get("prompt-response-chunk")!).toHaveBeenCalled();
    expect(unlistenFns.get("prompt-response-done")!).toHaveBeenCalled();
    expect(unlistenFns.get("prompt-response-error")!).toHaveBeenCalled();
    // Can reinit
    listeners.clear();
    unlistenFns.clear();
    await mod.initTestingListeners();
    expect(listeners.has("prompt-response-chunk")).toBe(true);
  });
});

describe("runPrompt", () => {
  it("resets stores and calls api.runPrompt with config", async () => {
    const mod = await loadModule();
    mod.responseText.set("old");
    mod.tokenUsage.set({ inputTokens: 1, outputTokens: 1 });
    mod.testError.set("old error");
    const messages = [{ role: "user", content: "hi" }];
    await mod.runPrompt(messages);
    expect(get(mod.responseText)).toBe("");
    expect(get(mod.tokenUsage)).toBeNull();
    expect(get(mod.testError)).toBeNull();
    expect(get(mod.isRunning)).toBe(true);
    expect(mockApi.runPrompt).toHaveBeenCalledWith({
      provider: "anthropic",
      model: "claude-sonnet-4-20250514",
      messages,
      temperature: 0.7,
      maxTokens: 1024,
    });
  });

  it("sets error and stops running on failure", async () => {
    mockApi.runPrompt.mockRejectedValue(new Error("api down"));
    const mod = await loadModule();
    await mod.runPrompt([{ role: "user", content: "test" }]);
    expect(get(mod.isRunning)).toBe(false);
    expect(get(mod.testError)).toBe("Error: api down");
  });
});

describe("cancelPrompt", () => {
  it("calls api.cancelPrompt and stops running", async () => {
    const mod = await loadModule();
    mod.isRunning.set(true);
    await mod.cancelPrompt();
    expect(mockApi.cancelPrompt).toHaveBeenCalled();
    expect(get(mod.isRunning)).toBe(false);
  });

  it("stops running even when api.cancelPrompt throws", async () => {
    mockApi.cancelPrompt.mockRejectedValue(new Error("cancel fail"));
    const mod = await loadModule();
    mod.isRunning.set(true);
    await mod.cancelPrompt();
    expect(get(mod.isRunning)).toBe(false);
  });
});
