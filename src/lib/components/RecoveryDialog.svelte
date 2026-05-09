<script lang="ts">
  import type { RecoveryBuffer } from "../types";

  interface Props {
    buffers: RecoveryBuffer[];
    onRestore: () => void;
    onDiscard: () => void;
  }

  let { buffers, onRestore, onDiscard }: Props = $props();

  function formatTimestamp(ts: string): string {
    try {
      return new Date(ts).toLocaleString();
    } catch {
      return ts;
    }
  }

  function fileName(path: string): string {
    return path.split("/").pop() || path;
  }

  function handleKeydown(e: KeyboardEvent) {
    if (e.key === "Escape") onDiscard();
  }
</script>

<div class="overlay" onclick={(e) => { if (e.target === e.currentTarget) onDiscard(); }} onkeydown={handleKeydown} role="dialog" aria-modal="true" aria-label="Recover unsaved changes" tabindex="-1">
  <div class="dialog">
    <h3>Recover unsaved changes</h3>
    <p>The app closed with unsaved changes in {buffers.length} {buffers.length === 1 ? "file" : "files"}.</p>
    <ul class="buffer-list">
      {#each buffers as buf}
        <li class="buffer-item">
          <span class="buffer-path">{fileName(buf.path)}</span>
          <span class="buffer-time">{formatTimestamp(buf.timestamp)}</span>
        </li>
      {/each}
    </ul>
    <div class="actions">
      <button class="btn discard" onclick={onDiscard}>Discard</button>
      <button class="btn restore" onclick={onRestore}>Restore All</button>
    </div>
  </div>
</div>

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
    width: 440px;
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
    margin: 0 0 var(--space-3);
    font-size: var(--font-size-md);
    color: var(--text-secondary);
  }
  .buffer-list {
    list-style: none;
    margin: 0 0 var(--space-4);
    padding: 0;
    max-height: 200px;
    overflow-y: auto;
  }
  .buffer-item {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: var(--space-2) var(--space-3);
    border-radius: var(--radius-sm);
    background: var(--bg-primary);
    margin-bottom: var(--space-1);
  }
  .buffer-path {
    font-family: var(--font-mono);
    font-size: var(--font-size-sm);
    color: var(--text-primary);
  }
  .buffer-time {
    font-size: var(--font-size-xs, 11px);
    color: var(--text-tertiary);
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
  .discard {
    background: rgba(255, 255, 255, 0.08);
    color: var(--text-secondary);
  }
  .discard:hover {
    background: rgba(255, 255, 255, 0.12);
    color: var(--text-primary);
  }
  .restore {
    background: var(--accent);
    color: white;
  }
  .restore:hover {
    background: var(--accent-hover);
  }
</style>
