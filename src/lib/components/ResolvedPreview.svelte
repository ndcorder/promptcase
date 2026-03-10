<script lang="ts">
  import { activeFile, resolvedText, variableValues } from "../stores/editor";
  import { api } from "../ipc";
  import { get } from "svelte/store";

  let loading = $state(false);
  let lastPath = "";
  let copied = $state(false);

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
    <div class="preview-actions">
      <button class="header-btn" onclick={async () => {
        await navigator.clipboard.writeText(get(resolvedText));
        copied = true;
        setTimeout(() => copied = false, 1500);
      }}>{copied ? "Copied!" : "Copy"}</button>
      <button class="header-btn" onclick={loadPreview}>Refresh</button>
    </div>
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
    background: var(--bg-secondary);
  }
  .preview-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: var(--space-1) var(--space-3);
    border-bottom: 1px solid var(--border-primary);
    font-size: var(--font-size-sm);
    color: var(--text-secondary);
    font-weight: var(--font-weight-medium);
  }
  .preview-actions {
    display: flex;
    gap: var(--space-1);
  }
  .header-btn {
    background: rgba(255, 255, 255, 0.06);
    border: 1px solid var(--border-primary);
    color: var(--text-secondary);
    padding: 2px var(--space-2);
    border-radius: var(--radius-sm);
    font-size: var(--font-size-xs);
    transition: all var(--transition-fast);
  }
  .header-btn:hover {
    background: rgba(255, 255, 255, 0.10);
    color: var(--text-primary);
  }
  .preview-content {
    flex: 1;
    overflow: auto;
    padding: var(--space-3);
  }
  pre {
    margin: 0;
    white-space: pre-wrap;
    font-family: var(--font-mono);
    font-size: var(--font-size-md);
    color: var(--text-primary);
    line-height: 1.6;
  }
  .loading {
    color: var(--text-tertiary);
    font-style: italic;
  }
</style>
