<script lang="ts">
  import { openTabs, closeTab, openFile, hasUnsavedChanges, saveFile, isLoading } from "../stores/editor";
  import { isTauri } from "../ipc";
  import { get } from "svelte/store";
  import ConfirmDialog from "./ConfirmDialog.svelte";

  let confirmPath = $state<string | null>(null);

  async function handleDragStart(e: MouseEvent) {
    if (!isTauri()) return;
    // Only drag on primary button, not on interactive elements
    if (e.buttons !== 1) return;
    const target = e.target as HTMLElement;
    if (target.closest("button, [role=tab], a, input")) return;
    const { getCurrentWindow } = await import("@tauri-apps/api/window");
    if (e.detail === 2) {
      getCurrentWindow().toggleMaximize();
    } else {
      getCurrentWindow().startDragging();
    }
  }

  function handleTabClick(path: string) {
    openFile(path);
  }

  function handleClose(e: MouseEvent, path: string) {
    e.stopPropagation();
    const tab = get(openTabs).find((t) => t.path === path);
    if (tab?.modified || (tab?.active && get(hasUnsavedChanges))) {
      confirmPath = path;
      return;
    }
    closeTab(path);
  }
</script>

<div class="tabs-bar" data-tauri-drag-region onmousedown={handleDragStart}>
  {#each $openTabs as tab}
    <div
      class="tab"
      class:active={tab.active}
      class:modified={tab.modified}
      role="tab"
      tabindex="0"
      onclick={() => handleTabClick(tab.path)}
      onkeydown={(e) => e.key === "Enter" && handleTabClick(tab.path)}
    >
      <span class="tab-title">{tab.title}</span>
      {#if tab.modified}
        <span class="modified-dot"></span>
      {/if}
      <button
        class="close-btn"
        onclick={(e) => handleClose(e, tab.path)}
      >
        <svg width="8" height="8" viewBox="0 0 8 8">
          <path d="M1 1l6 6M7 1l-6 6" stroke="currentColor" stroke-width="1.2" stroke-linecap="round"/>
        </svg>
      </button>
    </div>
  {/each}
  {#if $hasUnsavedChanges}
    <button class="save-btn" onclick={saveFile} title="Save (Cmd+S)" disabled={$isLoading}>{$isLoading ? "Saving..." : "Save"}</button>
  {/if}
</div>

<ConfirmDialog
  visible={confirmPath !== null}
  title="Unsaved Changes"
  message="You have unsaved changes. Close anyway?"
  confirmLabel="Close"
  cancelLabel="Cancel"
  onConfirm={() => { if (confirmPath) { closeTab(confirmPath); confirmPath = null; } }}
  onCancel={() => { confirmPath = null; }}
/>

<style>
  .tabs-bar {
    display: flex;
    background: var(--bg-secondary);
    border-bottom: 1px solid var(--border-primary);
    overflow-x: auto;
    min-height: 36px;
    padding-top: env(titlebar-area-height, 0);
  }
  .tab {
    display: flex;
    align-items: center;
    gap: var(--space-2);
    padding: 0 var(--space-3);
    height: 36px;
    background: transparent;
    color: var(--text-tertiary);
    font-size: var(--font-size-base);
    cursor: pointer;
    white-space: nowrap;
    font-family: inherit;
    border: none;
    position: relative;
    transition: color var(--transition-fast);
  }
  .tab::after {
    content: "";
    position: absolute;
    right: 0;
    top: 8px;
    bottom: 8px;
    width: 1px;
    background: var(--border-secondary);
  }
  .tab:last-of-type::after {
    display: none;
  }
  .tab.active {
    color: var(--text-primary);
    background: var(--bg-primary);
  }
  .tab.active::before {
    content: "";
    position: absolute;
    bottom: 0;
    left: var(--space-3);
    right: var(--space-3);
    height: 2px;
    background: var(--accent);
    border-radius: 1px 1px 0 0;
  }
  .tab:hover {
    color: var(--text-secondary);
    background: rgba(255, 255, 255, 0.03);
  }
  .tab:active {
    background: rgba(255, 255, 255, 0.02);
  }
  .tab:focus-visible {
    box-shadow: inset 0 0 0 2px var(--border-focus);
    border-radius: 0;
  }
  .modified-dot {
    width: 6px;
    height: 6px;
    border-radius: 50%;
    background: var(--color-warning);
  }
  .close-btn {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 16px;
    height: 16px;
    border-radius: var(--radius-sm);
    color: var(--text-quaternary);
    opacity: 0;
    transition: all var(--transition-fast);
  }
  .tab:hover .close-btn,
  .tab.active .close-btn,
  .tab.modified .close-btn {
    opacity: 1;
  }
  .close-btn:hover {
    background: rgba(255, 255, 255, 0.10);
    color: var(--text-primary);
  }
  .close-btn:active {
    background: rgba(255, 255, 255, 0.04);
  }
  .save-btn {
    margin-left: auto;
    padding: 0 var(--space-3);
    height: 36px;
    color: var(--accent);
    font-size: var(--font-size-sm);
    font-weight: var(--font-weight-medium);
    white-space: nowrap;
    transition: all var(--transition-base);
  }
  .save-btn:hover:not(:disabled) {
    color: var(--accent-hover);
    background: rgba(255, 255, 255, 0.04);
  }
  .save-btn:disabled {
    color: var(--text-quaternary);
    cursor: not-allowed;
  }
</style>
