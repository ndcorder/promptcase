<script lang="ts">
  import { activeFile, editorContent, saveFile } from "../stores/editor";
  import { api } from "../ipc";
  import { get } from "svelte/store";

  let newTag = $state("");

  async function addTag() {
    const tag = newTag.trim().toLowerCase();
    if (!tag || !$activeFile) return;
    if ($activeFile.frontmatter.tags.includes(tag)) { newTag = ""; return; }
    const updatedTags = [...$activeFile.frontmatter.tags, tag];
    await api.writeFile($activeFile.path, { tags: updatedTags }, get(editorContent));
    activeFile.update((f) => f ? { ...f, frontmatter: { ...f.frontmatter, tags: updatedTags } } : null);
    newTag = "";
  }

  async function removeTag(tag: string) {
    if (!$activeFile) return;
    const updatedTags = $activeFile.frontmatter.tags.filter((t) => t !== tag);
    await api.writeFile($activeFile.path, { tags: updatedTags }, get(editorContent));
    activeFile.update((f) => f ? { ...f, frontmatter: { ...f.frontmatter, tags: updatedTags } } : null);
  }
</script>

{#if $activeFile}
  <div class="metadata-panel">
    <h3>Metadata</h3>
    <div class="field">
      <span class="field-label">Type</span>
      <span class="value type-badge" class:fragment={$activeFile.frontmatter.type === "fragment"}>
        {$activeFile.frontmatter.type}
      </span>
    </div>
    <div class="field">
      <span class="field-label">ID</span>
      <span class="value mono">{$activeFile.frontmatter.id}</span>
    </div>
    <div class="field">
      <span class="field-label">Tags</span>
      <div class="tags">
        {#each $activeFile.frontmatter.tags as tag}
          <button class="tag" onclick={() => removeTag(tag)}>#{tag} <span class="tag-x">x</span></button>
        {/each}
      </div>
      <div class="tag-input-row">
        <input
          class="tag-input"
          type="text"
          placeholder="Add tag..."
          bind:value={newTag}
          onkeydown={(e) => { if (e.key === "Enter") { e.preventDefault(); addTag(); } }}
        />
      </div>
    </div>
    {#if $activeFile.frontmatter.model_targets?.length}
      <div class="field">
        <span class="field-label">Models</span>
        <div class="models">
          {#each $activeFile.frontmatter.model_targets as model}
            <span class="model">{model}</span>
          {/each}
        </div>
      </div>
    {/if}
    <div class="field">
      <span class="field-label">Created</span>
      <span class="value">{new Date($activeFile.frontmatter.created).toLocaleDateString()}</span>
    </div>
    <div class="field">
      <span class="field-label">Modified</span>
      <span class="value">{new Date($activeFile.frontmatter.modified).toLocaleDateString()}</span>
    </div>
  </div>
{/if}

<style>
  .metadata-panel {
    padding: 12px;
  }
  h3 {
    margin: 0 0 12px;
    font-size: 12px;
    font-weight: 600;
    color: #71717a;
    text-transform: uppercase;
    letter-spacing: 0.5px;
  }
  .field {
    margin-bottom: 8px;
  }
  .field-label {
    display: block;
    font-size: 11px;
    color: #52525b;
    margin-bottom: 2px;
  }
  .value {
    font-size: 13px;
    color: #d4d4d8;
  }
  .mono {
    font-family: monospace;
    font-size: 12px;
    color: #a1a1aa;
  }
  .type-badge {
    display: inline-block;
    padding: 1px 8px;
    border-radius: 4px;
    font-size: 12px;
    background: #60a5fa20;
    color: #60a5fa;
  }
  .type-badge.fragment {
    background: #a78bfa20;
    color: #a78bfa;
  }
  .tags {
    display: flex;
    flex-wrap: wrap;
    gap: 4px;
  }
  .tag {
    font-size: 12px;
    color: #a78bfa;
    background: #a78bfa15;
    padding: 1px 6px;
    border-radius: 3px;
    border: none;
    cursor: pointer;
    font-family: inherit;
    display: inline-flex;
    align-items: center;
    gap: 3px;
  }
  .tag:hover {
    background: #a78bfa25;
  }
  .tag-x {
    font-size: 10px;
    color: #71717a;
  }
  .tag:hover .tag-x {
    color: #f87171;
  }
  .tag-input-row {
    margin-top: 4px;
  }
  .tag-input {
    width: 100%;
    padding: 3px 6px;
    background: #18181b;
    border: 1px solid #3f3f46;
    border-radius: 3px;
    color: #d4d4d8;
    font-size: 12px;
    outline: none;
    font-family: inherit;
  }
  .tag-input:focus {
    border-color: #a78bfa;
  }
  .tag-input::placeholder {
    color: #52525b;
  }
  .models {
    display: flex;
    flex-wrap: wrap;
    gap: 4px;
  }
  .model {
    font-size: 12px;
    color: #34d399;
    background: #34d39915;
    padding: 1px 6px;
    border-radius: 3px;
  }
</style>
