<script lang="ts">
  import type { FolderNode, PromptEntry } from "../types";
  import { expandedFolders, folderFileCounts, dragState, selectedPaths } from "../stores/files";
  import { get } from "svelte/store";

  interface Props {
    node: FolderNode;
    depth?: number;
    onFileSelect: (path: string) => void;
    onFileContext?: (path: string, x: number, y: number) => void;
    onFolderContext?: (path: string, x: number, y: number) => void;
    onFileDrop?: (sourcePaths: string[], destinationFolder: string) => void;
    onFolderDrop?: (sourceFolder: string, destinationFolder: string) => void;
    selectedPath: string | null;
  }

  let { node, depth = 0, onFileSelect, onFileContext, onFolderContext, onFileDrop, onFolderDrop, selectedPath }: Props = $props();

  let dropTarget = $state(false);

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
    class:drop-target={dropTarget}
    style="padding-left: {depth * 16 + 8}px"
    onclick={toggleExpand}
    oncontextmenu={(e) => { e.preventDefault(); onFolderContext?.(node.path, e.clientX, e.clientY); }}
    draggable="true"
    ondragstart={(e) => {
      dragState.set({ type: "folder", paths: [node.path] });
      e.dataTransfer!.effectAllowed = "move";
      e.dataTransfer!.setData("text/plain", node.path);
    }}
    ondragend={() => { dragState.set(null); }}
    ondragover={(e) => {
      const ds = get(dragState);
      if (!ds) return;
      if (ds.type === "folder" && (node.path === ds.paths[0] || node.path.startsWith(ds.paths[0] + "/"))) return;
      e.preventDefault();
      e.dataTransfer!.dropEffect = "move";
      dropTarget = true;
    }}
    ondragleave={() => { dropTarget = false; }}
    ondrop={(e) => {
      e.preventDefault();
      dropTarget = false;
      const ds = get(dragState);
      if (!ds) return;
      if (ds.type === "folder") {
        onFolderDrop?.(ds.paths[0], node.path);
      } else {
        onFileDrop?.(ds.paths, node.path);
      }
      dragState.set(null);
    }}
  >
    <svg class="chevron" class:expanded width="8" height="8" viewBox="0 0 8 8">
      <path d="M2 1l3 3-3 3" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
    </svg>
    <span class="folder-name">{node.name}</span>
    <span class="folder-count">{$folderFileCounts.get(node.path) ?? 0}</span>
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
      {onFileDrop}
      {onFolderDrop}
      {selectedPath}
    />
  {/each}

  {#each node.files as file}
    <button
      class="file-row"
      class:selected={selectedPath === file.path || $selectedPaths.has(file.path)}
      style="padding-left: {(node.name ? depth + 1 : depth) * 16 + 8}px"
      draggable="true"
      onclick={() => onFileSelect(file.path)}
      oncontextmenu={(e) => { e.preventDefault(); onFileContext?.(file.path, e.clientX, e.clientY); }}
      ondragstart={(e) => {
        const sel = get(selectedPaths);
        const paths = sel.has(file.path) && sel.size > 1
          ? [...sel]
          : [file.path];
        dragState.set({ type: paths.length > 1 ? "files" : "file", paths });
        e.dataTransfer!.effectAllowed = "move";
        e.dataTransfer!.setData("text/plain", paths.join("\n"));
      }}
      ondragend={() => { dragState.set(null); }}
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
  .folder-row.drop-target {
    background: var(--accent-subtle);
    outline: 1px dashed var(--accent);
    outline-offset: -1px;
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
  .folder-count {
    color: var(--text-tertiary);
    font-size: var(--font-size-xs, 11px);
    font-weight: var(--font-weight-normal, 400);
    margin-left: auto;
    padding-right: var(--space-2);
    text-transform: none;
    letter-spacing: normal;
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
