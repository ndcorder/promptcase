<script lang="ts">
  interface Props {
    x: number;
    y: number;
    bulkCount: number;
    onRename: () => void;
    onDuplicate: () => void;
    onDelete: () => void;
    onMoveTo: () => void;
    onAddTag: () => void;
    onClose: () => void;
  }

  let { x, y, bulkCount, onRename, onDuplicate, onDelete, onMoveTo, onAddTag, onClose }: Props = $props();

  function handleAction(fn: () => void) {
    fn();
    onClose();
  }
</script>

<svelte:window onclick={onClose} />

<div class="context-menu" style="left: {x}px; top: {y}px" onclick={(e) => e.stopPropagation()}>
  {#if bulkCount <= 1}
    <button class="menu-item" onclick={() => handleAction(onRename)}>Rename</button>
    <button class="menu-item" onclick={() => handleAction(onDuplicate)}>Duplicate</button>
  {/if}
  <button class="menu-item" onclick={() => handleAction(onMoveTo)}>Move to...</button>
  {#if bulkCount > 1}
    <button class="menu-item" onclick={() => handleAction(onAddTag)}>Add Tag to All</button>
  {/if}
  <div class="separator"></div>
  <button class="menu-item danger" onclick={() => handleAction(onDelete)}>
    {bulkCount > 1 ? `Delete ${bulkCount} items` : "Delete"}
  </button>
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
  .separator {
    height: 1px;
    background: var(--border-primary);
    margin: var(--space-1) 0;
  }
</style>
