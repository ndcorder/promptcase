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
      // Tick delay so the input is mounted
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
    margin: 0 0 12px;
    font-size: 15px;
    font-weight: 600;
    color: #e4e4e7;
  }
  input {
    width: 100%;
    padding: 8px 12px;
    background: #18181b;
    border: 1px solid #3f3f46;
    border-radius: 6px;
    color: #d4d4d8;
    font-size: 14px;
    outline: none;
    font-family: inherit;
    box-sizing: border-box;
  }
  input:focus {
    border-color: #a78bfa;
  }
  input::placeholder {
    color: #52525b;
  }
  .actions {
    display: flex;
    justify-content: flex-end;
    gap: 8px;
    margin-top: 16px;
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
    background: #a78bfa;
    color: #09090b;
  }
  .confirm:hover {
    background: #8b5cf6;
  }
  .confirm:disabled {
    opacity: 0.5;
    cursor: default;
  }
</style>
