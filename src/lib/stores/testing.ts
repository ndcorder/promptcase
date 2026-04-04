import { writable, get } from "svelte/store";
import { api } from "../ipc";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type LlmProvider = "anthropic" | "openai";

export interface LlmMessage {
  role: string;
  content: string;
}

export interface TestingConfig {
  provider: LlmProvider;
  model: string;
  temperature: number;
  maxTokens: number;
}

export interface TokenUsage {
  inputTokens: number;
  outputTokens: number;
}

// ---------------------------------------------------------------------------
// State
// ---------------------------------------------------------------------------

export const testingConfig = writable<TestingConfig>({
  provider: "anthropic",
  model: "claude-sonnet-4-20250514",
  temperature: 0.7,
  maxTokens: 1024,
});

export const isRunning = writable(false);
export const responseText = writable("");
export const tokenUsage = writable<TokenUsage | null>(null);
export const testError = writable<string | null>(null);

// ---------------------------------------------------------------------------
// Provider model lists
// ---------------------------------------------------------------------------

export const providerModels: Record<LlmProvider, string[]> = {
  anthropic: [
    "claude-sonnet-4-20250514",
    "claude-haiku-4-20250414",
    "claude-opus-4-20250514",
  ],
  openai: [
    "gpt-4o",
    "gpt-4o-mini",
    "gpt-4-turbo",
    "o3-mini",
  ],
};

// ---------------------------------------------------------------------------
// Event listener setup (called once on app mount)
// ---------------------------------------------------------------------------

let listenersInitialized = false;
let unlisten: Array<() => void> = [];

export async function initTestingListeners(): Promise<void> {
  if (listenersInitialized) return;
  listenersInitialized = true;

  const { listen } = await import("@tauri-apps/api/event");

  const u1 = await listen<{ text: string }>("prompt-response-chunk", (event) => {
    responseText.update((t) => t + event.payload.text);
  });

  const u2 = await listen<{
    model: string;
    inputTokens: number;
    outputTokens: number;
  }>("prompt-response-done", (event) => {
    isRunning.set(false);
    tokenUsage.set({
      inputTokens: event.payload.inputTokens,
      outputTokens: event.payload.outputTokens,
    });
  });

  const u3 = await listen<{ error: string }>("prompt-response-error", (event) => {
    isRunning.set(false);
    testError.set(event.payload.error);
  });

  unlisten = [u1, u2, u3];
}

export function destroyTestingListeners(): void {
  for (const fn of unlisten) fn();
  unlisten = [];
  listenersInitialized = false;
}

// ---------------------------------------------------------------------------
// Actions
// ---------------------------------------------------------------------------

export async function runPrompt(messages: LlmMessage[]): Promise<void> {
  const config = get(testingConfig);
  responseText.set("");
  tokenUsage.set(null);
  testError.set(null);
  isRunning.set(true);

  try {
    await api.runPrompt({
      provider: config.provider,
      model: config.model,
      messages,
      temperature: config.temperature,
      maxTokens: config.maxTokens,
    });
  } catch (err) {
    isRunning.set(false);
    testError.set(String(err));
  }
}

export async function cancelPrompt(): Promise<void> {
  try {
    await api.cancelPrompt();
  } catch {
    // ignore
  }
  isRunning.set(false);
}
