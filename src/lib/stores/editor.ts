import { writable, derived, get } from "svelte/store";
import type { PromptFile, TabInfo, LintResult, CommitEntry } from "../types";
import { api } from "../ipc";
import { selectedPath, loadFiles } from "./files";
import { addToast } from "./toast";
import { scheduleDebouncedCommit } from "./commit";

export const openTabs = writable<TabInfo[]>([]);
export const activeFile = writable<PromptFile | null>(null);
export const editorContent = writable<string>("");
export const tabBuffers = writable<Map<string, string>>(new Map());
export const lintResults = writable<LintResult[]>([]);
export const fileHistory = writable<CommitEntry[]>([]);
export const tokenCounts = writable<Record<string, number>>({});
export const showPreview = writable(false);
export const resolvedText = writable("");
export const variableValues = writable<Record<string, string>>({});
export const showSidebar = writable(true);
export const showInspector = writable(true);
export const showBottomPanel = writable(true);
export const isLoading = writable(false);

export const activeTab = derived(openTabs, ($tabs) =>
  $tabs.find((t) => t.active),
);

export const hasUnsavedChanges = derived(
  [activeFile, editorContent],
  ([$file, $content]) => {
    if (!$file) return false;
    return $file.body !== $content;
  },
);

/** Save current editor content into the tab buffer for the active tab. */
function saveCurrentBuffer(): void {
  const file = get(activeFile);
  if (!file) return;
  const content = get(editorContent);
  if (content !== file.body) {
    tabBuffers.update((m) => {
      const next = new Map(m);
      next.set(file.path, content);
      return next;
    });
  }
}

export async function openFile(path: string): Promise<void> {
  // Save the current tab's unsaved content before switching away
  saveCurrentBuffer();

  const tabs = get(openTabs);
  const existingTab = tabs.find((t) => t.path === path);

  if (existingTab) {
    openTabs.set(
      tabs.map((t) => ({ ...t, active: t.path === path })),
    );
  } else {
    openTabs.set([
      ...tabs.map((t) => ({ ...t, active: false })),
      { path, title: path.split("/").pop() || path, modified: false, active: true },
    ]);
  }

  selectedPath.set(path);
  isLoading.set(true);

  try {
    const file = await api.readFile(path);
    activeFile.set(file);

    // Restore from buffer if the tab had unsaved edits, otherwise use file content
    const buffers = get(tabBuffers);
    const buffered = buffers.get(path);
    editorContent.set(buffered !== undefined ? buffered : file.body);

    // Update tab title
    openTabs.update((tabs) =>
      tabs.map((t) =>
        t.path === path ? { ...t, title: file.frontmatter.title || t.title } : t,
      ),
    );

    // Load history and lint results in parallel
    const [history, lint] = await Promise.all([
      api.gitLog(path).catch((err) => { console.warn("gitLog failed:", err); return []; }),
      api.lintFile(path).catch(() => []),
    ]);

    fileHistory.set(history);
    lintResults.set(lint);
  } catch (err) {
    console.error("Failed to open file:", err);
    addToast("Failed to open file", "error");
  } finally {
    isLoading.set(false);
  }
}

export async function saveFile(): Promise<void> {
  const file = get(activeFile);
  const content = get(editorContent);
  if (!file) return;

  isLoading.set(true);

  try {
    await api.writeFile(file.path, undefined, content);

    activeFile.update((f) => (f ? { ...f, body: content } : null));
    openTabs.update((tabs) =>
      tabs.map((t) =>
        t.path === file.path ? { ...t, modified: false } : t,
      ),
    );

    // Clear the buffer — content is now persisted
    tabBuffers.update((m) => {
      const next = new Map(m);
      next.delete(file.path);
      return next;
    });

    // Refresh lint results
    const lint = await api.lintFile(file.path).catch(() => []);
    lintResults.set(lint);

    // Schedule debounced git commit
    scheduleDebouncedCommit(file.path);

    // Refresh file list
    await loadFiles();

    addToast("File saved", "success", 2000);
  } catch (err) {
    console.error("Failed to save file:", err);
    addToast("Failed to save file", "error");
  } finally {
    isLoading.set(false);
  }
}

export function closeTab(path: string): void {
  const tabs = get(openTabs);
  const idx = tabs.findIndex((t) => t.path === path);
  if (idx === -1) return;

  // Remove buffer for the closed tab
  tabBuffers.update((m) => {
    const next = new Map(m);
    next.delete(path);
    return next;
  });

  const wasActive = tabs[idx].active;
  const newTabs = tabs.filter((t) => t.path !== path);

  if (wasActive && newTabs.length > 0) {
    const newActiveIdx = Math.min(idx, newTabs.length - 1);
    newTabs[newActiveIdx].active = true;
    openTabs.set(newTabs);
    openFile(newTabs[newActiveIdx].path);
  } else {
    openTabs.set(newTabs);
    if (newTabs.length === 0) {
      activeFile.set(null);
      editorContent.set("");
      selectedPath.set(null);
    }
  }
}

export async function updateTokenCounts(text: string): Promise<void> {
  try {
    const config = await api.getConfig();
    const results = await Promise.all(
      config.tokenCountModels.map(async (model) => ({
        model,
        count: await api.countTokens(text, model),
      })),
    );
    const counts: Record<string, number> = {};
    for (const r of results) {
      counts[r.model] = r.count;
    }
    tokenCounts.set(counts);
  } catch {
    // ignore token count errors
  }
}

export function markModified(): void {
  const file = get(activeFile);
  if (!file) return;
  openTabs.update((tabs) =>
    tabs.map((t) =>
      t.path === file.path ? { ...t, modified: true } : t,
    ),
  );
}
