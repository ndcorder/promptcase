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
    return file.frontmatter.starred_versions.some(
      (s) => s.commit === commit.hash,
    );
  }

  function getStarLabel(commit: CommitEntry): string {
    const file = $activeFile;
    if (!file) return "";
    const star = file.frontmatter.starred_versions.find(
      (s) => s.commit === commit.hash,
    );
    return star?.label || "";
  }
</script>

<div class="history-panel">
  <h3>History</h3>
  {#if $fileHistory.length === 0}
    <p class="empty">No history yet.</p>
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
    padding: 12px;
    border-top: 1px solid #27272a;
  }
  h3 {
    margin: 0 0 12px;
    font-size: 12px;
    font-weight: 600;
    color: #71717a;
    text-transform: uppercase;
    letter-spacing: 0.5px;
  }
  .empty {
    color: #52525b;
    font-size: 12px;
    font-style: italic;
  }
  .history-list {
    display: flex;
    flex-direction: column;
    gap: 2px;
  }
  .history-entry {
    display: block;
    width: 100%;
    padding: 8px;
    background: none;
    border: none;
    border-radius: 4px;
    text-align: left;
    cursor: pointer;
    color: #d4d4d8;
    font-family: inherit;
  }
  .history-entry:hover {
    background: #27272a;
  }
  .history-entry.starred {
    border-left: 2px solid #f59e0b;
    padding-left: 6px;
  }
  .entry-header {
    display: flex;
    align-items: center;
    gap: 6px;
    margin-bottom: 2px;
  }
  .star {
    color: #f59e0b;
    font-size: 14px;
  }
  .date {
    font-size: 12px;
    color: #a1a1aa;
  }
  .hash {
    font-family: monospace;
    font-size: 11px;
    color: #52525b;
  }
  .message {
    font-size: 12px;
    color: #71717a;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .star-label {
    font-size: 11px;
    color: #f59e0b;
    margin-top: 2px;
    font-style: italic;
  }
</style>
