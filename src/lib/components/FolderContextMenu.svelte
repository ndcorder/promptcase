<script lang="ts">
  interface Props {
    x: number;
    y: number;
    isEmpty: boolean;
    onNewPromptHere: () => void;
    onNewFolderInside: () => void;
    onRename: () => void;
    onDelete: () => void;
    onClose: () => void;
  }

  let { x, y, isEmpty, onNewPromptHere, onNewFolderInside, onRename, onDelete, onClose }: Props = $props();

  function handleAction(fn: () => void) {
    fn();
    onClose();
  }
</script>

<svelte:window onclick={onClose} />

<div class="context-menu" style="left: {x}px; top: {y}px" onclick={(e) => e.stopPropagation()}>
  <button class="menu-item" onclick={() => handleAction(onNewPromptHere)}>New Prompt Here</button>
  <button class="menu-item" onclick={() => handleAction(onNewFolderInside)}>New Folder Inside</button>
  <div class="separator"></div>
  <button class="menu-item" onclick={() => handleAction(onRename)}>Rename</button>
  <button
    class="menu-item danger"
    class:disabled={!isEmpty}
    onclick={() => { if (isEmpty) handleAction(onDelete); }}
    title={isEmpty ? "" : "Folder must be empty to delete"}
  >
    Delete
  </button>
</div>

<style>
  .context-menu {
    position: fixed;
    z-index: 200;
    min-width: 180px;
    background: var(--bg-tertiary);
    border: 1px solid var(--border-primary);
    border-radius: var(--radius-lg);
    padding: var(--space-1) 0;
    box-shadow: var(--shadow-popover);
  }
  .menu-item {
    display: block;
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
  .menu-item.disabled {
    opacity: 0.4;
    cursor: not-allowed;
  }
  .menu-item.disabled:hover {
    background: none;
    color: var(--color-error);
  }
  .separator {
    height: 1px;
    background: var(--border-primary);
    margin: var(--space-1) 0;
  }
</style>
