<script lang="ts">
  import { activeFile, editorContent, saveFile } from "../stores/editor";
  import { scheduleDebouncedCommit } from "../stores/commit";
  import { api } from "../ipc";
  import { get } from "svelte/store";

  let newTag = $state("");

  async function addTag() {
    const tag = newTag.trim().toLowerCase();
    if (!tag || !$activeFile) return;
    if ($activeFile.frontmatter.tags.includes(tag)) { newTag = ""; return; }
    const updatedTags = [...$activeFile.frontmatter.tags, tag];
    const path = $activeFile.path;
    await api.writeFile(path, { tags: updatedTags }, get(editorContent));
    activeFile.update((f) => f ? { ...f, frontmatter: { ...f.frontmatter, tags: updatedTags } } : null);
    newTag = "";
    scheduleDebouncedCommit(path);
  }

  async function removeTag(tag: string) {
    if (!$activeFile) return;
    const updatedTags = $activeFile.frontmatter.tags.filter((t) => t !== tag);
    const path = $activeFile.path;
    await api.writeFile(path, { tags: updatedTags }, get(editorContent));
    activeFile.update((f) => f ? { ...f, frontmatter: { ...f.frontmatter, tags: updatedTags } } : null);
    scheduleDebouncedCommit(path);
  }
</script>

{#if $activeFile}
  <div class="metadata-panel">
    <h3>Metadata</h3>
    <div class="field">
      <span class="field-label">ID</span>
      <span class="value mono">{$activeFile.frontmatter.id}</span>
    </div>
    <div class="field">
      <span class="field-label">Tags</span>
      <div class="tags">
        {#each $activeFile.frontmatter.tags as tag}
          <button class="tag" onclick={() => removeTag(tag)}>
            #{tag}
            <svg class="tag-x" width="8" height="8" viewBox="0 0 8 8">
              <path d="M1.5 1.5l5 5M6.5 1.5l-5 5" stroke="currentColor" stroke-width="1.2" stroke-linecap="round"/>
            </svg>
          </button>
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
    {#if $activeFile.frontmatter.modelTargets?.length}
      <div class="field">
        <span class="field-label">Models</span>
        <div class="models">
          {#each $activeFile.frontmatter.modelTargets as model}
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
    padding: var(--space-3);
  }
  h3 {
    margin: 0 0 var(--space-3);
    font-size: var(--font-size-xs);
    font-weight: var(--font-weight-semibold);
    color: var(--text-tertiary);
    text-transform: uppercase;
    letter-spacing: 0.05em;
  }
  .field {
    margin-bottom: var(--space-2);
  }
  .field-label {
    display: block;
    font-size: var(--font-size-xs);
    color: var(--text-quaternary);
    margin-bottom: var(--space-1);
  }
  .value {
    font-size: var(--font-size-base);
    color: var(--text-primary);
  }
  .mono {
    font-family: var(--font-mono);
    font-size: var(--font-size-sm);
    color: var(--text-secondary);
  }
  .tags {
    display: flex;
    flex-wrap: wrap;
    gap: var(--space-1);
  }
  .tag {
    font-size: var(--font-size-sm);
    color: var(--accent);
    background: var(--accent-subtle);
    padding: var(--space-1) var(--space-2);
    border-radius: var(--radius-sm);
    display: inline-flex;
    align-items: center;
    gap: var(--space-1);
    transition: background var(--transition-fast);
  }
  .tag:hover {
    background: var(--accent-selection);
  }
  .tag:active {
    background: var(--accent-subtle);
    transform: scale(0.96);
  }
  .tag-x {
    color: var(--text-quaternary);
  }
  .tag:hover .tag-x {
    color: var(--color-error);
  }
  .tag-input-row {
    margin-top: var(--space-1);
  }
  .tag-input {
    width: 100%;
    padding: var(--space-1) var(--space-2);
    background: var(--bg-primary);
    border: 1px solid var(--border-primary);
    border-radius: var(--radius-sm);
    color: var(--text-primary);
    font-size: var(--font-size-sm);
  }
  .tag-input:focus {
    border-color: var(--accent);
    box-shadow: 0 0 0 1px var(--border-focus);
  }
  .models {
    display: flex;
    flex-wrap: wrap;
    gap: var(--space-1);
  }
  .model {
    font-size: var(--font-size-sm);
    color: var(--color-success);
    background: var(--color-success-subtle);
    padding: var(--space-1) var(--space-2);
    border-radius: var(--radius-sm);
  }
</style>
