<script lang="ts">
  import { openTabs, closeTab, openFile, hasUnsavedChanges } from "../stores/editor";
  import { get } from "svelte/store";

  function handleTabClick(path: string) {
    openFile(path);
  }

  function handleClose(e: MouseEvent, path: string) {
    e.stopPropagation();
    const tab = get(openTabs).find((t) => t.path === path);
    if (tab?.modified || (tab?.active && get(hasUnsavedChanges))) {
      if (!window.confirm("You have unsaved changes. Close anyway?")) return;
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
</div>

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
</style>
