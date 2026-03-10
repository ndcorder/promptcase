<script lang="ts">
  import { promptEntries } from "../stores/files";
  import { openFile } from "../stores/editor";
  import type { PromptEntry } from "../types";

  interface Props {
    visible: boolean;
    onClose: () => void;
  }

  let { visible, onClose }: Props = $props();
  let query = $state("");
  let selectedIndex = $state(0);
  let inputEl: HTMLInputElement;

  let results = $derived.by(() => {
    if (!query) return $promptEntries.slice(0, 20);
    const q = query.toLowerCase();
    return $promptEntries
      .filter(
        (e) =>
          e.frontmatter.title.toLowerCase().includes(q) ||
          e.path.toLowerCase().includes(q),
      )
      .slice(0, 20);
  });

  function handleKeydown(e: KeyboardEvent) {
    if (e.key === "Escape") {
      onClose();
    } else if (e.key === "ArrowDown") {
      e.preventDefault();
      selectedIndex = Math.min(selectedIndex + 1, results.length - 1);
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      selectedIndex = Math.max(selectedIndex - 1, 0);
    } else if (e.key === "Enter") {
      e.preventDefault();
      if (results[selectedIndex]) {
        openFile(results[selectedIndex].path);
        onClose();
      }
    }
  }

  function selectItem(entry: PromptEntry) {
    openFile(entry.path);
    onClose();
  }

  $effect(() => {
    if (results.length > 0) {
      selectedIndex = Math.min(selectedIndex, results.length - 1);
    } else {
      selectedIndex = 0;
    }
  });

  $effect(() => {
    if (visible && inputEl) {
      query = "";
      selectedIndex = 0;
      inputEl.focus();
    }
  });
</script>

{#if visible}
  <div class="overlay" onclick={(e) => { if (e.target === e.currentTarget) onClose(); }} onkeydown={handleKeydown} role="dialog" aria-modal="true" aria-label="Quick open" tabindex="-1">
    <div class="quick-open">
      <div class="search-input-wrapper">
        <svg class="search-icon" width="14" height="14" viewBox="0 0 14 14">
          <circle cx="5.5" cy="5.5" r="4" fill="none" stroke="currentColor" stroke-width="1.3"/>
          <path d="M8.5 8.5L12.5 12.5" stroke="currentColor" stroke-width="1.3" stroke-linecap="round"/>
        </svg>
        <input
          bind:this={inputEl}
          type="text"
          placeholder="Search prompts..."
          bind:value={query}
          onkeydown={handleKeydown}
        />
      </div>
      <div class="results">
        {#each results as entry, i}
          <button
            class="result"
            class:selected={i === selectedIndex}
            onclick={() => selectItem(entry)}
          >
            <span class="result-title">{entry.frontmatter.title || entry.path}</span>
            <span class="result-path">{entry.path}</span>
          </button>
        {/each}
        {#if results.length === 0}
          <div class="no-results">No prompts found.</div>
        {/if}
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
    padding-top: 15vh;
    z-index: 100;
  }
  .quick-open {
    width: 560px;
    max-height: 400px;
    background: var(--bg-tertiary);
    border: 1px solid var(--border-primary);
    border-radius: var(--radius-lg);
    overflow: hidden;
    box-shadow: var(--shadow-xl);
    align-self: flex-start;
  }
  .search-input-wrapper {
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
  input {
    flex: 1;
    padding: var(--space-3) 0;
    background: none;
    border: none;
    color: var(--text-primary);
    font-size: var(--font-size-lg);
    outline: none;
    font-family: inherit;
  }
  .results {
    max-height: 320px;
    overflow-y: auto;
    padding: var(--space-1);
  }
  .result {
    display: flex;
    align-items: center;
    justify-content: space-between;
    width: 100%;
    padding: var(--space-2) var(--space-3);
    color: var(--text-primary);
    font-size: var(--font-size-md);
    text-align: left;
    border-radius: var(--radius-md);
    transition: background var(--transition-fast);
  }
  .result:hover,
  .result.selected {
    background: rgba(255, 255, 255, 0.08);
  }
  .result.selected {
    background: var(--accent-subtle);
  }
  .result-title {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .result-path {
    font-size: var(--font-size-sm);
    color: var(--text-tertiary);
    margin-left: var(--space-3);
    flex-shrink: 0;
  }
  .no-results {
    padding: var(--space-4);
    text-align: center;
    color: var(--text-tertiary);
    font-size: var(--font-size-base);
  }
</style>
