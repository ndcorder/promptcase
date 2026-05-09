import { writable } from "svelte/store";
import { api } from "../ipc";
import type { TestCaseResult } from "../types";

export const evalRunning = writable(false);
export const evalResults = writable<TestCaseResult[]>([]);
export const evalError = writable<string | null>(null);
export const evalSummary = writable<{ passed: number; total: number } | null>(null);

let listenersInitialized = false;
let unlisten: Array<() => void> = [];

export async function initEvalListeners(): Promise<void> {
  if (listenersInitialized) return;
  listenersInitialized = true;

  const { listen } = await import("@tauri-apps/api/event");

  const u1 = await listen<TestCaseResult>("eval-result", (event) => {
    evalResults.update((r) => [...r, event.payload]);
  });

  const u2 = await listen<{ passed: number; total: number }>("eval-done", (event) => {
    evalRunning.set(false);
    evalSummary.set(event.payload);
  });

  unlisten = [u1, u2];
}

export function destroyEvalListeners(): void {
  for (const fn of unlisten) fn();
  unlisten = [];
  listenersInitialized = false;
}

export async function runEval(
  path: string,
  provider: string,
  model: string,
  temperature: number,
  maxTokens: number,
): Promise<void> {
  evalResults.set([]);
  evalSummary.set(null);
  evalError.set(null);
  evalRunning.set(true);

  try {
    await api.runEval(path, provider, model, temperature, maxTokens);
  } catch (err) {
    evalRunning.set(false);
    evalError.set(String(err));
  }
}
