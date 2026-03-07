<script lang="ts">
  import { activeFile } from "../stores/editor";
</script>

{#if $activeFile}
  <div class="metadata-panel">
    <h3>Metadata</h3>
    <div class="field">
      <label>Type</label>
      <span class="value type-badge" class:fragment={$activeFile.frontmatter.type === "fragment"}>
        {$activeFile.frontmatter.type}
      </span>
    </div>
    <div class="field">
      <label>ID</label>
      <span class="value mono">{$activeFile.frontmatter.id}</span>
    </div>
    <div class="field">
      <label>Tags</label>
      <div class="tags">
        {#each $activeFile.frontmatter.tags as tag}
          <span class="tag">#{tag}</span>
        {/each}
        {#if $activeFile.frontmatter.tags.length === 0}
          <span class="empty">No tags</span>
        {/if}
      </div>
    </div>
    {#if $activeFile.frontmatter.model_targets?.length}
      <div class="field">
        <label>Models</label>
        <div class="models">
          {#each $activeFile.frontmatter.model_targets as model}
            <span class="model">{model}</span>
          {/each}
        </div>
      </div>
    {/if}
    <div class="field">
      <label>Created</label>
      <span class="value">{new Date($activeFile.frontmatter.created).toLocaleDateString()}</span>
    </div>
    <div class="field">
      <label>Modified</label>
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
  label {
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
  }
  .empty {
    font-size: 12px;
    color: #52525b;
    font-style: italic;
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
