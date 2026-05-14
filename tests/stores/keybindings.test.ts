import { describe, it, expect, beforeEach, vi } from "vitest";
import { createMockApi, mockIpcModule } from "../__mocks__/ipc";

const mockApi = createMockApi();
vi.mock("../../src/lib/ipc", () => mockIpcModule(mockApi));

// Module-level state requires fresh imports per test
let initKeybindings: () => Promise<void>;
let registerAction: (action: string, handler: () => void) => void;
let getShortcut: (action: string) => string;
let getAllShortcuts: () => Array<{ action: string; shortcut: string }>;
let handleGlobalKeydown: (e: KeyboardEvent) => void;

beforeEach(async () => {
  vi.clearAllMocks();
  vi.resetModules();
  // Re-apply the mock after resetModules
  vi.doMock("../../src/lib/ipc", () => mockIpcModule(mockApi));
  const mod = await import("../../src/lib/stores/keybindings");
  initKeybindings = mod.initKeybindings;
  registerAction = mod.registerAction;
  getShortcut = mod.getShortcut;
  getAllShortcuts = mod.getAllShortcuts;
  handleGlobalKeydown = mod.handleGlobalKeydown;
});

function fakeEvent(overrides: Partial<KeyboardEvent> & { key: string }): KeyboardEvent {
  const prevented = vi.fn();
  return {
    key: overrides.key,
    metaKey: overrides.metaKey ?? false,
    ctrlKey: overrides.ctrlKey ?? false,
    shiftKey: overrides.shiftKey ?? false,
    altKey: overrides.altKey ?? false,
    preventDefault: prevented,
  } as unknown as KeyboardEvent;
}

describe("initKeybindings", () => {
  it("loads custom bindings from config", async () => {
    mockApi.getConfig.mockResolvedValue({ keybindings: { save: "Ctrl+S" } });

    await initKeybindings();
    expect(getShortcut("save")).toBe("Ctrl+S");
    // Defaults are preserved for other keys
    expect(getShortcut("find")).toBe("Cmd+F");
  });

  it("uses defaults when config has no keybindings", async () => {
    mockApi.getConfig.mockResolvedValue({});

    await initKeybindings();
    expect(getShortcut("save")).toBe("Cmd+S");
  });

  it("uses defaults on error", async () => {
    mockApi.getConfig.mockRejectedValue(new Error("fail"));

    await initKeybindings();
    expect(getShortcut("save")).toBe("Cmd+S");
  });
});

describe("registerAction", () => {
  it("registers a handler that can be triggered", () => {
    const handler = vi.fn();
    registerAction("save", handler);

    // Default save is Cmd+S, simulate on Mac
    Object.defineProperty(navigator, "platform", { value: "MacIntel", configurable: true });
    const e = fakeEvent({ key: "s", metaKey: true });
    handleGlobalKeydown(e);
    expect(handler).toHaveBeenCalledOnce();
    expect(e.preventDefault).toHaveBeenCalled();
  });
});

describe("getShortcut", () => {
  it("returns shortcut for known action", () => {
    expect(getShortcut("save")).toBe("Cmd+S");
  });

  it("returns empty string for unknown action", () => {
    expect(getShortcut("nonexistent")).toBe("");
  });
});

describe("getAllShortcuts", () => {
  it("returns array of all action/shortcut pairs", () => {
    const all = getAllShortcuts();
    expect(Array.isArray(all)).toBe(true);
    expect(all.length).toBeGreaterThan(0);
    const saveEntry = all.find((s) => s.action === "save");
    expect(saveEntry).toEqual({ action: "save", shortcut: "Cmd+S" });
  });
});

describe("handleGlobalKeydown", () => {
  beforeEach(() => {
    Object.defineProperty(navigator, "platform", { value: "MacIntel", configurable: true });
  });

  it("blocks Cmd+R (browser refresh)", () => {
    const e = fakeEvent({ key: "r", metaKey: true });
    handleGlobalKeydown(e);
    expect(e.preventDefault).toHaveBeenCalled();
  });

  it("blocks F5 (browser refresh)", () => {
    const e = fakeEvent({ key: "F5" });
    handleGlobalKeydown(e);
    expect(e.preventDefault).toHaveBeenCalled();
  });

  it("blocks Cmd+Alt+I (devtools)", () => {
    const e = fakeEvent({ key: "i", metaKey: true, altKey: true });
    handleGlobalKeydown(e);
    expect(e.preventDefault).toHaveBeenCalled();
  });

  it("blocks Cmd+Shift+I (devtools)", () => {
    const e = fakeEvent({ key: "I", metaKey: true, shiftKey: true });
    handleGlobalKeydown(e);
    expect(e.preventDefault).toHaveBeenCalled();
  });

  it("blocks F12 (devtools)", () => {
    const e = fakeEvent({ key: "F12" });
    handleGlobalKeydown(e);
    expect(e.preventDefault).toHaveBeenCalled();
  });

  it("blocks Cmd+U (view source)", () => {
    const e = fakeEvent({ key: "u", metaKey: true });
    handleGlobalKeydown(e);
    expect(e.preventDefault).toHaveBeenCalled();
  });

  it("blocks Cmd+Shift+C (inspect element)", () => {
    const e = fakeEvent({ key: "C", metaKey: true, shiftKey: true });
    handleGlobalKeydown(e);
    expect(e.preventDefault).toHaveBeenCalled();
  });

  it("triggers registered action for matching shortcut", () => {
    const handler = vi.fn();
    registerAction("find", handler);
    const e = fakeEvent({ key: "f", metaKey: true });
    handleGlobalKeydown(e);
    expect(handler).toHaveBeenCalledOnce();
    expect(e.preventDefault).toHaveBeenCalled();
  });

  it("does not call handler for unregistered action", () => {
    // "openQuickOpen" is Cmd+P but no handler registered
    const e = fakeEvent({ key: "p", metaKey: true });
    handleGlobalKeydown(e);
    // Should just preventDefault, not throw
    expect(e.preventDefault).toHaveBeenCalled();
  });

  it("does nothing for unmatched key", () => {
    const e = fakeEvent({ key: "z" });
    handleGlobalKeydown(e);
    expect(e.preventDefault).not.toHaveBeenCalled();
  });

  it("handles non-Mac platform (Ctrl maps to meta shortcuts)", () => {
    Object.defineProperty(navigator, "platform", { value: "Win32", configurable: true });
    const handler = vi.fn();
    registerAction("save", handler);

    // On non-Mac, Ctrl should match Cmd shortcuts
    const e = fakeEvent({ key: "s", ctrlKey: true });
    handleGlobalKeydown(e);
    expect(handler).toHaveBeenCalledOnce();
  });

  it("matches Shift modifier in shortcuts", () => {
    const handler = vi.fn();
    registerAction("openCommandPalette", handler);
    // Cmd+Shift+P
    const e = fakeEvent({ key: "p", metaKey: true, shiftKey: true });
    handleGlobalKeydown(e);
    expect(handler).toHaveBeenCalledOnce();
  });

  it("matches Meta modifier alias (alternative for Cmd)", async () => {
    // Load with custom keybinding using "Meta" instead of "Cmd"
    mockApi.getConfig.mockResolvedValue({ keybindings: { save: "Meta+S" } });
    await initKeybindings();
    const handler = vi.fn();
    registerAction("save", handler);
    const e = fakeEvent({ key: "s", metaKey: true });
    handleGlobalKeydown(e);
    expect(handler).toHaveBeenCalledOnce();
  });

  it("matches Option modifier alias (alternative for Alt)", async () => {
    mockApi.getConfig.mockResolvedValue({ keybindings: { save: "Option+S" } });
    await initKeybindings();
    const handler = vi.fn();
    registerAction("save", handler);
    const e = fakeEvent({ key: "s", altKey: true });
    handleGlobalKeydown(e);
    expect(handler).toHaveBeenCalledOnce();
  });

  it("blocks Ctrl+R on non-Mac", () => {
    Object.defineProperty(navigator, "platform", { value: "Linux", configurable: true });
    const e = fakeEvent({ key: "r", ctrlKey: true });
    handleGlobalKeydown(e);
    expect(e.preventDefault).toHaveBeenCalled();
  });

  it("matches Ctrl shortcut on non-Mac via needsCtrl path", async () => {
    Object.defineProperty(navigator, "platform", { value: "Win32", configurable: true });
    // Set a binding that uses "Ctrl" (not "Cmd") to exercise needsCtrl branch
    mockApi.getConfig.mockResolvedValue({ keybindings: { save: "Ctrl+S" } });
    await initKeybindings();
    const handler = vi.fn();
    registerAction("save", handler);
    const e = fakeEvent({ key: "s", ctrlKey: true });
    handleGlobalKeydown(e);
    expect(handler).toHaveBeenCalledOnce();
  });
});
