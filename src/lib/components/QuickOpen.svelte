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
      <input
        bind:this={inputEl}
        type="text"
        placeholder="Search prompts..."
        bind:value={query}
        onkeydown={handleKeydown}
      />
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
    background: #00000060;
    display: flex;
    justify-content: center;
    padding-top: 15vh;
    z-index: 100;
  }
  .quick-open {
    width: 560px;
    max-height: 400px;
    background: #27272a;
    border: 1px solid #3f3f46;
    border-radius: 8px;
    overflow: hidden;
    box-shadow: 0 20px 60px #00000060;
    align-self: flex-start;
  }
  input {
    width: 100%;
    padding: 12px 16px;
    background: none;
    border: none;
    border-bottom: 1px solid #3f3f46;
    color: #d4d4d8;
    font-size: 15px;
    outline: none;
    font-family: inherit;
  }
  input::placeholder {
    color: #52525b;
  }
  .results {
    max-height: 320px;
    overflow-y: auto;
  }
  .result {
    display: flex;
    align-items: center;
    justify-content: space-between;
    width: 100%;
    padding: 8px 16px;
    border: none;
    background: none;
    color: #d4d4d8;
    font-size: 14px;
    cursor: pointer;
    text-align: left;
    font-family: inherit;
  }
  .result:hover,
  .result.selected {
    background: #3f3f46;
  }
  .result-title {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .result-path {
    font-size: 12px;
    color: #71717a;
    margin-left: 12px;
    flex-shrink: 0;
  }
  .no-results {
    padding: 16px;
    text-align: center;
    color: #52525b;
    font-size: 13px;
  }
</style>
