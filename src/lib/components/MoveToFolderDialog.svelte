<script lang="ts">
  import { allFolderPaths } from "../stores/files";
  import { api } from "../ipc";

  interface Props {
    visible: boolean;
    paths: string[];
    onConfirm: (destination: string) => void;
    onCancel: () => void;
  }

  let { visible, paths, onConfirm, onCancel }: Props = $props();

  let selectedFolder = $state("");
  let filterText = $state("");
  let creatingFolder = $state(false);
  let newFolderName = $state("");

  let filteredFolders = $derived.by(() => {
    const q = filterText.toLowerCase();
    const folders = ["", ...$allFolderPaths];
    return q ? folders.filter((f) => f.toLowerCase().includes(q) || f === "") : folders;
  });

  function displayName(folderPath: string): string {
    if (!folderPath) return "/ (root)";
    return folderPath;
  }

  function isCurrent(folderPath: string): boolean {
    if (paths.length === 0) return false;
    const firstFileDir = paths[0].includes("/")
      ? paths[0].substring(0, paths[0].lastIndexOf("/"))
      : "";
    return folderPath === firstFileDir;
  }

  function handleKeydown(e: KeyboardEvent) {
    if (!visible) return;
    if (e.key === "Escape") {
      onCancel();
    } else if (e.key === "Enter" && !creatingFolder) {
      onConfirm(selectedFolder);
    }
  }

  async function handleCreateFolder() {
    const name = newFolderName.trim().toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
    if (!name) return;
    const folderPath = selectedFolder ? `${selectedFolder}/${name}` : name;
    try {
      await api.createFolder(folderPath);
      selectedFolder = folderPath;
      creatingFolder = false;
      newFolderName = "";
    } catch (err) {
      console.error("Failed to create folder:", err);
    }
  }

  $effect(() => {
    if (visible) {
      selectedFolder = "";
      filterText = "";
      creatingFolder = false;
      newFolderName = "";
    }
  });
</script>

<svelte:window onkeydown={handleKeydown} />

{#if visible}
  <div class="overlay" onclick={onCancel}>
    <div class="dialog" onclick={(e) => e.stopPropagation()}>
      <h3>Move {paths.length > 1 ? `${paths.length} items` : "file"} to...</h3>

      <input
        class="filter-input"
        type="text"
        placeholder="Filter folders..."
        bind:value={filterText}
      />

      <div class="folder-list">
        {#each filteredFolders as folder}
          <button
            class="folder-option"
            class:selected={selectedFolder === folder}
            class:current={isCurrent(folder)}
            onclick={() => { selectedFolder = folder; }}
            ondblclick={() => { onConfirm(folder); }}
          >
            <svg width="14" height="14" viewBox="0 0 14 12" fill="none">
              <path d="M1 2.5A1.5 1.5 0 012.5 1H5l1.5 2H11.5A1.5 1.5 0 0113 4.5v5A1.5 1.5 0 0111.5 11h-9A1.5 1.5 0 011 9.5z" stroke="currentColor" stroke-width="1.2"/>
            </svg>
            <span>{displayName(folder)}</span>
            {#if isCurrent(folder)}
              <span class="current-label">(current)</span>
            {/if}
          </button>
        {/each}
      </div>

      {#if creatingFolder}
        <div class="new-folder-row">
          <input
            class="new-folder-input"
            type="text"
            placeholder="Folder name..."
            bind:value={newFolderName}
          />
          <button class="btn btn-sm" onclick={handleCreateFolder}>Create</button>
          <button class="btn btn-sm btn-ghost" onclick={() => { creatingFolder = false; }}>Cancel</button>
        </div>
      {:else}
        <button class="new-folder-btn" onclick={() => { creatingFolder = true; }}>
          + New Folder
        </button>
      {/if}

      <div class="dialog-actions">
        <button class="btn btn-ghost" onclick={onCancel}>Cancel</button>
        <button class="btn btn-primary" onclick={() => onConfirm(selectedFolder)}>
          Move Here
        </button>
      </div>
    </div>
  </div>
{/if}

<style>
  .overlay {
    position: fixed;
    inset: 0;
    z-index: 300;
    background: rgba(0, 0, 0, 0.5);
    display: flex;
    align-items: center;
    justify-content: center;
  }
  .dialog {
    background: var(--bg-secondary);
    border: 1px solid var(--border-primary);
    border-radius: var(--radius-lg);
    padding: var(--space-4);
    width: 360px;
    max-height: 480px;
    display: flex;
    flex-direction: column;
    gap: var(--space-3);
    box-shadow: var(--shadow-popover);
  }
  h3 {
    margin: 0;
    font-size: var(--font-size-base);
    font-weight: var(--font-weight-semibold);
    color: var(--text-primary);
  }
  .filter-input, .new-folder-input {
    width: 100%;
    padding: var(--space-1) var(--space-2);
    background: var(--bg-primary);
    border: 1px solid var(--border-primary);
    border-radius: var(--radius-md);
    color: var(--text-primary);
    font-size: var(--font-size-sm);
    font-family: inherit;
    outline: none;
  }
  .filter-input:focus, .new-folder-input:focus {
    border-color: var(--accent);
  }
  .folder-list {
    flex: 1;
    overflow-y: auto;
    max-height: 240px;
    display: flex;
    flex-direction: column;
    gap: 1px;
  }
  .folder-option {
    display: flex;
    align-items: center;
    gap: var(--space-2);
    padding: var(--space-1) var(--space-2);
    border: none;
    background: none;
    color: var(--text-primary);
    font-size: var(--font-size-sm);
    text-align: left;
    border-radius: var(--radius-sm);
    cursor: pointer;
    font-family: inherit;
    transition: background var(--transition-fast);
  }
  .folder-option:hover {
    background: var(--accent-subtle);
  }
  .folder-option.selected {
    background: var(--accent-selection);
  }
  .folder-option.current {
    opacity: 0.6;
  }
  .current-label {
    color: var(--text-tertiary);
    font-size: var(--font-size-xs, 11px);
    margin-left: auto;
  }
  .new-folder-row {
    display: flex;
    gap: var(--space-2);
    align-items: center;
  }
  .new-folder-btn {
    color: var(--accent);
    font-size: var(--font-size-sm);
    font-family: inherit;
    padding: var(--space-1) var(--space-2);
    text-align: left;
    cursor: pointer;
    border-radius: var(--radius-sm);
    transition: background var(--transition-fast);
  }
  .new-folder-btn:hover {
    background: var(--accent-subtle);
  }
  .dialog-actions {
    display: flex;
    justify-content: flex-end;
    gap: var(--space-2);
  }
  .btn {
    padding: var(--space-1) var(--space-3);
    border-radius: var(--radius-md);
    font-size: var(--font-size-sm);
    font-family: inherit;
    cursor: pointer;
    transition: background var(--transition-fast);
  }
  .btn-primary {
    background: var(--accent);
    color: white;
    border: none;
  }
  .btn-primary:hover {
    filter: brightness(1.1);
  }
  .btn-ghost {
    background: none;
    color: var(--text-secondary);
    border: 1px solid var(--border-primary);
  }
  .btn-ghost:hover {
    background: var(--accent-subtle);
  }
  .btn-sm {
    padding: var(--space-1) var(--space-2);
    font-size: var(--font-size-xs, 11px);
  }
</style>
