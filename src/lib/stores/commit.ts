import { get } from "svelte/store";
import { api } from "../ipc";
import { activeFile, fileHistory } from "./editor";

let dirtyFiles = new Set<string>();
let debounceTimer: ReturnType<typeof setTimeout> | null = null;
let commitDelayMs = 5000;

/** Load commit delay from config (call once at startup). */
export async function initCommitConfig(): Promise<void> {
  try {
    const config = await api.getConfig();
    if (config.commitDelayMs) {
      commitDelayMs = config.commitDelayMs;
    }
  } catch {
    // use default
  }
}

/** Mark a file as dirty and (re)start the debounce timer. */
export function scheduleDebouncedCommit(path: string): void {
  dirtyFiles.add(path);

  if (debounceTimer !== null) {
    clearTimeout(debounceTimer);
  }

  debounceTimer = setTimeout(() => {
    debounceTimer = null;
    flushCommits();
  }, commitDelayMs);
}

/** Commit all dirty files immediately. Call on app close. */
export async function flushCommits(): Promise<void> {
  if (dirtyFiles.size === 0) return;

  const paths = [...dirtyFiles];
  dirtyFiles.clear();

  for (const path of paths) {
    try {
      const message = await api.generateCommitMessage(path);
      await api.commitFile(path, message);
    } catch (err) {
      console.warn(`Failed to commit ${path}:`, err);
    }
  }

  // Refresh history for the currently active file
  const current = get(activeFile);
  if (current && paths.includes(current.path)) {
    try {
      const history = await api.gitLog(current.path);
      fileHistory.set(history);
    } catch (err) {
      console.warn("Failed to refresh history:", err);
    }
  }
}

/** Cancel any pending commit. */
export function cancelPendingCommits(): void {
  if (debounceTimer !== null) {
    clearTimeout(debounceTimer);
    debounceTimer = null;
  }
  dirtyFiles.clear();
}
