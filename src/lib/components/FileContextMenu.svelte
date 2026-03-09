<script lang="ts">
  interface Props {
    x: number;
    y: number;
    onRename: () => void;
    onDuplicate: () => void;
    onDelete: () => void;
    onClose: () => void;
  }

  let { x, y, onRename, onDuplicate, onDelete, onClose }: Props = $props();

  function handleAction(fn: () => void) {
    fn();
    onClose();
  }
</script>

<svelte:window onclick={onClose} />

<div class="context-menu" style="left: {x}px; top: {y}px" onclick={(e) => e.stopPropagation()}>
  <button class="menu-item" onclick={() => handleAction(onRename)}>Rename</button>
  <button class="menu-item" onclick={() => handleAction(onDuplicate)}>Duplicate</button>
  <div class="separator"></div>
  <button class="menu-item danger" onclick={() => handleAction(onDelete)}>Delete</button>
</div>

<style>
  .context-menu {
    position: fixed;
    z-index: 200;
    min-width: 160px;
    background: #27272a;
    border: 1px solid #3f3f46;
    border-radius: 6px;
    padding: 4px 0;
    box-shadow: 0 8px 24px #00000060;
  }
  .menu-item {
    display: block;
    width: 100%;
    padding: 6px 12px;
    background: none;
    border: none;
    color: #d4d4d8;
    font-size: 13px;
    text-align: left;
    cursor: pointer;
    font-family: inherit;
  }
  .menu-item:hover {
    background: #3f3f46;
  }
  .menu-item.danger {
    color: #f87171;
  }
  .menu-item.danger:hover {
    background: #f8717115;
  }
  .separator {
    height: 1px;
    background: #3f3f46;
    margin: 4px 0;
  }
</style>
