<script lang="ts">
  interface Props {
    visible: boolean;
    title: string;
    message: string;
    confirmLabel?: string;
    cancelLabel?: string;
    onConfirm: () => void;
    onCancel: () => void;
  }

  let { visible, title, message, confirmLabel = "Confirm", cancelLabel = "Cancel", onConfirm, onCancel }: Props = $props();
  let confirmBtn: HTMLButtonElement;

  function handleKeydown(e: KeyboardEvent) {
    if (e.key === "Escape") {
      onCancel();
    } else if (e.key === "Enter") {
      e.preventDefault();
      onConfirm();
    }
  }

  $effect(() => {
    if (visible && confirmBtn) {
      requestAnimationFrame(() => confirmBtn.focus());
    }
  });
</script>

{#if visible}
  <div class="overlay" onclick={onCancel} onkeydown={handleKeydown} role="dialog" aria-modal="true" aria-label={title} tabindex="-1">
    <div class="dialog" onclick={(e) => e.stopPropagation()}>
      <h3>{title}</h3>
      <p>{message}</p>
      <div class="actions">
        <button class="btn cancel" onclick={onCancel}>{cancelLabel}</button>
        <button class="btn confirm" bind:this={confirmBtn} onclick={onConfirm}>{confirmLabel}</button>
      </div>
    </div>
  </div>
{/if}

<style>
  .overlay {
    position: fixed;
    top: 0;
    left: 0;
    right: 0;
    bottom: 0;
    background: #00000060;
    display: flex;
    justify-content: center;
    padding-top: 15vh;
    z-index: 100;
  }
  .dialog {
    width: 400px;
    background: #27272a;
    border: 1px solid #3f3f46;
    border-radius: 8px;
    padding: 20px;
    box-shadow: 0 20px 60px #00000060;
    align-self: flex-start;
  }
  h3 {
    margin: 0 0 8px;
    font-size: 15px;
    font-weight: 600;
    color: #e4e4e7;
  }
  p {
    margin: 0 0 16px;
    font-size: 14px;
    color: #a1a1aa;
  }
  .actions {
    display: flex;
    justify-content: flex-end;
    gap: 8px;
  }
  .btn {
    padding: 6px 16px;
    border-radius: 6px;
    font-size: 13px;
    font-weight: 500;
    cursor: pointer;
    font-family: inherit;
    border: none;
  }
  .cancel {
    background: #3f3f46;
    color: #a1a1aa;
  }
  .cancel:hover {
    background: #52525b;
  }
  .confirm {
    background: #ef4444;
    color: white;
  }
  .confirm:hover {
    background: #dc2626;
  }
</style>
