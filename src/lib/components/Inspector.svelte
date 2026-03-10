<script lang="ts">
  import MetadataPanel from "./MetadataPanel.svelte";
  import VariablesPanel from "./VariablesPanel.svelte";
  import HistoryPanel from "./HistoryPanel.svelte";
  import { activeFile } from "../stores/editor";
</script>

<aside class="inspector">
  {#if $activeFile}
    <MetadataPanel />
    <VariablesPanel />
    <HistoryPanel />
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
