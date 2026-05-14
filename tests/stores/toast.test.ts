import { describe, it, expect, beforeEach, vi } from "vitest";
import { get } from "svelte/store";
import { toasts, addToast, removeToast } from "../../src/lib/stores/toast";

beforeEach(() => {
  toasts.set([]);
  vi.useRealTimers();
});

describe("addToast", () => {
  it("returns an id and adds toast to the store", () => {
    const id = addToast("hello", "info");
    expect(id).toMatch(/^toast-\d+-\d+$/);
    const current = get(toasts);
    expect(current).toHaveLength(1);
    expect(current[0]).toEqual({ id, message: "hello", type: "info", timeout: 5000 });
  });

  it("appends multiple toasts", () => {
    addToast("a", "error");
    addToast("b", "success");
    expect(get(toasts)).toHaveLength(2);
  });

  it("auto-removes after timeout when timeout > 0", () => {
    vi.useFakeTimers();
    const id = addToast("temp", "info", 3000);
    expect(get(toasts)).toHaveLength(1);
    vi.advanceTimersByTime(3000);
    expect(get(toasts)).toHaveLength(0);
  });

  it("does NOT set setTimeout when timeout is 0", () => {
    vi.useFakeTimers();
    const spy = vi.spyOn(globalThis, "setTimeout");
    const callsBefore = spy.mock.calls.length;
    addToast("persistent", "error", 0);
    expect(spy.mock.calls.length).toBe(callsBefore);
    expect(get(toasts)).toHaveLength(1);
    vi.advanceTimersByTime(60000);
    expect(get(toasts)).toHaveLength(1);
    spy.mockRestore();
  });
});

describe("removeToast", () => {
  it("removes a toast by id", () => {
    const id1 = addToast("a", "info", 0);
    const id2 = addToast("b", "info", 0);
    removeToast(id1);
    const current = get(toasts);
    expect(current).toHaveLength(1);
    expect(current[0].id).toBe(id2);
  });

  it("no-ops when id does not exist", () => {
    addToast("a", "info", 0);
    removeToast("nonexistent");
    expect(get(toasts)).toHaveLength(1);
  });
});
