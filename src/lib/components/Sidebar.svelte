<script lang="ts">
  import FolderTree from "./FolderTree.svelte";
  import TagFilter from "./TagFilter.svelte";
  import InputDialog from "./InputDialog.svelte";
  import ConfirmDialog from "./ConfirmDialog.svelte";
  import FileContextMenu from "./FileContextMenu.svelte";
  import { folderTree, loadFiles, promptEntries } from "../stores/files";
  import { openFile, closeTab } from "../stores/editor";
  import { selectedPath } from "../stores/files";
  import { api } from "../ipc";
  import { get } from "svelte/store";

  let creating = $state(false);

  // Input dialog state (create / rename)
  let dialogVisible = $state(false);
  let dialogTitle = $state("");
  let dialogDefault = $state("");
  let dialogMode: "create-prompt" | "create-fragment" | "rename" = "create-prompt";

  // Confirm dialog state (delete)
  let deleteConfirmVisible = $state(false);
  let deleteTargetPath = $state("");

  // Context menu state
  let contextMenu = $state<{ path: string; x: number; y: number } | null>(null);

  function handleFileSelect(path: string) {
    openFile(path);
  }

  function handleFileContext(path: string, x: number, y: number) {
    contextMenu = { path, x, y };
  }

  function handleNewPrompt() {
    dialogMode = "create-prompt";
    dialogTitle = "New Prompt";
    dialogDefault = "New Prompt";
    dialogVisible = true;
  }

  function handleNewFragment() {
    dialogMode = "create-fragment";
    dialogTitle = "New Fragment";
    dialogDefault = "New Fragment";
    dialogVisible = true;
  }

  function handleRename(path: string) {
    const entries = get(promptEntries);
    const entry = entries.find((e) => e.path === path);
    dialogMode = "rename";
    dialogTitle = "Rename";
    dialogDefault = entry?.frontmatter.title || path.split("/").pop()?.replace(/\.md$/, "") || "";
    deleteTargetPath = path; // reuse for rename source
    dialogVisible = true;
  }

  async function handleDuplicate(path: string) {
    try {
      const file = await api.readFile(path);
      const baseName = path.replace(/\.md$/, "");
      const newPath = baseName + "-copy.md";
      const newTitle = (file.frontmatter.title || "Untitled") + " (Copy)";
      const created = await api.createFile(newPath, newTitle, file.frontmatter.type);
      await api.writeFile(created.path, undefined, file.body);
      await loadFiles();
      openFile(created.path);
    } catch (err) {
      console.error("Failed to duplicate:", err);
    }
  }

  function handleDeleteRequest(path: string) {
    deleteTargetPath = path;
    deleteConfirmVisible = true;
  }

  async function handleDeleteConfirm() {
    deleteConfirmVisible = false;
    try {
      await api.deleteFile(deleteTargetPath);
      closeTab(deleteTargetPath);
      await loadFiles();
    } catch (err) {
      console.error("Failed to delete:", err);
    }
  }

  async function handleDialogConfirm(name: string) {
    dialogVisible = false;
    if (creating) return;
    creating = true;
    try {
      if (dialogMode === "rename") {
        const oldPath = deleteTargetPath;
        const dir = oldPath.includes("/") ? oldPath.substring(0, oldPath.lastIndexOf("/") + 1) : "";
        const slug = name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") + ".md";
        const newPath = dir + slug;
        await api.moveFile(oldPath, newPath);
        await api.writeFile(newPath, { title: name });
        closeTab(oldPath);
        await loadFiles();
        openFile(newPath);
      } else {
        const isFragment = dialogMode === "create-fragment";
        const slug = name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") + ".md";
        const fileName = isFragment ? "fragments/" + slug : slug;
        const file = await api.createFile(fileName, name, isFragment ? "fragment" : "prompt");
        await loadFiles();
        openFile(file.path);
      }
    } catch (err) {
      console.error(`Failed to ${dialogMode}:`, err);
    } finally {
      creating = false;
    }
  }

  function handleDialogCancel() {
    dialogVisible = false;
  }
</script>

<aside class="sidebar">
  <div class="sidebar-header">
    <h2>Promptcase</h2>
    <div class="header-actions">
      <button class="action-btn" onclick={handleNewPrompt} title="New Prompt">+ Prompt</button>
      <button class="action-btn" onclick={handleNewFragment} title="New Fragment">+ Fragment</button>
    </div>
  </div>

  <TagFilter />

  <div class="tree-container">
    {#if $folderTree.children.length === 0 && $folderTree.files.length === 0}
      <div class="empty-tree">
        <p>No prompts yet.</p>
        <button class="create-btn" onclick={handleNewPrompt}>Create your first prompt</button>
      </div>
    {:else}
      <FolderTree
        node={$folderTree}
        onFileSelect={handleFileSelect}
        onFileContext={handleFileContext}
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
  message="This will permanently delete this file. Are you sure?"
  confirmLabel="Delete"
  cancelLabel="Cancel"
  onConfirm={handleDeleteConfirm}
  onCancel={() => { deleteConfirmVisible = false; }}
/>

{#if contextMenu}
  <FileContextMenu
    x={contextMenu.x}
    y={contextMenu.y}
    onRename={() => handleRename(contextMenu!.path)}
    onDuplicate={() => handleDuplicate(contextMenu!.path)}
    onDelete={() => handleDeleteRequest(contextMenu!.path)}
    onClose={() => { contextMenu = null; }}
  />
{/if}

<style>
  .sidebar {
    display: flex;
    flex-direction: column;
    height: 100%;
    background: #18181b;
    border-right: 1px solid #27272a;
    overflow: hidden;
  }
  .sidebar-header {
    padding: 12px 16px;
    border-bottom: 1px solid #27272a;
  }
  .sidebar-header h2 {
    margin: 0;
    font-size: 14px;
    font-weight: 600;
    color: #e4e4e7;
    letter-spacing: 0.5px;
  }
  .header-actions {
    display: flex;
    gap: 4px;
    margin-top: 8px;
  }
  .action-btn {
    flex: 1;
    padding: 4px 8px;
    background: #27272a;
    border: 1px solid #3f3f46;
    border-radius: 4px;
    color: #a1a1aa;
    font-size: 12px;
    cursor: pointer;
    font-family: inherit;
  }
  .action-btn:hover {
    background: #3f3f46;
    color: #d4d4d8;
  }
  .tree-container {
    flex: 1;
    overflow-y: auto;
    padding: 4px 0;
  }
  .empty-tree {
    display: flex;
    flex-direction: column;
    align-items: center;
    padding: 24px 16px;
    gap: 12px;
  }
  .empty-tree p {
    margin: 0;
    color: #52525b;
    font-size: 13px;
  }
  .create-btn {
    padding: 6px 16px;
    background: #a78bfa;
    border: none;
    border-radius: 6px;
    color: #09090b;
    font-size: 13px;
    font-weight: 500;
    cursor: pointer;
    font-family: inherit;
  }
  .create-btn:hover {
    background: #8b5cf6;
  }
</style>
