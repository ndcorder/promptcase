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
    <span class="icon">#</span>
    <input
      type="text"
      placeholder="Filter by tag..."
      value={filterValue}
      oninput={handleInput}
      onfocus={() => (showSuggestions = filterValue.length > 0)}
      onblur={() => setTimeout(() => (showSuggestions = false), 150)}
    />
    {#if filterValue}
      <button class="clear-btn" onclick={clearFilter}>x</button>
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
    padding: 8px;
  }
  .input-wrapper {
    display: flex;
    align-items: center;
    background: #27272a;
    border: 1px solid #3f3f46;
    border-radius: 6px;
    padding: 0 8px;
  }
  .icon {
    color: #71717a;
    font-size: 13px;
    margin-right: 4px;
  }
  input {
    flex: 1;
    background: none;
    border: none;
    color: #d4d4d8;
    font-size: 13px;
    padding: 6px 0;
    outline: none;
    font-family: inherit;
  }
  input::placeholder {
    color: #52525b;
  }
  .clear-btn {
    background: none;
    border: none;
    color: #71717a;
    cursor: pointer;
    padding: 0 4px;
    font-family: inherit;
  }
  .suggestions {
    position: absolute;
    left: 8px;
    right: 8px;
    top: 100%;
    background: #27272a;
    border: 1px solid #3f3f46;
    border-radius: 6px;
    max-height: 200px;
    overflow-y: auto;
    z-index: 10;
  }
  .suggestion {
    display: block;
    width: 100%;
    padding: 6px 12px;
    border: none;
    background: none;
    color: #a1a1aa;
    font-size: 13px;
    text-align: left;
    cursor: pointer;
    font-family: inherit;
  }
  .suggestion:hover {
    background: #3f3f46;
    color: #d4d4d8;
  }
</style>
