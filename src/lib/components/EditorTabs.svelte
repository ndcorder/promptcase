<script lang="ts">
  import { openTabs, closeTab, openFile, hasUnsavedChanges, saveFile } from "../stores/editor";
  import { get } from "svelte/store";
  import ConfirmDialog from "./ConfirmDialog.svelte";

  let confirmPath = $state<string | null>(null);

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

<div class="tabs-bar">
  {#each $openTabs as tab}
    <div
      class="tab"
      class:active={tab.active}
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
        x
      </button>
    </div>
  {/each}
  {#if $hasUnsavedChanges}
    <button class="save-btn" onclick={saveFile} title="Save (Cmd+S)">Save</button>
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
    background: #18181b;
    border-bottom: 1px solid #27272a;
    overflow-x: auto;
    min-height: 36px;
  }
  .tab {
    display: flex;
    align-items: center;
    gap: 6px;
    padding: 0 12px;
    height: 36px;
    border: none;
    border-right: 1px solid #27272a;
    background: #09090b;
    color: #71717a;
    font-size: 13px;
    cursor: pointer;
    white-space: nowrap;
    font-family: inherit;
  }
  .tab.active {
    background: #18181b;
    color: #d4d4d8;
    border-bottom: 2px solid #a78bfa;
  }
  .tab:hover {
    color: #a1a1aa;
  }
  .modified-dot {
    width: 6px;
    height: 6px;
    border-radius: 50%;
    background: #f59e0b;
  }
  .close-btn {
    background: none;
    border: none;
    color: #52525b;
    cursor: pointer;
    padding: 0 2px;
    font-size: 12px;
    font-family: inherit;
  }
  .close-btn:hover {
    color: #d4d4d8;
  }
  .save-btn {
    margin-left: auto;
    padding: 0 12px;
    height: 36px;
    background: none;
    border: none;
    color: #a78bfa;
    font-size: 12px;
    font-weight: 500;
    cursor: pointer;
    font-family: inherit;
    white-space: nowrap;
  }
  .save-btn:hover {
    color: #c4b5fd;
    background: #27272a;
  }
</style>
