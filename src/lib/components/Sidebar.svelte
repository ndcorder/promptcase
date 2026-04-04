<script lang="ts">
  import FolderTree from "./FolderTree.svelte";
  import TagFilter from "./TagFilter.svelte";
  import InputDialog from "./InputDialog.svelte";
  import ConfirmDialog from "./ConfirmDialog.svelte";
  import FileContextMenu from "./FileContextMenu.svelte";
  import FolderContextMenu from "./FolderContextMenu.svelte";
  import MoveToFolderDialog from "./MoveToFolderDialog.svelte";
  import { folderTree, loadFiles, promptEntries, filesLoading, searchQuery, folderFileCounts, dragState, clearSelection, toggleSelection, selectRange, selectAll, selectedPaths, filteredEntries } from "../stores/files";
  import { openFile, closeTab } from "../stores/editor";
  import { selectedPath } from "../stores/files";
  import { api, isTauri } from "../ipc";
  import { addToast } from "../stores/toast";
  import { get } from "svelte/store";

  async function handleDragStart(e: MouseEvent) {
    if (!isTauri()) return;
    if (e.buttons !== 1) return;
    const target = e.target as HTMLElement;
    if (target.closest("button, a, input")) return;
    const { getCurrentWindow } = await import("@tauri-apps/api/window");
    if (e.detail === 2) {
      getCurrentWindow().toggleMaximize();
    } else {
      getCurrentWindow().startDragging();
    }
  }

  let creating = $state(false);

  let dialogVisible = $state(false);
  let dialogTitle = $state("");
  let dialogDefault = $state("");
  let dialogMode: "create" | "rename" | "create-folder" | "rename-folder" | "create-in-folder" = "create";

  let deleteConfirmVisible = $state(false);
  let deleteTargetPath = $state("");

  let contextMenu = $state<{ path: string; x: number; y: number } | null>(null);
  let folderContextMenu = $state<{ path: string; x: number; y: number } | null>(null);

  let searchValue = $state("");

  $effect(() => {
    searchQuery.set(searchValue);
  });

  let lastClickedPath = $state<string>("");

  function handleFileSelect(path: string, event?: MouseEvent) {
    if (event?.metaKey || event?.ctrlKey) {
      // Cmd/Ctrl+Click: toggle selection without opening
      toggleSelection(path, true);
      return;
    }
    if (event?.shiftKey && lastClickedPath) {
      // Shift+Click: range select
      selectRange(lastClickedPath, path, get(filteredEntries));
      return;
    }
    // Normal click: open file, clear multi-selection
    clearSelection();
    lastClickedPath = path;
    openFile(path);
  }

  function handleFileContext(path: string, x: number, y: number) {
    contextMenu = { path, x, y };
  }

  function handleFolderContext(path: string, x: number, y: number) {
    folderContextMenu = { path, x, y };
  }

  async function handleCreateFolder(parentPath?: string) {
    dialogMode = "create-folder";
    dialogTitle = "New Folder";
    dialogDefault = "New Folder";
    deleteTargetPath = parentPath || "";
    dialogVisible = true;
  }

  async function handleRenameFolder(path: string) {
    dialogMode = "rename-folder";
    dialogTitle = "Rename Folder";
    dialogDefault = path.split("/").pop() || "";
    deleteTargetPath = path;
    dialogVisible = true;
  }

  async function handleDeleteFolder(path: string) {
    try {
      await api.deleteFolder(path);
      await loadFiles();
      addToast("Folder deleted", "success", 2000);
    } catch (err: any) {
      addToast(err?.message || "Failed to delete folder", "error");
    }
  }

  function handleNewPromptInFolder(folderPath: string) {
    dialogMode = "create-in-folder";
    dialogTitle = "New Prompt";
    dialogDefault = "New Prompt";
    deleteTargetPath = folderPath;
    dialogVisible = true;
  }

  function handleNewPrompt() {
    dialogMode = "create";
    dialogTitle = "New Prompt";
    dialogDefault = "New Prompt";
    dialogVisible = true;
  }

  function handleRename(path: string) {
    const entries = get(promptEntries);
    const entry = entries.find((e) => e.path === path);
    dialogMode = "rename";
    dialogTitle = "Rename";
    dialogDefault = entry?.frontmatter.title || path.split("/").pop()?.replace(/\.md$/, "") || "";
    deleteTargetPath = path;
    dialogVisible = true;
  }

  async function handleDuplicate(path: string) {
    try {
      const file = await api.duplicateFile(path);
      await loadFiles();
      openFile(file.path);
      addToast(`Duplicated as "${file.frontmatter.title}"`, "success", 2000);
    } catch (err) {
      console.error("Failed to duplicate:", err);
      addToast("Failed to duplicate", "error");
    }
  }

  function handleDeleteRequest(path: string) {
    deleteTargetPath = path;
    deleteConfirmVisible = true;
  }

  function handleBulkDeleteRequest() {
    deleteTargetPath = "";
    deleteConfirmVisible = true;
  }

  async function handleDeleteConfirm() {
    deleteConfirmVisible = false;
    try {
      if ($selectedPaths.size > 1) {
        for (const path of $selectedPaths) {
          await api.deleteFile(path);
          closeTab(path);
        }
        clearSelection();
      } else {
        await api.deleteFile(deleteTargetPath);
        closeTab(deleteTargetPath);
      }
      await loadFiles();
    } catch (err) {
      console.error("Failed to delete:", err);
      addToast("Failed to delete", "error");
    }
  }

  let bulkTagDialogVisible = $state(false);
  let moveToDialogVisible = $state(false);
  let moveToTargetPaths = $state<string[]>([]);

  async function handleBulkAddTag(tag: string) {
    bulkTagDialogVisible = false;
    const t = tag.trim().toLowerCase();
    if (!t) return;
    try {
      for (const path of $selectedPaths) {
        const file = await api.readFile(path);
        if (!file.frontmatter.tags.includes(t)) {
          await api.writeFile(path, { tags: [...file.frontmatter.tags, t] });
        }
      }
      await loadFiles();
      addToast(`Added tag "${t}" to ${$selectedPaths.size} files`, "success", 2000);
    } catch (err) {
      console.error("Failed to add tag:", err);
      addToast("Failed to add tag", "error");
    }
  }

  async function handleMoveToConfirm(destination: string) {
    moveToDialogVisible = false;
    try {
      if (moveToTargetPaths.length === 1) {
        const filename = moveToTargetPaths[0].split("/").pop()!;
        const newPath = destination ? `${destination}/${filename}` : filename;
        await api.moveFile(moveToTargetPaths[0], newPath);
        closeTab(moveToTargetPaths[0]);
      } else {
        await api.moveFiles(moveToTargetPaths, destination);
        for (const p of moveToTargetPaths) closeTab(p);
      }
      clearSelection();
      await loadFiles();
      addToast(`Moved ${moveToTargetPaths.length} item(s)`, "success", 2000);
    } catch (err) {
      console.error("Failed to move:", err);
      addToast("Failed to move files", "error");
    }
  }

  async function handleDialogConfirm(name: string) {
    dialogVisible = false;
    if (creating) return;
    creating = true;
    try {
      const slug = name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");

      if (dialogMode === "create-folder") {
        const folderPath = deleteTargetPath ? `${deleteTargetPath}/${slug}` : slug;
        await api.createFolder(folderPath);
        await loadFiles();
        addToast("Folder created", "success", 2000);
      } else if (dialogMode === "rename-folder") {
        const oldPath = deleteTargetPath;
        const parentDir = oldPath.includes("/") ? oldPath.substring(0, oldPath.lastIndexOf("/")) : "";
        const newPath = parentDir ? `${parentDir}/${slug}` : slug;
        await api.renameFolder(oldPath, newPath);
        await loadFiles();
        addToast("Folder renamed", "success", 2000);
      } else if (dialogMode === "create-in-folder") {
        const filePath = `${deleteTargetPath}/${slug}.md`;
        const file = await api.createFile(filePath, name, "prompt");
        await loadFiles();
        openFile(file.path);
      } else if (dialogMode === "rename") {
        const oldPath = deleteTargetPath;
        const dir = oldPath.includes("/") ? oldPath.substring(0, oldPath.lastIndexOf("/") + 1) : "";
        const newPath = dir + slug + ".md";
        await api.moveFile(oldPath, newPath);
        await api.writeFile(newPath, { title: name });
        closeTab(oldPath);
        await loadFiles();
        openFile(newPath);
      } else {
        // "create" mode - default new prompt at root
        const file = await api.createFile(slug + ".md", name, "prompt");
        await loadFiles();
        openFile(file.path);
      }
    } catch (err) {
      console.error(`Failed to ${dialogMode}:`, err);
      addToast(`Failed to ${dialogMode}`, "error");
    } finally {
      creating = false;
    }
  }

  async function handleFileDrop(sourcePaths: string[], destinationFolder: string) {
    const toMove = sourcePaths.filter((p) => {
      const currentDir = p.includes("/") ? p.substring(0, p.lastIndexOf("/")) : "";
      return currentDir !== destinationFolder;
    });
    if (toMove.length === 0) return;

    try {
      if (toMove.length === 1) {
        const filename = toMove[0].split("/").pop()!;
        const newPath = destinationFolder ? `${destinationFolder}/${filename}` : filename;
        await api.moveFile(toMove[0], newPath);
      } else {
        await api.moveFiles(toMove, destinationFolder);
      }
      for (const p of toMove) {
        closeTab(p);
      }
      clearSelection();
      await loadFiles();
      addToast(`Moved ${toMove.length} item(s)`, "success", 2000);
    } catch (err) {
      console.error("Failed to move:", err);
      addToast("Failed to move files", "error");
    }
  }

  async function handleFolderDrop(sourceFolder: string, destinationFolder: string) {
    try {
      const folderName = sourceFolder.split("/").pop()!;
      const newPath = destinationFolder ? `${destinationFolder}/${folderName}` : folderName;
      await api.renameFolder(sourceFolder, newPath);
      await loadFiles();
      addToast("Folder moved", "success", 2000);
    } catch (err) {
      console.error("Failed to move folder:", err);
      addToast("Failed to move folder", "error");
    }
  }

  function handleDialogCancel() {
    dialogVisible = false;
  }
</script>

<svelte:window onkeydown={(e) => {
  if (e.key === "Escape") clearSelection();
  if ((e.metaKey || e.ctrlKey) && e.key === "a" && document.activeElement?.closest(".sidebar")) {
    e.preventDefault();
    selectAll();
  }
}} />

<aside class="sidebar">
  <div class="sidebar-header" data-tauri-drag-region onmousedown={handleDragStart}>
    <h2 data-tauri-drag-region>Promptcase</h2>
    <div class="header-actions">
      <button class="action-btn" onclick={handleNewPrompt} title="New Prompt">
        <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
          <path d="M6 1v10M1 6h10" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>
        </svg>
        New Prompt
      </button>
      <button class="action-btn" onclick={() => handleCreateFolder()} title="New Folder">
        <svg width="12" height="12" viewBox="0 0 14 12" fill="none">
          <path d="M1 2.5A1.5 1.5 0 012.5 1H5l1.5 2H11.5A1.5 1.5 0 0113 4.5v5A1.5 1.5 0 0111.5 11h-9A1.5 1.5 0 011 9.5z" stroke="currentColor" stroke-width="1.2"/>
          <path d="M7 5.5v3M5.5 7h3" stroke="currentColor" stroke-width="1.2" stroke-linecap="round"/>
        </svg>
      </button>
    </div>
    {#if $selectedPaths.size > 1}
      <div class="selection-badge">{$selectedPaths.size} selected</div>
    {/if}
  </div>

  <TagFilter />

  <div class="sidebar-search">
    <svg class="search-icon" width="13" height="13" viewBox="0 0 16 16">
      <circle cx="6.5" cy="6.5" r="5.5" fill="none" stroke="currentColor" stroke-width="1.3"/>
      <path d="M10.5 10.5L14.5 14.5" stroke="currentColor" stroke-width="1.3" stroke-linecap="round"/>
    </svg>
    <input
      class="search-input"
      type="text"
      placeholder="Filter prompts..."
      bind:value={searchValue}
      onkeydown={(e) => { if (e.key === "Escape") { searchValue = ""; } }}
    />
    {#if searchValue}
      <button class="search-clear" onclick={() => { searchValue = ""; }}>
        <svg width="8" height="8" viewBox="0 0 8 8">
          <path d="M1 1l6 6M7 1l-6 6" stroke="currentColor" stroke-width="1.2" stroke-linecap="round"/>
        </svg>
      </button>
    {/if}
  </div>

  <div
    class="tree-container"
    ondragover={(e) => {
      const ds = get(dragState);
      if (!ds) return;
      e.preventDefault();
      e.dataTransfer!.dropEffect = "move";
    }}
    ondrop={(e) => {
      e.preventDefault();
      const ds = get(dragState);
      if (!ds) return;
      if (ds.type === "folder") {
        handleFolderDrop(ds.paths[0], "");
      } else {
        handleFileDrop(ds.paths, "");
      }
      dragState.set(null);
    }}
  >
    {#if $filesLoading}
      <div class="skeleton-list">
        <div class="skeleton" style="width: 70%"></div>
        <div class="skeleton" style="width: 85%"></div>
        <div class="skeleton" style="width: 60%"></div>
        <div class="skeleton" style="width: 75%"></div>
        <div class="skeleton" style="width: 50%"></div>
      </div>
    {:else if $folderTree.children.length === 0 && $folderTree.files.length === 0}
      <div class="empty-tree">
        <p>No prompts yet.</p>
        <button class="create-btn" onclick={handleNewPrompt}>Create your first prompt</button>
      </div>
    {:else}
      <FolderTree
        node={$folderTree}
        onFileSelect={handleFileSelect}
        onFileContext={handleFileContext}
        onFolderContext={handleFolderContext}
        onFileDrop={handleFileDrop}
        onFolderDrop={handleFolderDrop}
        selectedPath={$selectedPath}
      />
    {/if}
  </div>
</aside>

<InputDialog
  visible={dialogVisible}
  title={dialogTitle}
  placeholder="Enter a name..."
  defaultValue={dialogDefault}
  onConfirm={handleDialogConfirm}
  onCancel={handleDialogCancel}
/>

<ConfirmDialog
  visible={deleteConfirmVisible}
  title="Delete File"
  message={$selectedPaths.size > 1
    ? `This will permanently delete ${$selectedPaths.size} files. Are you sure?`
    : `This will permanently delete "${deleteTargetPath.split("/").pop()}". Are you sure?`}
  confirmLabel="Delete"
  cancelLabel="Cancel"
  onConfirm={handleDeleteConfirm}
  onCancel={() => { deleteConfirmVisible = false; }}
/>

{#if contextMenu}
  <FileContextMenu
    x={contextMenu.x}
    y={contextMenu.y}
    bulkCount={$selectedPaths.size > 1 ? $selectedPaths.size : 1}
    onRename={() => handleRename(contextMenu!.path)}
    onDuplicate={() => handleDuplicate(contextMenu!.path)}
    onDelete={() => {
      if ($selectedPaths.size > 1) {
        handleBulkDeleteRequest();
      } else {
        handleDeleteRequest(contextMenu!.path);
      }
    }}
    onMoveTo={() => {
      const paths = $selectedPaths.size > 1 ? [...$selectedPaths] : [contextMenu!.path];
      moveToTargetPaths = paths;
      moveToDialogVisible = true;
    }}
    onAddTag={() => {
      bulkTagDialogVisible = true;
    }}
    onClose={() => { contextMenu = null; }}
  />
{/if}

<InputDialog
  visible={bulkTagDialogVisible}
  title="Add Tag to All"
  placeholder="Enter tag name..."
  defaultValue=""
  onConfirm={handleBulkAddTag}
  onCancel={() => { bulkTagDialogVisible = false; }}
/>

{#if folderContextMenu}
  <FolderContextMenu
    x={folderContextMenu.x}
    y={folderContextMenu.y}
    isEmpty={($folderFileCounts.get(folderContextMenu.path) ?? 0) === 0}
    onNewPromptHere={() => handleNewPromptInFolder(folderContextMenu!.path)}
    onNewFolderInside={() => handleCreateFolder(folderContextMenu!.path)}
    onRename={() => handleRenameFolder(folderContextMenu!.path)}
    onDelete={() => handleDeleteFolder(folderContextMenu!.path)}
    onClose={() => { folderContextMenu = null; }}
  />
{/if}

<MoveToFolderDialog
  visible={moveToDialogVisible}
  paths={moveToTargetPaths}
  onConfirm={handleMoveToConfirm}
  onCancel={() => { moveToDialogVisible = false; }}
/>

<style>
  .sidebar {
    display: flex;
    flex-direction: column;
    height: 100%;
    background: var(--sidebar-bg);
    backdrop-filter: blur(var(--sidebar-blur));
    -webkit-backdrop-filter: blur(var(--sidebar-blur));
    border-right: 1px solid var(--border-primary);
    overflow: hidden;
  }
  .sidebar-header {
    padding: 52px var(--space-4) var(--space-3);
  }
  .sidebar-header h2 {
    margin: 0;
    font-size: var(--font-size-base);
    font-weight: var(--font-weight-semibold);
    color: var(--text-secondary);
    letter-spacing: 0.02em;
    text-transform: uppercase;
  }
  .header-actions {
    display: flex;
    gap: var(--space-1);
    margin-top: var(--space-2);
  }
  .selection-badge {
    font-size: var(--font-size-xs, 11px);
    color: var(--accent);
    padding: var(--space-1) var(--space-2);
  }
  .action-btn {
    flex: 1;
    display: flex;
    align-items: center;
    justify-content: center;
    gap: var(--space-1);
    padding: var(--space-1) var(--space-2);
    background: rgba(255, 255, 255, 0.06);
    border: 1px solid var(--border-primary);
    border-radius: var(--radius-md);
    color: var(--text-secondary);
    font-size: var(--font-size-sm);
    transition: all var(--transition-base);
  }
  .action-btn:hover {
    background: rgba(255, 255, 255, 0.10);
    color: var(--text-primary);
  }
  .action-btn:active {
    background: rgba(255, 255, 255, 0.04);
    transform: scale(0.98);
  }
  .sidebar-search {
    position: relative;
    display: flex;
    align-items: center;
    margin: 0 var(--space-2) var(--space-2);
  }
  .search-icon {
    position: absolute;
    left: var(--space-2);
    color: var(--text-tertiary);
    pointer-events: none;
  }
  .search-input {
    width: 100%;
    padding: var(--space-1) var(--space-2) var(--space-1) calc(var(--space-2) + 18px);
    background: var(--bg-secondary);
    border: 1px solid var(--border-primary);
    border-radius: var(--radius-md);
    color: var(--text-primary);
    font-size: var(--font-size-sm);
    font-family: inherit;
    outline: none;
    transition: border-color var(--transition-fast);
  }
  .search-input:focus {
    border-color: var(--accent);
  }
  .search-input::placeholder {
    color: var(--text-tertiary);
  }
  .search-clear {
    position: absolute;
    right: var(--space-1);
    padding: var(--space-1);
    color: var(--text-tertiary);
    cursor: pointer;
    border-radius: var(--radius-sm);
  }
  .search-clear:hover {
    color: var(--text-primary);
  }
  .tree-container {
    flex: 1;
    overflow-y: auto;
    padding: var(--space-1) 0;
  }
  .empty-tree {
    display: flex;
    flex-direction: column;
    align-items: center;
    padding: var(--space-6) var(--space-4);
    gap: var(--space-3);
  }
  .empty-tree p {
    margin: 0;
    color: var(--text-tertiary);
    font-size: var(--font-size-base);
  }
  .create-btn {
    padding: var(--space-1) var(--space-4);
    background: var(--accent);
    border: none;
    border-radius: var(--radius-md);
    color: white;
    font-size: var(--font-size-base);
    font-weight: var(--font-weight-medium);
    transition: background var(--transition-base);
  }
  .create-btn:hover {
    background: var(--accent-hover);
  }
  .create-btn:active {
    background: var(--accent);
    transform: scale(0.98);
  }
  .skeleton-list {
    padding: var(--space-2) var(--space-3);
  }
  @keyframes skeleton-pulse {
    0%, 100% { opacity: 0.15; }
    50% { opacity: 0.25; }
  }
  .skeleton {
    background: var(--text-quaternary);
    animation: skeleton-pulse 1.5s ease-in-out infinite;
    border-radius: var(--radius-sm);
    height: 20px;
    margin-bottom: var(--space-1);
  }
</style>
