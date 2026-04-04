import { get } from "svelte/store";
import type { SavedFilter } from "../types";
import { tagFilter, searchQuery, activeSavedFilter } from "./files";
import { api } from "../ipc";

export function applySavedFilter(filter: SavedFilter): void {
  tagFilter.set(filter.tag);
  searchQuery.set(filter.query);
  activeSavedFilter.set(filter);
}

export function clearSavedFilter(): void {
  tagFilter.set("");
  searchQuery.set("");
  activeSavedFilter.set(null);
}

export function matchesSavedFilter(
  filter: SavedFilter,
  tag: string,
  query: string,
): boolean {
  return filter.tag === tag && filter.query === query;
}

export async function createSavedFilter(
  name: string,
  tag: string,
  query: string,
): Promise<void> {
  const config = await api.getConfig();
  const savedFilters = [
    ...config.savedFilters,
    { name, tag, query, icon: "" },
  ];
  await api.updateConfig({ savedFilters });
}

export async function updateSavedFilter(
  index: number,
  updates: Partial<SavedFilter>,
): Promise<void> {
  const config = await api.getConfig();
  const savedFilters = [...config.savedFilters];
  if (index >= 0 && index < savedFilters.length) {
    savedFilters[index] = { ...savedFilters[index], ...updates };
    await api.updateConfig({ savedFilters });
  }
}

export async function deleteSavedFilter(index: number): Promise<void> {
  const config = await api.getConfig();
  const savedFilters = config.savedFilters.filter((_, i) => i !== index);
  await api.updateConfig({ savedFilters });

  // If the deleted filter was active, clear it
  const active = get(activeSavedFilter);
  if (active && index < config.savedFilters.length) {
    const deleted = config.savedFilters[index];
    if (
      active.name === deleted.name &&
      active.tag === deleted.tag &&
      active.query === deleted.query
    ) {
      clearSavedFilter();
    }
  }
}

export async function loadSavedFilters(): Promise<SavedFilter[]> {
  const config = await api.getConfig();
  return config.savedFilters ?? [];
}
