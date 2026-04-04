<script lang="ts">
  import { api } from "../ipc";
  import { addToast } from "../stores/toast";

  interface Props {
    x: number;
    y: number;
    path: string;
    onRename: () => void;
    onDuplicate: () => void;
    onDelete: () => void;
    onClose: () => void;
  }

  let { x, y, path, onRename, onDuplicate, onDelete, onClose }: Props = $props();

  let copyExpanded = $state(false);

  function handleAction(fn: () => void) {
    fn();
    onClose();
  }

  async function handleCopy(format: "raw" | "body" | "resolved") {
    try {
      const text = await api.exportFileClipboard(path, format);
      await navigator.clipboard.writeText(text);
      addToast(`Copied ${format} content`, "success");
    } catch (err) {
      addToast(`Copy failed: ${err}`, "error");
    }
    onClose();
  }
</script>

<svelte:window onclick={onClose} />

<div class="context-menu" style="left: {x}px; top: {y}px" onclick={(e) => e.stopPropagation()}>
  <button class="menu-item" onclick={() => handleAction(onRename)}>Rename</button>
  <button class="menu-item" onclick={() => handleAction(onDuplicate)}>Duplicate</button>
  <div class="separator"></div>
  <button
    class="menu-item submenu-trigger"
    onclick={() => { copyExpanded = !copyExpanded; }}
  >
    Copy
    <svg class="submenu-chevron" class:expanded={copyExpanded} width="8" height="8" viewBox="0 0 8 8">
      <path d="M2 1l3 3-3 3" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
    </svg>
  </button>
  {#if copyExpanded}
    <button class="menu-item sub-item" onclick={() => handleCopy("raw")}>Raw (full file)</button>
    <button class="menu-item sub-item" onclick={() => handleCopy("body")}>Body only</button>
    <button class="menu-item sub-item" onclick={() => handleCopy("resolved")}>Resolved</button>
  {/if}
  <div class="separator"></div>
  <button class="menu-item danger" onclick={() => handleAction(onDelete)}>Delete</button>
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
    justify-content: space-between;
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
  .menu-item.danger {
    color: var(--color-error);
  }
  .menu-item.danger:hover {
    background: var(--color-error);
    color: white;
  }
  .sub-item {
    padding-left: var(--space-6);
    font-size: var(--font-size-sm);
    color: var(--text-secondary);
  }
  .submenu-chevron {
    color: var(--text-tertiary);
    flex-shrink: 0;
    transition: transform var(--transition-fast);
  }
  .submenu-chevron.expanded {
    transform: rotate(90deg);
  }
  .separator {
    height: 1px;
    background: var(--border-primary);
    margin: var(--space-1) 0;
  }
</style>
