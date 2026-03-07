<script lang="ts">
  import FolderTree from "./FolderTree.svelte";
  import TagFilter from "./TagFilter.svelte";
  import { folderTree } from "../stores/files";
  import { openFile } from "../stores/editor";
  import { selectedPath } from "../stores/files";

  function handleFileSelect(path: string) {
    openFile(path);
  }
</script>

<aside class="sidebar">
  <div class="sidebar-header">
    <h2>Promptcase</h2>
  </div>

  <TagFilter />

  <div class="tree-container">
    <FolderTree
      node={$folderTree}
      onFileSelect={handleFileSelect}
      selectedPath={$selectedPath}
    />
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
  .tree-container {
    flex: 1;
    overflow-y: auto;
    padding: 4px 0;
  }
</style>
