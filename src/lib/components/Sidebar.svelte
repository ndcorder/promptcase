<script lang="ts">
  import FolderTree from "./FolderTree.svelte";
  import TagFilter from "./TagFilter.svelte";
  import { folderTree, loadFiles } from "../stores/files";
  import { openFile } from "../stores/editor";
  import { selectedPath } from "../stores/files";
  import { api } from "../ipc";

  let creating = $state(false);

  function handleFileSelect(path: string) {
    openFile(path);
  }

  async function handleNewPrompt() {
    if (creating) return;
    creating = true;
    try {
      const name = window.prompt("Prompt name:", "New Prompt");
      if (!name) return;
      const fileName = name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") + ".md";
      const file = await api.createFile(fileName, name, "prompt");
      await loadFiles();
      openFile(file.path);
    } catch (err) {
      console.error("Failed to create prompt:", err);
    } finally {
      creating = false;
    }
  }

  async function handleNewFragment() {
    if (creating) return;
    creating = true;
    try {
      const name = window.prompt("Fragment name:", "New Fragment");
      if (!name) return;
      const fileName = "fragments/" + name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") + ".md";
      const file = await api.createFile(fileName, name, "fragment");
      await loadFiles();
      openFile(file.path);
    } catch (err) {
      console.error("Failed to create fragment:", err);
    } finally {
      creating = false;
    }
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
        selectedPath={$selectedPath}
      />
    {/if}
  </div>
</aside>

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
