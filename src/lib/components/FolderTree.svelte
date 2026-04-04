<script lang="ts">
  import type { FolderNode, PromptEntry } from "../types";
  import { expandedFolders } from "../stores/files";

  interface Props {
    node: FolderNode;
    depth?: number;
    onFileSelect: (path: string) => void;
    onFileContext?: (path: string, x: number, y: number) => void;
    onFolderContext?: (folderPath: string, x: number, y: number) => void;
    selectedPath: string | null;
  }

  let { node, depth = 0, onFileSelect, onFileContext, onFolderContext, selectedPath }: Props = $props();

  $effect(() => {
    if (node.name && node.path) {
      expandedFolders.update((set) => {
        if (!set.has(node.path) && !set.has(`__seen__${node.path}`)) {
          set.add(node.path);
        }
        set.add(`__seen__${node.path}`);
        return set;
      });
    }
  });

  let expanded = $derived(!node.name || $expandedFolders.has(node.path));

  function toggleExpand() {
    expandedFolders.update((set) => {
      if (set.has(node.path)) {
        set.delete(node.path);
      } else {
        set.add(node.path);
      }
      return new Set(set);
    });
  }
</script>

{#if node.name}
  <button
    class="folder-row"
    style="padding-left: {depth * 16 + 8}px"
    onclick={toggleExpand}
    oncontextmenu={(e) => { e.preventDefault(); onFolderContext?.(node.path, e.clientX, e.clientY); }}
  >
    <svg class="chevron" class:expanded width="8" height="8" viewBox="0 0 8 8">
      <path d="M2 1l3 3-3 3" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
    </svg>
    <span class="folder-name">{node.name}</span>
  </button>
{/if}

{#if expanded || !node.name}
  {#each node.children as child}
    <svelte:self
      node={child}
      depth={node.name ? depth + 1 : depth}
      {onFileSelect}
      {onFileContext}
      {onFolderContext}
      {selectedPath}
    />
  {/each}

  {#each node.files as file}
    <button
      class="file-row"
      class:selected={selectedPath === file.path}
      style="padding-left: {(node.name ? depth + 1 : depth) * 16 + 8}px"
      onclick={() => onFileSelect(file.path)}
      oncontextmenu={(e) => { e.preventDefault(); onFileContext?.(file.path, e.clientX, e.clientY); }}
    >
      <svg class="file-icon" width="14" height="14" viewBox="0 0 16 16">
        <path d="M4 1.5h5.5L13 5v9.5a1 1 0 01-1 1H4a1 1 0 01-1-1v-13a1 1 0 011-1z" fill="none" stroke="currentColor" stroke-width="1.2"/>
        <path d="M9.5 1.5V5H13" fill="none" stroke="currentColor" stroke-width="1.2"/>
      </svg>
      <span class="file-name">{file.frontmatter.title || file.path.split("/").pop()}</span>
    </button>
  {/each}
{/if}

<style>
  .folder-row,
  .file-row {
    display: flex;
    align-items: center;
    gap: var(--space-2);
    width: 100%;
    padding: var(--space-1) var(--space-2);
    border: none;
    background: none;
    color: var(--text-primary);
    font-size: var(--font-size-base);
    cursor: pointer;
    text-align: left;
    font-family: inherit;
    border-radius: var(--radius-sm);
    margin: 0 var(--space-1);
    width: calc(100% - var(--space-2));
    transition: background var(--transition-fast);
  }
  .folder-row:hover,
  .file-row:hover {
    background: var(--accent-subtle);
  }
  .folder-row:active,
  .file-row:active {
    background: rgba(255, 255, 255, 0.03);
  }
  .file-row.selected {
    background: var(--accent-selection);
    color: var(--text-primary);
  }
  .chevron {
    color: var(--text-tertiary);
    flex-shrink: 0;
    transition: transform var(--transition-fast);
  }
  .chevron.expanded {
    transform: rotate(90deg);
  }
  .folder-name {
    color: var(--text-secondary);
    font-weight: var(--font-weight-medium);
    font-size: var(--font-size-sm);
    text-transform: uppercase;
    letter-spacing: 0.03em;
  }
  .file-icon {
    color: var(--text-tertiary);
    flex-shrink: 0;
  }
  .file-row.selected .file-icon {
    color: var(--accent);
  }
  .file-name {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
</style>
