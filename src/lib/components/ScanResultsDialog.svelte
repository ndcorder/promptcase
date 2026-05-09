<script lang="ts">
  import type { ScannedPrompt } from "../types";
  import { api } from "../ipc";
  import { loadFiles } from "../stores/files";
  import { addToast } from "../stores/toast";

  interface Props {
    visible: boolean;
    results: ScannedPrompt[];
    onClose: () => void;
  }

  let { visible, results, onClose }: Props = $props();
  let selected = $state<Set<number>>(new Set());
  let minConfidence = $state(0.5);
  let importing = $state(false);

  let filtered = $derived(results.filter((r) => r.confidence >= minConfidence));

  // When results change, select all by default
  $effect(() => {
    if (results.length > 0) {
      const ids = new Set<number>();
      results.forEach((_, i) => {
        if (results[i].confidence >= minConfidence) ids.add(i);
      });
      selected = ids;
    }
  });

  function selectAll() {
    const ids = new Set<number>();
    results.forEach((r, i) => {
      if (r.confidence >= minConfidence) ids.add(i);
    });
    selected = ids;
  }

  function deselectAll() {
    selected = new Set();
  }

  function toggleItem(index: number) {
    const next = new Set(selected);
    if (next.has(index)) {
      next.delete(index);
    } else {
      next.add(index);
    }
    selected = next;
  }

  function sourceTypeBadge(type: string): string {
    const map: Record<string, string> = {
      "claude-md": "Claude",
      "claude-agent": "Agent",
      "agents-md": "Agents",
      "cursorrules": "Cursor",
      "cursor-rules": "Cursor",
      "copilot": "Copilot",
      "windsurfrules": "Windsurf",
      "prompt-file": "Prompt",
      "code-python": "Python",
      "code-typescript": "TypeScript",
      "code-javascript": "JavaScript",
      "code-yaml": "YAML",
    };
    return map[type] ?? type;
  }

  function truncatePath(path: string, max: number = 50): string {
    if (path.length <= max) return path;
    return "..." + path.slice(path.length - max + 3);
  }

  async function doImport() {
    if (importing) return;
    const toImport = results.filter((_, i) => selected.has(i) && results[i].confidence >= minConfidence);
    if (toImport.length === 0) return;
    importing = true;
    try {
      let imported = 0;
      for (const r of toImport) {
        const slug = r.title
          .toLowerCase()
          .replace(/[^a-z0-9-]/g, "-")
          .replace(/-+/g, "-")
          .replace(/^-|-$/g, "");
        await api.importFromText(r.title || slug, r.content, "imported");
        imported++;
      }
      await loadFiles();
      addToast(`Imported ${imported} prompt(s)`, "success");
      onClose();
    } catch (err) {
      console.error("Import failed:", err);
      addToast(`Import failed: ${err}`, "error");
    } finally {
      importing = false;
    }
  }

  function handleKeydown(e: KeyboardEvent) {
    if (e.key === "Escape") onClose();
  }
</script>

{#if visible}
  <div
    class="overlay"
    onclick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    onkeydown={handleKeydown}
    role="dialog"
    aria-modal="true"
    aria-label="Scan Results"
    tabindex="-1"
  >
    <div class="dialog">
      <h3>Scan Results</h3>

      <div class="controls">
        <div class="select-controls">
          <button class="btn-text" onclick={selectAll}>Select All</button>
          <button class="btn-text" onclick={deselectAll}>Deselect All</button>
          <span class="count">{filtered.filter((_, i) => selected.has(results.indexOf(_))).length} of {filtered.length} selected</span>
        </div>
        <div class="confidence-filter">
          <label for="conf-slider">Min confidence:</label>
          <input
            id="conf-slider"
            type="range"
            min="0"
            max="1"
            step="0.05"
            bind:value={minConfidence}
          />
          <span class="conf-value">{minConfidence.toFixed(2)}</span>
        </div>
      </div>

      <div class="results-list">
        {#each filtered as result, i}
          {@const originalIndex = results.indexOf(result)}
          <label class="result-row" class:checked={selected.has(originalIndex)}>
            <input
              type="checkbox"
              checked={selected.has(originalIndex)}
              onchange={() => toggleItem(originalIndex)}
            />
            <div class="result-info">
              <div class="result-header">
                <span class="result-title">{result.title}</span>
                <span class="badge">{sourceTypeBadge(result.sourceType)}</span>
              </div>
              <div class="result-meta">
                <div class="confidence-bar">
                  <div class="confidence-fill" style:width="{result.confidence * 100}%"></div>
                </div>
                <span class="result-path" title={result.sourcePath}>{truncatePath(result.sourcePath)}</span>
              </div>
            </div>
          </label>
        {/each}
        {#if filtered.length === 0}
          <div class="empty">No prompts match the current confidence threshold.</div>
        {/if}
      </div>

      <div class="actions">
        <button class="btn cancel" onclick={onClose}>Cancel</button>
        <button
          class="btn confirm"
          onclick={doImport}
          disabled={importing || filtered.filter((_, i) => selected.has(results.indexOf(_))).length === 0}
        >
          {importing ? "Importing..." : "Import Selected"}
        </button>
      </div>
    </div>
  </div>
{/if}

<style>
  .overlay {
    position: fixed;
    top: 0;
    left: 0;
    right: 0;
    bottom: 0;
    background: rgba(0, 0, 0, 0.4);
    backdrop-filter: blur(4px);
    -webkit-backdrop-filter: blur(4px);
    display: flex;
    justify-content: center;
    padding-top: 10vh;
    z-index: 100;
  }
  .dialog {
    width: 600px;
    max-height: 70vh;
    background: var(--bg-tertiary);
    border: 1px solid var(--border-primary);
    border-radius: var(--radius-lg);
    padding: var(--space-5);
    box-shadow: var(--shadow-xl);
    align-self: flex-start;
    display: flex;
    flex-direction: column;
  }
  h3 {
    margin: 0 0 var(--space-3);
    font-size: var(--font-size-lg);
    font-weight: var(--font-weight-semibold);
    color: var(--text-primary);
  }
  .controls {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: var(--space-3);
    gap: var(--space-3);
    flex-wrap: wrap;
  }
  .select-controls {
    display: flex;
    gap: var(--space-2);
    align-items: center;
  }
  .btn-text {
    background: none;
    color: var(--accent);
    font-size: var(--font-size-sm);
    padding: var(--space-1) var(--space-2);
    border-radius: var(--radius-sm);
  }
  .btn-text:hover {
    background: rgba(255, 255, 255, 0.06);
  }
  .count {
    font-size: var(--font-size-xs);
    color: var(--text-tertiary);
  }
  .confidence-filter {
    display: flex;
    align-items: center;
    gap: var(--space-2);
    font-size: var(--font-size-sm);
    color: var(--text-secondary);
  }
  .confidence-filter input[type="range"] {
    width: 100px;
    accent-color: var(--accent);
  }
  .conf-value {
    font-family: var(--font-mono);
    font-size: var(--font-size-xs);
    color: var(--text-tertiary);
    min-width: 2.5em;
  }
  .results-list {
    flex: 1;
    overflow-y: auto;
    border: 1px solid var(--border-primary);
    border-radius: var(--radius-md);
    max-height: 40vh;
  }
  .result-row {
    display: flex;
    align-items: flex-start;
    gap: var(--space-3);
    padding: var(--space-2) var(--space-3);
    border-bottom: 1px solid var(--border-primary);
    cursor: pointer;
    transition: background var(--transition-fast);
  }
  .result-row:last-child {
    border-bottom: none;
  }
  .result-row:hover {
    background: rgba(255, 255, 255, 0.04);
  }
  .result-row.checked {
    background: rgba(255, 255, 255, 0.06);
  }
  .result-row input[type="checkbox"] {
    margin-top: 3px;
    flex-shrink: 0;
    accent-color: var(--accent);
  }
  .result-info {
    flex: 1;
    min-width: 0;
  }
  .result-header {
    display: flex;
    align-items: center;
    gap: var(--space-2);
    margin-bottom: 2px;
  }
  .result-title {
    font-size: var(--font-size-md);
    color: var(--text-primary);
    font-weight: var(--font-weight-medium);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .badge {
    font-size: var(--font-size-xs);
    padding: 1px var(--space-2);
    border-radius: var(--radius-sm);
    background: var(--accent-subtle);
    color: var(--accent);
    white-space: nowrap;
    flex-shrink: 0;
  }
  .result-meta {
    display: flex;
    align-items: center;
    gap: var(--space-2);
  }
  .confidence-bar {
    width: 50px;
    height: 4px;
    background: rgba(255, 255, 255, 0.1);
    border-radius: 2px;
    overflow: hidden;
    flex-shrink: 0;
  }
  .confidence-fill {
    height: 100%;
    background: var(--accent);
    border-radius: 2px;
    transition: width var(--transition-fast);
  }
  .result-path {
    font-size: var(--font-size-xs);
    color: var(--text-quaternary);
    font-family: var(--font-mono);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .empty {
    padding: var(--space-5);
    text-align: center;
    color: var(--text-tertiary);
    font-size: var(--font-size-md);
  }
  .actions {
    display: flex;
    justify-content: flex-end;
    gap: var(--space-2);
    margin-top: var(--space-3);
  }
  .btn {
    padding: var(--space-1) var(--space-4);
    border-radius: var(--radius-md);
    font-size: var(--font-size-base);
    font-weight: var(--font-weight-medium);
    transition: all var(--transition-base);
  }
  .cancel {
    background: rgba(255, 255, 255, 0.08);
    color: var(--text-secondary);
  }
  .cancel:hover {
    background: rgba(255, 255, 255, 0.12);
    color: var(--text-primary);
  }
  .confirm {
    background: var(--accent);
    color: white;
  }
  .confirm:hover {
    background: var(--accent-hover);
  }
  .confirm:disabled {
    opacity: 0.4;
    cursor: default;
  }
</style>
