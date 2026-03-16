<script lang="ts">
  import { fileHistory, activeFile } from "../stores/editor";
  import type { CommitEntry } from "../types";

  function formatDate(dateStr: string): string {
    const date = new Date(dateStr);
    return date.toLocaleDateString(undefined, {
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  }

  function isStarred(commit: CommitEntry): boolean {
    const file = $activeFile;
    if (!file) return false;
    return file.frontmatter.starredVersions.some(
      (s) => s.commit === commit.hash,
    );
  }

  function getStarLabel(commit: CommitEntry): string {
    const file = $activeFile;
    if (!file) return "";
    const star = file.frontmatter.starredVersions.find(
      (s) => s.commit === commit.hash,
    );
    return star?.label || "";
  }
</script>

<div class="history-panel">
  <h3>History</h3>
  {#if $fileHistory.length === 0}
    <div class="empty-state">
      <span class="icon">&#128337;</span>
      <span class="message">Save to start tracking versions</span>
    </div>
  {:else}
    <div class="history-list">
      {#each $fileHistory as commit}
        <button class="history-entry" class:starred={isStarred(commit)}>
          <div class="entry-header">
            {#if isStarred(commit)}
              <span class="star">*</span>
            {/if}
            <span class="date">{formatDate(commit.date)}</span>
            <span class="hash">{commit.hash.slice(0, 7)}</span>
          </div>
          <div class="message">{commit.message}</div>
          {#if isStarred(commit) && getStarLabel(commit)}
            <div class="star-label">{getStarLabel(commit)}</div>
          {/if}
        </button>
      {/each}
    </div>
  {/if}
</div>

<style>
  .history-panel {
    padding: var(--space-3);
    border-top: 1px solid var(--border-primary);
  }
  h3 {
    margin: 0 0 var(--space-3);
    font-size: var(--font-size-xs);
    font-weight: var(--font-weight-semibold);
    color: var(--text-tertiary);
    text-transform: uppercase;
    letter-spacing: 0.05em;
  }
  .empty-state {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: var(--space-2);
    padding: var(--space-6) var(--space-3);
    text-align: center;
  }
  .empty-state .icon {
    font-size: 24px;
    opacity: 0.4;
  }
  .empty-state .message {
    font-size: var(--font-size-sm);
    color: var(--text-tertiary);
    font-style: italic;
  }
  .history-list {
    display: flex;
    flex-direction: column;
    gap: var(--space-1);
  }
  .history-entry {
    display: block;
    width: 100%;
    padding: var(--space-2);
    border-radius: var(--radius-sm);
    text-align: left;
    color: var(--text-primary);
    transition: background var(--transition-fast);
  }
  .history-entry:hover {
    background: rgba(255, 255, 255, 0.04);
  }
  .history-entry:active {
    background: rgba(255, 255, 255, 0.02);
  }
  .history-entry.starred {
    border-left: 2px solid var(--color-warning);
    padding-left: var(--space-2);
  }
  .entry-header {
    display: flex;
    align-items: center;
    gap: var(--space-1);
    margin-bottom: var(--space-1);
  }
  .star {
    color: var(--color-warning);
    font-size: var(--font-size-md);
  }
  .date {
    font-size: var(--font-size-sm);
    color: var(--text-secondary);
  }
  .hash {
    font-family: var(--font-mono);
    font-size: var(--font-size-xs);
    color: var(--text-quaternary);
  }
  .message {
    font-size: var(--font-size-sm);
    color: var(--text-tertiary);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .star-label {
    font-size: var(--font-size-xs);
    color: var(--color-warning);
    margin-top: var(--space-1);
    font-style: italic;
  }
</style>
