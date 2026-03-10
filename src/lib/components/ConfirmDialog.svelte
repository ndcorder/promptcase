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
  <div class="overlay" onclick={(e) => { if (e.target === e.currentTarget) onCancel(); }} onkeydown={handleKeydown} role="dialog" aria-modal="true" aria-label={title} tabindex="-1">
    <div class="dialog">
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
    background: rgba(0, 0, 0, 0.4);
    backdrop-filter: blur(4px);
    -webkit-backdrop-filter: blur(4px);
    display: flex;
    justify-content: center;
    padding-top: 15vh;
    z-index: 100;
  }
  .dialog {
    width: 400px;
    background: var(--bg-tertiary);
    border: 1px solid var(--border-primary);
    border-radius: var(--radius-lg);
    padding: var(--space-5);
    box-shadow: var(--shadow-xl);
    align-self: flex-start;
  }
  h3 {
    margin: 0 0 var(--space-2);
    font-size: var(--font-size-lg);
    font-weight: var(--font-weight-semibold);
    color: var(--text-primary);
  }
  p {
    margin: 0 0 var(--space-4);
    font-size: var(--font-size-md);
    color: var(--text-secondary);
  }
  .actions {
    display: flex;
    justify-content: flex-end;
    gap: var(--space-2);
  }
  .btn {
    padding: var(--space-1) var(--space-4);
    border-radius: var(--radius-md);
    font-size: var(--font-size-base);
    font-weight: var(--font-weight-medium);
    transition: all var(--transition-base);
  }
  .cancel {
    background: rgba(255, 255, 255, 0.08);
    color: var(--text-secondary);
  }
  .cancel:hover {
    background: rgba(255, 255, 255, 0.12);
    color: var(--text-primary);
  }
  .confirm {
    background: var(--color-error);
    color: white;
  }
  .confirm:hover {
    background: #ff6961;
  }
</style>
