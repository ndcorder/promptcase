import { writable, derived, get } from "svelte/store";
import type { PromptFile, TabInfo, LintResult, CommitEntry } from "../types";
import { api } from "../ipc";
import { selectedPath, loadFiles } from "./files";

export const openTabs = writable<TabInfo[]>([]);
export const activeFile = writable<PromptFile | null>(null);
export const editorContent = writable<string>("");
export const lintResults = writable<LintResult[]>([]);
export const fileHistory = writable<CommitEntry[]>([]);
export const tokenCounts = writable<Record<string, number>>({});
export const showPreview = writable(false);
export const resolvedText = writable("");
export const variableValues = writable<Record<string, string>>({});
export const showSidebar = writable(true);
export const showInspector = writable(true);
export const showBottomPanel = writable(true);

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

export async function openFile(path: string): Promise<void> {
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

  try {
    const file = await api.readFile(path);
    activeFile.set(file);
    editorContent.set(file.body);

    // Update tab title
    openTabs.update((tabs) =>
      tabs.map((t) =>
        t.path === path ? { ...t, title: file.frontmatter.title || t.title } : t,
      ),
    );

    // Load history and lint results in parallel
    const [history, lint] = await Promise.all([
      api.gitLog(path).catch(() => []),
      api.lintFile(path).catch(() => []),
    ]);

    fileHistory.set(history);
    lintResults.set(lint);
  } catch (err) {
    console.error("Failed to open file:", err);
  }
}

export async function saveFile(): Promise<void> {
  const file = get(activeFile);
  const content = get(editorContent);
  if (!file) return;

  try {
    await api.writeFile(file.path, undefined, content);

    activeFile.update((f) => (f ? { ...f, body: content } : null));
    openTabs.update((tabs) =>
      tabs.map((t) =>
        t.path === file.path ? { ...t, modified: false } : t,
      ),
    );

    // Refresh lint results and history
    const [lint, history] = await Promise.all([
      api.lintFile(file.path).catch(() => []),
      api.gitLog(file.path).catch(() => []),
    ]);
    lintResults.set(lint);
    fileHistory.set(history);

    // Refresh file list
    await loadFiles();
  } catch (err) {
    console.error("Failed to save file:", err);
  }
}

export function closeTab(path: string): void {
  const tabs = get(openTabs);
  const idx = tabs.findIndex((t) => t.path === path);
  if (idx === -1) return;

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
      config.token_count_models.map(async (model) => ({
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
