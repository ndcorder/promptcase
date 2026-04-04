<script lang="ts">
  import MetadataPanel from "./MetadataPanel.svelte";
  import VariablesPanel from "./VariablesPanel.svelte";
  import HistoryPanel from "./HistoryPanel.svelte";
  import TestPanel from "./TestPanel.svelte";
  import { activeFile } from "../stores/editor";

  type InspectorTab = "info" | "test";
  let activeTab = $state<InspectorTab>("info");
</script>

<aside class="inspector">
  {#if $activeFile}
    <nav class="inspector-tabs">
      <button
        class="inspector-tab"
        class:active={activeTab === "info"}
        onclick={() => (activeTab = "info")}
      >Info</button>
      <button
        class="inspector-tab"
        class:active={activeTab === "test"}
        onclick={() => (activeTab = "test")}
      >Test</button>
    </nav>

    <div class="inspector-content">
      {#if activeTab === "info"}
        <MetadataPanel />
        <VariablesPanel />
        <HistoryPanel />
      {:else if activeTab === "test"}
        <TestPanel />
      {/if}
    </div>
  {:else}
    <div class="empty">
      <p>No file selected</p>
    </div>
  {/if}
</aside>

<style>
  .inspector {
    height: 100%;
    background: var(--bg-secondary);
    border-left: 1px solid var(--border-primary);
    overflow-y: auto;
    padding-top: env(titlebar-area-height, 28px);
    display: flex;
    flex-direction: column;
  }
  .inspector-tabs {
    display: flex;
    gap: var(--space-1);
    padding: var(--space-2) var(--space-3);
    border-bottom: 1px solid var(--border-secondary);
    flex-shrink: 0;
  }
  .inspector-tab {
    padding: var(--space-1) var(--space-3);
    font-size: var(--font-size-sm);
    color: var(--text-tertiary);
    border-radius: var(--radius-md);
    transition: all var(--transition-fast);
    background: none;
    border: none;
    cursor: pointer;
  }
  .inspector-tab:hover {
    color: var(--text-secondary);
    background: var(--bg-tertiary);
  }
  .inspector-tab.active {
    color: var(--accent);
    background: var(--accent-subtle);
  }
  .inspector-content {
    flex: 1;
    overflow-y: auto;
    padding: 0 var(--space-3);
  }
  .empty {
    display: flex;
    align-items: center;
    justify-content: center;
    height: 100%;
    color: var(--text-tertiary);
    font-size: var(--font-size-base);
  }
</style>
