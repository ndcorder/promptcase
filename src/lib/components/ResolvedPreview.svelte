<script lang="ts">
  import { activeFile, resolvedText, variableValues } from "../stores/editor";
  import { api } from "../ipc";
  import { get } from "svelte/store";

  let loading = $state(false);
  let lastPath = "";

  async function loadPreview() {
    const file = $activeFile;
    if (!file) return;

    loading = true;
    try {
      const vars = get(variableValues);
      const hasVars = Object.values(vars).some((v) => v !== "");
      const result = await api.resolveTemplate(file.path, hasVars ? vars : undefined);
      resolvedText.set(result.text);
    } catch (err) {
      resolvedText.set(`Error resolving template: ${err}`);
    } finally {
      loading = false;
    }
  }

  $effect(() => {
    const file = $activeFile;
    if (file && file.path !== lastPath) {
      lastPath = file.path;
      loadPreview();
    }
  });
</script>

<div class="resolved-preview">
  <div class="preview-header">
    <span>Resolved Preview</span>
    <button class="refresh" onclick={loadPreview}>Refresh</button>
  </div>
  <div class="preview-content">
    {#if loading}
      <div class="loading">Resolving...</div>
    {:else}
      <pre>{$resolvedText}</pre>
    {/if}
  </div>
</div>

<style>
  .resolved-preview {
    height: 100%;
    display: flex;
    flex-direction: column;
    background: #18181b;
  }
  .preview-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 6px 12px;
    border-bottom: 1px solid #27272a;
    font-size: 12px;
    color: #a1a1aa;
  }
  .refresh {
    background: none;
    border: 1px solid #3f3f46;
    color: #a1a1aa;
    padding: 2px 8px;
    border-radius: 4px;
    cursor: pointer;
    font-size: 11px;
    font-family: inherit;
  }
  .refresh:hover {
    background: #27272a;
  }
  .preview-content {
    flex: 1;
    overflow: auto;
    padding: 12px;
  }
  pre {
    margin: 0;
    white-space: pre-wrap;
    font-family: 'JetBrains Mono', monospace;
    font-size: 14px;
    color: #d4d4d8;
    line-height: 1.6;
  }
  .loading {
    color: #52525b;
    font-style: italic;
  }
</style>
