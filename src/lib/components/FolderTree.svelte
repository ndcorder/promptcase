<script lang="ts">
  import type { FolderNode, PromptEntry } from "../types";
  import { expandedFolders } from "../stores/files";

  interface Props {
    node: FolderNode;
    depth?: number;
    onFileSelect: (path: string) => void;
    onFileContext?: (path: string, x: number, y: number) => void;
    selectedPath: string | null;
  }

  let { node, depth = 0, onFileSelect, onFileContext, selectedPath }: Props = $props();

  // Default new folders to expanded
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

  function getIcon(entry: PromptEntry): string {
    return entry.frontmatter.type === "fragment" ? "F" : "P";
  }
</script>

{#if node.name}
  <button
    class="folder-row"
    style="padding-left: {depth * 16 + 4}px"
    onclick={toggleExpand}
  >
    <span class="folder-icon">{expanded ? "v" : ">"}</span>
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
      {selectedPath}
    />
  {/each}

  {#each node.files as file}
    <button
      class="file-row"
      class:selected={selectedPath === file.path}
      style="padding-left: {(node.name ? depth + 1 : depth) * 16 + 4}px"
      onclick={() => onFileSelect(file.path)}
      oncontextmenu={(e) => { e.preventDefault(); onFileContext?.(file.path, e.clientX, e.clientY); }}
    >
      <span class="file-icon" class:fragment={file.frontmatter.type === "fragment"}>
        {getIcon(file)}
      </span>
      <span class="file-name">{file.frontmatter.title || file.path.split("/").pop()}</span>
    </button>
  {/each}
{/if}

<style>
  .folder-row,
  .file-row {
    display: flex;
    align-items: center;
    gap: 6px;
    width: 100%;
    padding: 4px 8px;
    border: none;
    background: none;
    color: #d4d4d8;
    font-size: 13px;
    cursor: pointer;
    text-align: left;
    font-family: inherit;
  }
  .folder-row:hover,
  .file-row:hover {
    background: #27272a;
  }
  .file-row.selected {
    background: #3f3f46;
    color: #f4f4f5;
  }
  .folder-icon {
    color: #71717a;
    font-size: 10px;
    width: 12px;
    text-align: center;
  }
  .folder-name {
    color: #a1a1aa;
    font-weight: 500;
  }
  .file-icon {
    color: #60a5fa;
    font-size: 11px;
    font-weight: 600;
    width: 16px;
    height: 16px;
    display: flex;
    align-items: center;
    justify-content: center;
    border-radius: 2px;
    background: #60a5fa20;
  }
  .file-icon.fragment {
    color: #a78bfa;
    background: #a78bfa20;
  }
  .file-name {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
</style>
