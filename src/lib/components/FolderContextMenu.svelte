<script lang="ts">
  import { api, isTauri } from "../ipc";
  import { addToast } from "../stores/toast";

  interface Props {
    x: number;
    y: number;
    folderPath: string;
    onClose: () => void;
  }

  let { x, y, folderPath, onClose }: Props = $props();

  async function handleExportZip() {
    try {
      if (!isTauri()) {
        addToast("Export requires the desktop app", "error");
        onClose();
        return;
      }

      const { save } = await import("@tauri-apps/plugin-dialog");
      const dest = await save({
        defaultPath: `${folderPath.split("/").pop() || "prompts"}.zip`,
        filters: [{ name: "Zip Archive", extensions: ["zip"] }],
      });

      if (!dest) {
        onClose();
        return;
      }

      await api.exportFolderZip(folderPath, dest);
      addToast("Exported folder as zip", "success");
    } catch (err) {
      addToast(`Export failed: ${err}`, "error");
    }
    onClose();
  }
</script>

<svelte:window onclick={onClose} />

<div class="context-menu" style="left: {x}px; top: {y}px" onclick={(e) => e.stopPropagation()}>
  <button class="menu-item" onclick={handleExportZip}>Export as Zip</button>
</div>

<style>
  .context-menu {
    position: fixed;
    z-index: 200;
    min-width: 160px;
    background: var(--bg-tertiary);
    border: 1px solid var(--border-primary);
    border-radius: var(--radius-lg);
    padding: var(--space-1) 0;
    box-shadow: var(--shadow-popover);
  }
  .menu-item {
    display: flex;
    align-items: center;
    width: calc(100% - var(--space-2));
    margin: 0 var(--space-1);
    padding: var(--space-1) var(--space-3);
    color: var(--text-primary);
    font-size: var(--font-size-base);
    text-align: left;
    border-radius: var(--radius-sm);
    transition: background var(--transition-fast);
  }
  .menu-item:hover {
    background: var(--accent);
    color: white;
  }
</style>
