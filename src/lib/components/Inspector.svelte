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
    background: #18181b;
    border-left: 1px solid #27272a;
    overflow-y: auto;
  }
  .empty {
    display: flex;
    align-items: center;
    justify-content: center;
    height: 100%;
    color: #52525b;
    font-size: 13px;
  }
</style>
