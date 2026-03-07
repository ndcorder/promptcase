import { writable, derived } from "svelte/store";
import type { PromptEntry, FolderNode } from "../types";
import { api } from "../ipc";

export const promptEntries = writable<PromptEntry[]>([]);
export const selectedPath = writable<string | null>(null);
export const tagFilter = writable<string>("");

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
  [promptEntries, tagFilter],
  ([$entries, $filter]) => {
    if (!$filter) return $entries;
    return $entries.filter((e) =>
      e.frontmatter.tags.some((t) =>
        t.toLowerCase().includes($filter.toLowerCase()),
      ),
    );
  },
);

export const folderTree = derived(filteredEntries, ($entries) => {
  return buildFolderTree($entries);
});

function buildFolderTree(entries: PromptEntry[]): FolderNode {
  const root: FolderNode = {
    name: "",
    path: "",
    children: [],
    files: [],
    expanded: true,
  };

  for (const entry of entries) {
    const parts = entry.path.split("/");
    const fileName = parts.pop()!;
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

    current.files.push(entry);
  }

  sortTree(root);
  return root;
}

function sortTree(node: FolderNode): void {
  node.children.sort((a, b) => a.name.localeCompare(b.name));
  node.files.sort((a, b) =>
    a.frontmatter.title.localeCompare(b.frontmatter.title),
  );
  for (const child of node.children) {
    sortTree(child);
  }
}

export async function loadFiles(): Promise<void> {
  try {
    const entries = await api.listFiles();
    promptEntries.set(entries);
  } catch (err) {
    console.error("Failed to load files:", err);
  }
}
