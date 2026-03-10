<script lang="ts">
  interface Props {
    visible: boolean;
    title: string;
    placeholder?: string;
    defaultValue?: string;
    onConfirm: (value: string) => void;
    onCancel: () => void;
  }

  let { visible, title, placeholder = "", defaultValue = "", onConfirm, onCancel }: Props = $props();
  let value = $state("");
  let inputEl: HTMLInputElement;

  function handleKeydown(e: KeyboardEvent) {
    if (e.key === "Escape") {
      onCancel();
    } else if (e.key === "Enter") {
      e.preventDefault();
      if (value.trim()) {
        onConfirm(value.trim());
      }
    }
  }

  $effect(() => {
    if (visible && inputEl) {
      value = defaultValue;
      requestAnimationFrame(() => {
        inputEl.focus();
        inputEl.select();
      });
    }
  });
</script>

{#if visible}
  <div class="overlay" onclick={onCancel} onkeydown={handleKeydown} role="dialog" aria-modal="true" aria-label={title} tabindex="-1">
    <div class="dialog" onclick={(e) => e.stopPropagation()}>
      <h3>{title}</h3>
      <input
        bind:this={inputEl}
        type="text"
        {placeholder}
        bind:value={value}
        onkeydown={handleKeydown}
      />
      <div class="actions">
        <button class="btn cancel" onclick={onCancel}>Cancel</button>
        <button class="btn confirm" onclick={() => value.trim() && onConfirm(value.trim())} disabled={!value.trim()}>Create</button>
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
    margin: 0 0 var(--space-3);
    font-size: var(--font-size-lg);
    font-weight: var(--font-weight-semibold);
    color: var(--text-primary);
  }
  input {
    width: 100%;
    padding: var(--space-2) var(--space-3);
    background: var(--bg-primary);
    border: 1px solid var(--border-primary);
    border-radius: var(--radius-md);
    color: var(--text-primary);
    font-size: var(--font-size-md);
    box-sizing: border-box;
  }
  input:focus {
    border-color: var(--accent);
    box-shadow: 0 0 0 1px var(--border-focus);
  }
  .actions {
    display: flex;
    justify-content: flex-end;
    gap: var(--space-2);
    margin-top: var(--space-4);
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
    background: var(--accent);
    color: white;
  }
  .confirm:hover {
    background: var(--accent-hover);
  }
  .confirm:disabled {
    opacity: 0.4;
    cursor: default;
  }
</style>
