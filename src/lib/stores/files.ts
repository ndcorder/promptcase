import { writable, derived, get } from "svelte/store";
import type { PromptEntry, FolderNode } from "../types";
import { api } from "../ipc";

export const promptEntries = writable<PromptEntry[]>([]);
export const selectedPath = writable<string | null>(null);
export const tagFilter = writable<string>("");
export const expandedFolders = writable<Set<string>>(new Set());
export const filesLoading = writable<boolean>(true);
export const selectedPaths = writable<Set<string>>(new Set());
export const searchQuery = writable<string>("");
export const knownFolders = writable<string[]>([]);

export const allTags = derived(promptEntries, ($entries) => {
  const tags = new Set<string>();
  for (const entry of $entries) {
    for (const tag of entry.frontmatter.tags) {
      tags.add(tag);
    }
  }
  return [...tags].sort();
});

export const filteredEntries = derived(
  [promptEntries, tagFilter, searchQuery],
  ([$entries, $filter, $search]) => {
    let result = $entries;
    if ($filter) {
      result = result.filter((e) =>
        e.frontmatter.tags.some((t) =>
          t.toLowerCase().includes($filter.toLowerCase()),
        ),
      );
    }
    if ($search) {
      const q = $search.toLowerCase();
      result = result.filter((e) =>
        (e.frontmatter.title || "").toLowerCase().includes(q) ||
        e.path.toLowerCase().includes(q),
      );
    }
    return result;
  },
);

export const folderTree = derived(
  [filteredEntries, knownFolders],
  ([$entries, $folders]) => {
    return buildFolderTree($entries, $folders);
  },
);

export const folderFileCounts = derived(folderTree, ($tree) => {
  const counts = new Map<string, number>();
  function countRecursive(node: FolderNode): number {
    let total = node.files.length;
    for (const child of node.children) {
      total += countRecursive(child);
    }
    if (node.path) {
      counts.set(node.path, total);
    }
    return total;
  }
  countRecursive($tree);
  return counts;
});

export const allFolderPaths = derived(folderTree, ($tree) => {
  const paths: string[] = [];
  function collect(node: FolderNode) {
    if (node.path) paths.push(node.path);
    for (const child of node.children) collect(child);
  }
  collect($tree);
  return paths.sort();
});

function ensureFolderNode(root: FolderNode, folderPath: string): FolderNode {
  const parts = folderPath.split("/");
  let current = root;
  for (const part of parts) {
    let child = current.children.find((c) => c.name === part);
    if (!child) {
      child = {
        name: part,
        path: current.path ? `${current.path}/${part}` : part,
        children: [],
        files: [],
        expanded: true,
      };
      current.children.push(child);
    }
    current = child;
  }
  return current;
}

function buildFolderTree(entries: PromptEntry[], folders: string[] = []): FolderNode {
  const root: FolderNode = {
    name: "",
    path: "",
    children: [],
    files: [],
    expanded: true,
  };

  // Create nodes for all known folders (including empty ones)
  for (const folderPath of folders) {
    ensureFolderNode(root, folderPath);
  }

  for (const entry of entries) {
    const parts = entry.path.split("/");
    parts.pop();
    const folderPath = parts.join("/");
    const parent = folderPath ? ensureFolderNode(root, folderPath) : root;
    parent.files.push(entry);
  }

  sortTree(root);
  return root;
}

function getCustomOrder(folderPath: string): string[] | null {
  try {
    const key = `promptcase:folder-order:${folderPath || "__root__"}`;
    const stored = localStorage.getItem(key);
    return stored ? JSON.parse(stored) : null;
  } catch {
    return null;
  }
}

export function saveCustomOrder(folderPath: string, filePaths: string[]): void {
  const key = `promptcase:folder-order:${folderPath || "__root__"}`;
  localStorage.setItem(key, JSON.stringify(filePaths));
}

export function clearCustomOrder(folderPath: string): void {
  const key = `promptcase:folder-order:${folderPath || "__root__"}`;
  localStorage.removeItem(key);
}

function sortTree(node: FolderNode): void {
  node.children.sort((a, b) => a.name.localeCompare(b.name));

  const customOrder = getCustomOrder(node.path);
  if (customOrder) {
    const orderMap = new Map(customOrder.map((p, i) => [p, i]));
    node.files.sort((a, b) => {
      const ai = orderMap.get(a.path);
      const bi = orderMap.get(b.path);
      if (ai !== undefined && bi !== undefined) return ai - bi;
      if (ai !== undefined) return -1;
      if (bi !== undefined) return 1;
      return a.frontmatter.title.localeCompare(b.frontmatter.title);
    });
  } else {
    node.files.sort((a, b) =>
      a.frontmatter.title.localeCompare(b.frontmatter.title),
    );
  }

  for (const child of node.children) {
    sortTree(child);
  }
}

export function toggleSelection(path: string, multi: boolean): void {
  selectedPaths.update((set) => {
    const next = new Set(multi ? set : []);
    if (next.has(path)) {
      next.delete(path);
    } else {
      next.add(path);
    }
    return next;
  });
}

export function selectRange(fromPath: string, toPath: string, entries: PromptEntry[]): void {
  const paths = entries.map((e) => e.path);
  const fromIdx = paths.indexOf(fromPath);
  const toIdx = paths.indexOf(toPath);
  if (fromIdx === -1 || toIdx === -1) return;
  const [start, end] = fromIdx < toIdx ? [fromIdx, toIdx] : [toIdx, fromIdx];
  const range = new Set(paths.slice(start, end + 1));
  selectedPaths.set(range);
}

export function clearSelection(): void {
  selectedPaths.set(new Set());
}

export function selectAll(): void {
  selectedPaths.update((_) => {
    const entries = get(filteredEntries);
    return new Set(entries.map((e) => e.path));
  });
}

export const dragState = writable<{
  type: "file" | "folder" | "files";
  paths: string[];
} | null>(null);

export async function loadFiles(): Promise<void> {
  filesLoading.set(true);
  try {
    const [entries, folders] = await Promise.all([
      api.listFiles(),
      api.listFolders(),
    ]);
    promptEntries.set(entries);
    knownFolders.set(folders);
  } catch (err) {
    console.error("Failed to load files:", err);
  } finally {
    filesLoading.set(false);
  }
}
