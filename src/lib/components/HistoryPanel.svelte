<script lang="ts">
  import { fileHistory, activeFile } from "../stores/editor";
  import {
    openCompare,
    compareSelectionMode,
    selectedCommits,
    toggleCommitSelection,
  } from "../stores/compare";
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

  function isSelected(hash: string): boolean {
    return $selectedCommits.includes(hash);
  }

  function handleDiff(commit: CommitEntry) {
    openCompare(commit.hash, commit.hash.slice(0, 7));
  }

  function toggleSelectionMode() {
    compareSelectionMode.update((v) => !v);
    if (!$compareSelectionMode) {
      selectedCommits.set([]);
    }
  }
</script>

<div class="history-panel">
  <div class="history-header">
    <h3>History</h3>
    {#if $fileHistory.length >= 2}
      <button
        class="compare-toggle"
        class:active={$compareSelectionMode}
        onclick={toggleSelectionMode}
        title="Select two versions to compare"
      >
        A/B
      </button>
    {/if}
  </div>
  {#if $fileHistory.length === 0}
    <div class="empty-state">
      <span class="icon">&#128337;</span>
      <span class="message">Save to start tracking versions</span>
    </div>
  {:else}
    {#if $compareSelectionMode}
      <div class="selection-hint">Select two commits to compare</div>
    {/if}
    <div class="history-list">
      {#each $fileHistory as commit}
        <button
          class="history-entry"
          class:starred={isStarred(commit)}
          class:selected={$compareSelectionMode && isSelected(commit.hash)}
          onclick={() => $compareSelectionMode && toggleCommitSelection(commit.hash)}
        >
          <div class="entry-header">
            {#if $compareSelectionMode}
              <span class="select-indicator" class:checked={isSelected(commit.hash)}>
                {isSelected(commit.hash) ? "\u25C9" : "\u25CB"}
              </span>
            {/if}
            {#if isStarred(commit)}
              <span class="star">*</span>
            {/if}
            <span class="date">{formatDate(commit.date)}</span>
            <span class="hash">{commit.hash.slice(0, 7)}</span>
            {#if !$compareSelectionMode}
              <button
                class="diff-btn"
                onclick={(e) => { e.stopPropagation(); handleDiff(commit); }}
                title="Compare with current"
              >
                Diff
              </button>
            {/if}
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
  .history-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    margin-bottom: var(--space-3);
  }
  h3 {
    margin: 0;
    font-size: var(--font-size-xs);
    font-weight: var(--font-weight-semibold);
    color: var(--text-tertiary);
    text-transform: uppercase;
    letter-spacing: 0.05em;
  }
  .compare-toggle {
    font-size: var(--font-size-xs);
    font-family: var(--font-mono);
    padding: 2px 6px;
    border-radius: var(--radius-sm);
    color: var(--text-tertiary);
    background: var(--bg-tertiary);
    border: 1px solid var(--border-primary);
    transition: background var(--transition-fast), color var(--transition-fast);
  }
  .compare-toggle:hover {
    background: rgba(255, 255, 255, 0.08);
    color: var(--text-secondary);
  }
  .compare-toggle.active {
    background: var(--accent);
    color: #fff;
    border-color: var(--accent);
  }
  .selection-hint {
    font-size: var(--font-size-xs);
    color: var(--text-tertiary);
    padding: var(--space-1) 0 var(--space-2);
    font-style: italic;
  }
  .history-entry.selected {
    background: rgba(10, 132, 255, 0.12);
    border-left: 2px solid var(--accent);
  }
  .select-indicator {
    font-size: var(--font-size-sm);
    color: var(--text-tertiary);
  }
  .select-indicator.checked {
    color: var(--accent);
  }
  .diff-btn {
    margin-left: auto;
    font-size: var(--font-size-xs);
    padding: 1px 6px;
    border-radius: var(--radius-sm);
    color: var(--text-tertiary);
    background: transparent;
    border: 1px solid var(--border-primary);
    opacity: 0;
    transition: opacity var(--transition-fast), background var(--transition-fast);
  }
  .history-entry:hover .diff-btn {
    opacity: 1;
  }
  .diff-btn:hover {
    background: rgba(255, 255, 255, 0.08);
    color: var(--text-secondary);
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
