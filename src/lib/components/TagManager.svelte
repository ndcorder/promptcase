<script lang="ts">
  import { onMount } from "svelte";
  import type { TagInfo } from "../types";
  import { tags, tagsLoading, loadTags, renameTag, deleteTag, mergeTags } from "../stores/tags";
  import { loadFiles } from "../stores/files";
  import { addToast } from "../stores/toast";

  interface Props {
    onclose: () => void;
  }

  let { onclose }: Props = $props();

  let search = $state("");
  let editingTag = $state<string | null>(null);
  let editValue = $state("");
  let editInput: HTMLInputElement | undefined = $state(undefined);
  let deleteTarget = $state<string | null>(null);
  let mergeSelection = $state<Set<string>>(new Set());
  let mergeTarget = $state("");
  let mergeMode = $state(false);

  let filteredTags = $derived.by(() => {
    const list = $tags;
    if (!search) return list;
    const q = search.toLowerCase();
    return list.filter((t: TagInfo) => t.name.toLowerCase().includes(q));
  });

  onMount(() => {
    loadTags();
  });

  function handleKeydown(e: KeyboardEvent) {
    if (e.key === "Escape") {
      if (editingTag) {
        editingTag = null;
      } else if (deleteTarget) {
        deleteTarget = null;
      } else if (mergeMode) {
        mergeMode = false;
        mergeSelection = new Set();
        mergeTarget = "";
      } else {
        onclose();
      }
      e.stopPropagation();
      e.preventDefault();
    }
  }

  function startRename(tag: string) {
    editingTag = tag;
    editValue = tag;
    requestAnimationFrame(() => editInput?.focus());
  }

  async function confirmRename() {
    if (!editingTag || !editValue.trim() || editValue.trim() === editingTag) {
      editingTag = null;
      return;
    }
    try {
      const count = await renameTag(editingTag, editValue.trim());
      addToast(`Renamed tag in ${count} file${count !== 1 ? "s" : ""}`, "success", 2000);
      await loadFiles();
    } catch (err) {
      addToast("Failed to rename tag", "error");
      console.error("rename tag error:", err);
    }
    editingTag = null;
  }

  async function confirmDelete() {
    if (!deleteTarget) return;
    try {
      const count = await deleteTag(deleteTarget);
      addToast(`Deleted tag from ${count} file${count !== 1 ? "s" : ""}`, "success", 2000);
      await loadFiles();
    } catch (err) {
      addToast("Failed to delete tag", "error");
      console.error("delete tag error:", err);
    }
    deleteTarget = null;
  }

  function toggleMergeSelection(tag: string) {
    const next = new Set(mergeSelection);
    if (next.has(tag)) {
      next.delete(tag);
    } else {
      next.add(tag);
    }
    mergeSelection = next;
  }

  async function confirmMerge() {
    if (mergeSelection.size < 2 || !mergeTarget.trim()) return;
    try {
      const sources = [...mergeSelection];
      const count = await mergeTags(sources, mergeTarget.trim());
      addToast(`Merged ${sources.length} tags in ${count} file${count !== 1 ? "s" : ""}`, "success", 2000);
      mergeMode = false;
      mergeSelection = new Set();
      mergeTarget = "";
      await loadFiles();
    } catch (err) {
      addToast("Failed to merge tags", "error");
      console.error("merge tags error:", err);
    }
  }
</script>

<div
  class="overlay"
  role="dialog"
  aria-modal="true"
  aria-label="Tag Manager"
  tabindex="-1"
  onkeydown={handleKeydown}
  onclick={(e) => { if (e.target === e.currentTarget) onclose(); }}
>
  <div class="panel">
    <header class="panel-header">
      <h2 class="panel-title">Tag Manager</h2>
      <div class="header-actions">
        {#if !mergeMode}
          <button
            class="header-btn"
            onclick={() => { mergeMode = true; mergeSelection = new Set(); mergeTarget = ""; }}
            title="Merge tags"
          >Merge</button>
        {:else}
          <button
            class="header-btn cancel"
            onclick={() => { mergeMode = false; mergeSelection = new Set(); mergeTarget = ""; }}
          >Cancel</button>
        {/if}
        <button class="close-btn" onclick={onclose} aria-label="Close tag manager">
          <svg width="12" height="12" viewBox="0 0 12 12">
            <path d="M1 1l10 10M11 1L1 11" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>
          </svg>
        </button>
      </div>
    </header>

    <div class="search-bar">
      <svg class="search-icon" width="14" height="14" viewBox="0 0 14 14">
        <circle cx="6" cy="6" r="4.5" stroke="currentColor" stroke-width="1.3" fill="none"/>
        <path d="M9.5 9.5L13 13" stroke="currentColor" stroke-width="1.3" stroke-linecap="round"/>
      </svg>
      <input
        type="text"
        placeholder="Search tags..."
        bind:value={search}
      />
    </div>

    {#if mergeMode}
      <div class="merge-bar">
        <span class="merge-hint">{mergeSelection.size} selected</span>
        <input
          type="text"
          class="merge-input"
          placeholder="Target tag name..."
          bind:value={mergeTarget}
          onkeydown={(e) => { if (e.key === "Enter") confirmMerge(); }}
        />
        <button
          class="merge-confirm-btn"
          disabled={mergeSelection.size < 2 || !mergeTarget.trim()}
          onclick={confirmMerge}
        >Merge</button>
      </div>
    {/if}

    <div class="tag-list">
      {#if $tagsLoading}
        <div class="empty-state">Loading tags...</div>
      {:else if filteredTags.length === 0}
        <div class="empty-state">
          {#if search}
            No tags matching "{search}"
          {:else}
            No tags found
          {/if}
        </div>
      {:else}
        {#each filteredTags as tag (tag.name)}
          <div class="tag-row" class:merge-selected={mergeMode && mergeSelection.has(tag.name)}>
            {#if mergeMode}
              <button
                class="merge-checkbox"
                class:checked={mergeSelection.has(tag.name)}
                onclick={() => toggleMergeSelection(tag.name)}
                aria-label={`Select ${tag.name} for merge`}
              >
                {#if mergeSelection.has(tag.name)}
                  <svg width="12" height="12" viewBox="0 0 12 12">
                    <path d="M2 6l3 3 5-6" stroke="currentColor" stroke-width="1.5" fill="none" stroke-linecap="round" stroke-linejoin="round"/>
                  </svg>
                {/if}
              </button>
            {/if}

            <div class="tag-info">
              {#if editingTag === tag.name}
                <input
                  bind:this={editInput}
                  type="text"
                  class="rename-input"
                  bind:value={editValue}
                  onkeydown={(e) => { if (e.key === "Enter") confirmRename(); if (e.key === "Escape") { editingTag = null; e.stopPropagation(); } }}
                  onblur={confirmRename}
                />
              {:else}
                <span class="tag-name">{tag.name}</span>
              {/if}
              <span class="tag-count">{tag.count} file{tag.count !== 1 ? "s" : ""}</span>
            </div>

            {#if !mergeMode}
              <div class="tag-actions">
                <button
                  class="action-btn"
                  onclick={() => startRename(tag.name)}
                  title="Rename"
                  aria-label={`Rename ${tag.name}`}
                >
                  <svg width="12" height="12" viewBox="0 0 12 12">
                    <path d="M8.5 1.5l2 2L4 10H2v-2L8.5 1.5z" stroke="currentColor" stroke-width="1.2" fill="none" stroke-linejoin="round"/>
                  </svg>
                </button>
                <button
                  class="action-btn danger"
                  onclick={() => { deleteTarget = tag.name; }}
                  title="Delete"
                  aria-label={`Delete ${tag.name}`}
                >
                  <svg width="12" height="12" viewBox="0 0 12 12">
                    <path d="M2 3h8M4 3V2h4v1M3 3l.5 7h5L9 3" stroke="currentColor" stroke-width="1.2" fill="none" stroke-linecap="round" stroke-linejoin="round"/>
                  </svg>
                </button>
              </div>
            {/if}
          </div>
        {/each}
      {/if}
    </div>
  </div>
</div>

{#if deleteTarget}
  <div
    class="confirm-overlay"
    role="alertdialog"
    aria-modal="true"
    aria-label="Confirm delete tag"
    tabindex="-1"
    onclick={(e) => { if (e.target === e.currentTarget) { deleteTarget = null; } }}
    onkeydown={(e) => { if (e.key === "Escape") { deleteTarget = null; e.stopPropagation(); } }}
  >
    <div class="confirm-box">
      <p class="confirm-message">Remove tag <strong>"{deleteTarget}"</strong> from all files?</p>
      <div class="confirm-actions">
        <button class="btn-cancel" onclick={() => { deleteTarget = null; }}>Cancel</button>
        <button class="btn-delete" onclick={confirmDelete}>Delete</button>
      </div>
    </div>
  </div>
{/if}

<style>
  .overlay {
    position: fixed;
    inset: 0;
    background: rgba(0, 0, 0, 0.4);
    backdrop-filter: blur(4px);
    -webkit-backdrop-filter: blur(4px);
    display: flex;
    justify-content: center;
    padding-top: 10vh;
    z-index: 100;
  }
  .panel {
    width: 520px;
    max-height: 70vh;
    background: var(--bg-secondary);
    border: 1px solid var(--border-primary);
    border-radius: var(--radius-lg);
    display: flex;
    flex-direction: column;
    box-shadow: var(--shadow-xl);
    align-self: flex-start;
    overflow: hidden;
  }
  .panel-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: var(--space-3) var(--space-4);
    border-bottom: 1px solid var(--border-primary);
  }
  .panel-title {
    font-size: var(--font-size-md);
    font-weight: var(--font-weight-semibold);
    color: var(--text-primary);
    margin: 0;
  }
  .header-actions {
    display: flex;
    align-items: center;
    gap: var(--space-2);
  }
  .header-btn {
    padding: var(--space-1) var(--space-3);
    font-size: var(--font-size-xs);
    color: var(--text-secondary);
    background: var(--bg-tertiary);
    border: 1px solid var(--border-primary);
    border-radius: var(--radius-md);
    cursor: pointer;
    transition: all var(--transition-fast);
  }
  .header-btn:hover {
    background: var(--bg-quaternary);
    color: var(--text-primary);
  }
  .header-btn.cancel {
    color: var(--text-tertiary);
  }
  .close-btn {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 24px;
    height: 24px;
    border-radius: var(--radius-md);
    color: var(--text-tertiary);
    background: none;
    border: none;
    cursor: pointer;
    transition: all var(--transition-fast);
  }
  .close-btn:hover {
    background: rgba(255, 255, 255, 0.08);
    color: var(--text-primary);
  }

  .search-bar {
    display: flex;
    align-items: center;
    gap: var(--space-2);
    padding: 0 var(--space-4);
    border-bottom: 1px solid var(--border-primary);
  }
  .search-icon {
    color: var(--text-tertiary);
    flex-shrink: 0;
  }
  .search-bar input {
    flex: 1;
    padding: var(--space-2) 0;
    background: none;
    border: none;
    color: var(--text-primary);
    font-size: var(--font-size-sm);
    outline: none;
    font-family: inherit;
  }

  .merge-bar {
    display: flex;
    align-items: center;
    gap: var(--space-2);
    padding: var(--space-2) var(--space-4);
    border-bottom: 1px solid var(--border-primary);
    background: var(--accent-subtle);
  }
  .merge-hint {
    font-size: var(--font-size-xs);
    color: var(--text-secondary);
    white-space: nowrap;
  }
  .merge-input {
    flex: 1;
    padding: var(--space-1) var(--space-2);
    background: var(--bg-tertiary);
    border: 1px solid var(--border-primary);
    border-radius: var(--radius-md);
    color: var(--text-primary);
    font-size: var(--font-size-sm);
    outline: none;
  }
  .merge-input:focus {
    border-color: var(--border-focus);
  }
  .merge-confirm-btn {
    padding: var(--space-1) var(--space-3);
    font-size: var(--font-size-xs);
    color: white;
    background: var(--accent);
    border: none;
    border-radius: var(--radius-md);
    cursor: pointer;
    transition: background var(--transition-fast);
  }
  .merge-confirm-btn:hover:not(:disabled) {
    background: var(--accent-hover);
  }
  .merge-confirm-btn:disabled {
    opacity: 0.4;
    cursor: default;
  }

  .tag-list {
    flex: 1;
    overflow-y: auto;
    padding: var(--space-1);
  }
  .empty-state {
    padding: var(--space-6) var(--space-4);
    text-align: center;
    color: var(--text-tertiary);
    font-size: var(--font-size-sm);
  }

  .tag-row {
    display: flex;
    align-items: center;
    gap: var(--space-2);
    padding: var(--space-2) var(--space-3);
    border-radius: var(--radius-md);
    transition: background var(--transition-fast);
  }
  .tag-row:hover {
    background: rgba(255, 255, 255, 0.04);
  }
  .tag-row.merge-selected {
    background: var(--accent-subtle);
  }
  .tag-info {
    flex: 1;
    display: flex;
    align-items: center;
    gap: var(--space-2);
    min-width: 0;
  }
  .tag-name {
    font-size: var(--font-size-sm);
    color: var(--text-primary);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .tag-count {
    font-size: var(--font-size-xs);
    color: var(--text-tertiary);
    white-space: nowrap;
    flex-shrink: 0;
  }
  .rename-input {
    flex: 1;
    padding: var(--space-1) var(--space-2);
    background: var(--bg-tertiary);
    border: 1px solid var(--border-focus);
    border-radius: var(--radius-md);
    color: var(--text-primary);
    font-size: var(--font-size-sm);
    outline: none;
    font-family: inherit;
  }

  .tag-actions {
    display: flex;
    gap: var(--space-1);
    opacity: 0;
    transition: opacity var(--transition-fast);
  }
  .tag-row:hover .tag-actions {
    opacity: 1;
  }
  .action-btn {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 24px;
    height: 24px;
    border-radius: var(--radius-sm);
    color: var(--text-tertiary);
    background: none;
    border: none;
    cursor: pointer;
    transition: all var(--transition-fast);
  }
  .action-btn:hover {
    background: rgba(255, 255, 255, 0.08);
    color: var(--text-primary);
  }
  .action-btn.danger:hover {
    color: var(--error);
    background: rgba(255, 80, 80, 0.1);
  }

  .merge-checkbox {
    width: 18px;
    height: 18px;
    border: 1.5px solid var(--border-primary);
    border-radius: var(--radius-sm);
    display: flex;
    align-items: center;
    justify-content: center;
    background: none;
    color: var(--accent);
    cursor: pointer;
    flex-shrink: 0;
    transition: all var(--transition-fast);
  }
  .merge-checkbox.checked {
    background: var(--accent);
    border-color: var(--accent);
    color: white;
  }

  /* Delete confirmation */
  .confirm-overlay {
    position: fixed;
    inset: 0;
    background: rgba(0, 0, 0, 0.5);
    display: flex;
    align-items: center;
    justify-content: center;
    z-index: 200;
  }
  .confirm-box {
    background: var(--bg-secondary);
    border: 1px solid var(--border-primary);
    border-radius: var(--radius-lg);
    padding: var(--space-5);
    max-width: 360px;
    box-shadow: var(--shadow-xl);
  }
  .confirm-message {
    color: var(--text-primary);
    font-size: var(--font-size-sm);
    margin: 0 0 var(--space-4) 0;
    line-height: 1.5;
  }
  .confirm-actions {
    display: flex;
    justify-content: flex-end;
    gap: var(--space-2);
  }
  .btn-cancel {
    padding: var(--space-2) var(--space-4);
    font-size: var(--font-size-sm);
    color: var(--text-secondary);
    background: var(--bg-tertiary);
    border: 1px solid var(--border-primary);
    border-radius: var(--radius-md);
    cursor: pointer;
    transition: all var(--transition-fast);
  }
  .btn-cancel:hover {
    background: var(--bg-quaternary);
  }
  .btn-delete {
    padding: var(--space-2) var(--space-4);
    font-size: var(--font-size-sm);
    color: white;
    background: var(--error);
    border: none;
    border-radius: var(--radius-md);
    cursor: pointer;
    transition: background var(--transition-fast);
  }
  .btn-delete:hover {
    filter: brightness(1.1);
  }
</style>
