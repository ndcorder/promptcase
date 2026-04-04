<script lang="ts">
  import type { SavedFilter } from "../types";
  import { tagFilter, searchQuery, activeSavedFilter } from "../stores/files";
  import {
    applySavedFilter,
    clearSavedFilter,
    matchesSavedFilter,
    createSavedFilter,
    updateSavedFilter,
    deleteSavedFilter,
    loadSavedFilters,
  } from "../stores/savedFilters";
  import SmartFolderContextMenu from "./SmartFolderContextMenu.svelte";
  import InputDialog from "./InputDialog.svelte";
  import ConfirmDialog from "./ConfirmDialog.svelte";

  let filters = $state<SavedFilter[]>([]);
  let contextMenu = $state<{ index: number; x: number; y: number } | null>(null);
  let inputVisible = $state(false);
  let inputTitle = $state("");
  let inputDefault = $state("");
  let inputMode = $state<"save" | "edit">("save");
  let editIndex = $state(-1);
  let deleteConfirmVisible = $state(false);
  let deleteIndex = $state(-1);

  async function reload() {
    filters = await loadSavedFilters();
  }

  $effect(() => {
    reload();
  });

  // Deactivate saved filter when stores change externally (not matching active filter)
  $effect(() => {
    const tag = $tagFilter;
    const query = $searchQuery;
    const active = $activeSavedFilter;
    if (active && !matchesSavedFilter(active, tag, query)) {
      activeSavedFilter.set(null);
    }
  });

  function handleClick(filter: SavedFilter) {
    const active = $activeSavedFilter;
    if (active && active.name === filter.name && active.tag === filter.tag && active.query === filter.query) {
      clearSavedFilter();
    } else {
      applySavedFilter(filter);
    }
  }

  function handleContextMenu(e: MouseEvent, index: number) {
    e.preventDefault();
    contextMenu = { index, x: e.clientX, y: e.clientY };
  }

  function handleEditStart() {
    if (contextMenu === null) return;
    const idx = contextMenu.index;
    const filter = filters[idx];
    contextMenu = null;
    inputMode = "edit";
    editIndex = idx;
    inputTitle = "Rename Filter";
    inputDefault = filter.name;
    inputVisible = true;
  }

  function handleDeleteStart() {
    if (contextMenu === null) return;
    deleteIndex = contextMenu.index;
    contextMenu = null;
    deleteConfirmVisible = true;
  }

  async function handleInputConfirm(name: string) {
    inputVisible = false;
    if (inputMode === "save") {
      await createSavedFilter(name, $tagFilter, $searchQuery);
    } else {
      await updateSavedFilter(editIndex, { name });
    }
    await reload();
  }

  async function handleDeleteConfirm() {
    deleteConfirmVisible = false;
    await deleteSavedFilter(deleteIndex);
    await reload();
  }

  function handleSaveCurrent() {
    inputMode = "save";
    inputTitle = "Save Filter";
    inputDefault = "";
    inputVisible = true;
  }

  function isActive(filter: SavedFilter): boolean {
    const active = $activeSavedFilter;
    return !!active && active.name === filter.name && active.tag === filter.tag && active.query === filter.query;
  }

  function showSaveButton(): boolean {
    const tag = $tagFilter;
    const query = $searchQuery;
    if (!tag && !query) return false;
    return !filters.some((f) => matchesSavedFilter(f, tag, query));
  }
</script>

{#if filters.length > 0 || showSaveButton()}
  <div class="smart-folders">
    {#each filters as filter, index}
      <button
        class="filter-row"
        class:active={isActive(filter)}
        onclick={() => handleClick(filter)}
        oncontextmenu={(e) => handleContextMenu(e, index)}
      >
        <svg class="filter-icon" width="12" height="12" viewBox="0 0 12 12">
          <path d="M1 2h10L7.5 6.5V10L4.5 11V6.5L1 2z" fill="none" stroke="currentColor" stroke-width="1.2" stroke-linejoin="round"/>
        </svg>
        <span class="filter-name">{filter.name}</span>
      </button>
    {/each}

    {#if showSaveButton()}
      <button class="save-btn" onclick={handleSaveCurrent}>
        <svg width="10" height="10" viewBox="0 0 10 10">
          <path d="M5 1v8M1 5h8" stroke="currentColor" stroke-width="1.2" stroke-linecap="round"/>
        </svg>
        Save current filter
      </button>
    {/if}
  </div>
{/if}

{#if contextMenu}
  <SmartFolderContextMenu
    x={contextMenu.x}
    y={contextMenu.y}
    onEdit={handleEditStart}
    onDelete={handleDeleteStart}
    onClose={() => (contextMenu = null)}
  />
{/if}

<InputDialog
  visible={inputVisible}
  title={inputTitle}
  placeholder="Filter name..."
  defaultValue={inputDefault}
  onConfirm={handleInputConfirm}
  onCancel={() => (inputVisible = false)}
/>

<ConfirmDialog
  visible={deleteConfirmVisible}
  title="Delete Filter"
  message="Remove this saved filter? This cannot be undone."
  confirmLabel="Delete"
  cancelLabel="Cancel"
  onConfirm={handleDeleteConfirm}
  onCancel={() => (deleteConfirmVisible = false)}
/>

<style>
  .smart-folders {
    padding: var(--space-1) var(--space-2);
    display: flex;
    flex-direction: column;
    gap: 1px;
  }
  .filter-row {
    display: flex;
    align-items: center;
    gap: var(--space-2);
    padding: var(--space-1) var(--space-2);
    border-radius: var(--radius-sm);
    color: var(--text-secondary);
    font-size: var(--font-size-sm);
    text-align: left;
    transition: background var(--transition-fast), color var(--transition-fast);
    cursor: pointer;
  }
  .filter-row:hover {
    background: rgba(255, 255, 255, 0.06);
    color: var(--text-primary);
  }
  .filter-row.active {
    background: color-mix(in srgb, var(--accent) 18%, transparent);
    color: var(--accent);
  }
  .filter-row.active:hover {
    background: color-mix(in srgb, var(--accent) 24%, transparent);
  }
  .filter-icon {
    flex-shrink: 0;
    opacity: 0.7;
  }
  .filter-row.active .filter-icon {
    opacity: 1;
  }
  .filter-name {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .save-btn {
    display: flex;
    align-items: center;
    gap: var(--space-2);
    padding: var(--space-1) var(--space-2);
    border-radius: var(--radius-sm);
    color: var(--text-tertiary);
    font-size: var(--font-size-xs);
    text-align: left;
    transition: background var(--transition-fast), color var(--transition-fast);
    cursor: pointer;
  }
  .save-btn:hover {
    background: rgba(255, 255, 255, 0.06);
    color: var(--text-secondary);
  }
</style>
