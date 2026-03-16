<script lang="ts">
  import { tagFilter, allTags } from "../stores/files";

  let filterValue = $state("");
  let showSuggestions = $state(false);

  function handleInput(e: Event) {
    const target = e.target as HTMLInputElement;
    filterValue = target.value;
    tagFilter.set(filterValue);
    showSuggestions = filterValue.length > 0;
  }

  function selectTag(tag: string) {
    filterValue = tag;
    tagFilter.set(tag);
    showSuggestions = false;
  }

  function clearFilter() {
    filterValue = "";
    tagFilter.set("");
    showSuggestions = false;
  }
</script>

<div class="tag-filter">
  <div class="input-wrapper">
    <svg class="search-icon" width="12" height="12" viewBox="0 0 12 12">
      <circle cx="5" cy="5" r="3.5" fill="none" stroke="currentColor" stroke-width="1.2"/>
      <path d="M7.5 7.5L10.5 10.5" stroke="currentColor" stroke-width="1.2" stroke-linecap="round"/>
    </svg>
    <input
      type="text"
      placeholder="Filter by tag..."
      value={filterValue}
      oninput={handleInput}
      onfocus={() => (showSuggestions = filterValue.length > 0)}
      onblur={() => setTimeout(() => (showSuggestions = false), 150)}
    />
    {#if filterValue}
      <button class="clear-btn" onclick={clearFilter}>
        <svg width="8" height="8" viewBox="0 0 8 8">
          <path d="M1.5 1.5l5 5M6.5 1.5l-5 5" stroke="currentColor" stroke-width="1.2" stroke-linecap="round"/>
        </svg>
      </button>
    {/if}
  </div>

  {#if showSuggestions}
    <div class="suggestions">
      {#each $allTags.filter((t) => t.toLowerCase().includes(filterValue.toLowerCase())) as tag}
        <button class="suggestion" onclick={() => selectTag(tag)}>
          #{tag}
        </button>
      {/each}
    </div>
  {/if}
</div>

<style>
  .tag-filter {
    position: relative;
    padding: 0 var(--space-2) var(--space-2);
  }
  .input-wrapper {
    display: flex;
    align-items: center;
    background: rgba(255, 255, 255, 0.06);
    border: 1px solid var(--border-primary);
    border-radius: var(--radius-md);
    padding: 0 var(--space-2);
    transition: border-color var(--transition-base);
  }
  .input-wrapper:focus-within {
    border-color: var(--accent);
    box-shadow: 0 0 0 1px var(--border-focus);
  }
  .search-icon {
    color: var(--text-quaternary);
    flex-shrink: 0;
    margin-right: var(--space-1);
  }
  input {
    flex: 1;
    background: none;
    border: none;
    color: var(--text-primary);
    font-size: var(--font-size-base);
    padding: var(--space-1) 0;
    outline: none;
    font-family: inherit;
  }
  .clear-btn {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 16px;
    height: 16px;
    border-radius: var(--radius-sm);
    color: var(--text-quaternary);
    transition: all var(--transition-fast);
  }
  .clear-btn:hover {
    background: rgba(255, 255, 255, 0.10);
    color: var(--text-primary);
  }
  .suggestions {
    position: absolute;
    left: var(--space-2);
    right: var(--space-2);
    top: 100%;
    background: var(--bg-tertiary);
    border: 1px solid var(--border-primary);
    border-radius: var(--radius-md);
    max-height: 200px;
    overflow-y: auto;
    z-index: 10;
    box-shadow: var(--shadow-popover);
  }
  .suggestion {
    display: block;
    width: 100%;
    padding: var(--space-1) var(--space-3);
    color: var(--text-secondary);
    font-size: var(--font-size-base);
    text-align: left;
    border-radius: var(--radius-sm);
    margin: var(--space-1);
    width: calc(100% - var(--space-2));
    transition: all var(--transition-fast);
  }
  .suggestion:hover {
    background: rgba(255, 255, 255, 0.08);
    color: var(--text-primary);
  }
  .suggestion:active {
    background: rgba(255, 255, 255, 0.04);
  }
</style>
