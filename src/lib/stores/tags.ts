import { writable } from "svelte/store";
import type { TagInfo } from "../types";
import { api } from "../ipc";

export const tags = writable<TagInfo[]>([]);
export const tagsLoading = writable<boolean>(false);

export async function loadTags(): Promise<void> {
  tagsLoading.set(true);
  try {
    const result = await api.listTags();
    tags.set(result);
  } catch (err) {
    console.error("Failed to load tags:", err);
  } finally {
    tagsLoading.set(false);
  }
}

export async function renameTag(oldName: string, newName: string): Promise<number> {
  const count = await api.renameTag(oldName, newName);
  await loadTags();
  return count;
}

export async function deleteTag(tagName: string): Promise<number> {
  const count = await api.deleteTag(tagName);
  await loadTags();
  return count;
}

export async function mergeTags(sourceTags: string[], targetTag: string): Promise<number> {
  const count = await api.mergeTags(sourceTags, targetTag);
  await loadTags();
  return count;
}
