<script lang="ts">
  import { api } from "../ipc";
  import { loadFiles } from "../stores/files";

  interface Props {
    visible: boolean;
    onClose: () => void;
  }

  let { visible, onClose }: Props = $props();
  let title = $state("");
  let text = $state("");
  let destination = $state("");
  let importing = $state(false);
  let titleEl: HTMLInputElement;

  let canImport = $derived(title.trim() !== "" && text.trim() !== "");

  function handleKeydown(e: KeyboardEvent) {
    if (e.key === "Escape") {
      onClose();
    } else if (e.key === "Enter" && (e.metaKey || e.ctrlKey) && canImport) {
      e.preventDefault();
      doImport();
    }
  }

  async function doImport() {
    if (!canImport || importing) return;
    importing = true;
    try {
      await api.importFromText(title.trim(), text.trim(), destination.trim());
      await loadFiles();
      onClose();
    } catch (err) {
      console.error("Import from text failed:", err);
    } finally {
      importing = false;
    }
  }

  $effect(() => {
    if (visible && titleEl) {
      title = "";
      text = "";
      destination = "";
      requestAnimationFrame(() => titleEl.focus());
    }
  });
</script>

{#if visible}
  <div class="overlay" onclick={(e) => { if (e.target === e.currentTarget) onClose(); }} onkeydown={handleKeydown} role="dialog" aria-modal="true" aria-label="Import from Text" tabindex="-1">
    <div class="dialog">
      <h3>Import from Text</h3>
      <label class="field-label" for="import-title">Title</label>
      <input
        bind:this={titleEl}
        id="import-title"
        type="text"
        placeholder="Prompt title"
        bind:value={title}
        onkeydown={handleKeydown}
      />
      <label class="field-label" for="import-text">Content</label>
      <textarea
        id="import-text"
        placeholder="Paste prompt content here..."
        bind:value={text}
        rows="10"
      ></textarea>
      <label class="field-label" for="import-dest">Destination folder</label>
      <input
        id="import-dest"
        type="text"
        placeholder="Leave empty for root"
        bind:value={destination}
      />
      <div class="actions">
        <button class="btn cancel" onclick={onClose}>Cancel</button>
        <button class="btn confirm" onclick={doImport} disabled={!canImport || importing}>
          {importing ? "Importing..." : "Import"}
        </button>
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
    width: 480px;
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
  .field-label {
    display: block;
    margin-bottom: var(--space-1);
    font-size: var(--font-size-sm);
    color: var(--text-secondary);
  }
  input, textarea {
    width: 100%;
    padding: var(--space-2) var(--space-3);
    background: var(--bg-primary);
    border: 1px solid var(--border-primary);
    border-radius: var(--radius-md);
    color: var(--text-primary);
    font-size: var(--font-size-md);
    font-family: inherit;
    box-sizing: border-box;
    margin-bottom: var(--space-3);
  }
  textarea {
    resize: vertical;
    min-height: 120px;
  }
  input:focus, textarea:focus {
    border-color: var(--accent);
    box-shadow: 0 0 0 1px var(--border-focus);
    outline: none;
  }
  .actions {
    display: flex;
    justify-content: flex-end;
    gap: var(--space-2);
    margin-top: var(--space-1);
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