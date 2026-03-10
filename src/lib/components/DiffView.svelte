<script lang="ts">
  import type { DiffResult } from "../types";

  interface Props {
    diff: DiffResult | null;
  }

  let { diff }: Props = $props();
</script>

<div class="diff-view">
  {#if !diff}
    <div class="empty">Select two versions to compare.</div>
  {:else if diff.hunks.length === 0}
    <div class="empty">No differences.</div>
  {:else}
    <div class="diff-content">
      {#each diff.hunks as hunk}
        <div class="hunk-header">
          @@ -{hunk.oldStart},{hunk.oldLines} +{hunk.newStart},{hunk.newLines} @@
        </div>
        {#each hunk.lines as line}
          <div
            class="diff-line"
            class:add={line.type === "add"}
            class:remove={line.type === "remove"}
            class:context={line.type === "context"}
          >
            <span class="diff-marker">
              {line.type === "add" ? "+" : line.type === "remove" ? "-" : " "}
            </span>
            <span class="diff-text">{line.content}</span>
          </div>
        {/each}
      {/each}
    </div>
  {/if}
</div>

<style>
  .diff-view {
    height: 100%;
    overflow: auto;
    font-family: var(--font-mono);
    font-size: var(--font-size-base);
  }
  .empty {
    padding: var(--space-4);
    color: var(--text-tertiary);
    text-align: center;
    font-family: var(--font-sans);
  }
  .diff-content {
    padding: var(--space-2) 0;
  }
  .hunk-header {
    padding: var(--space-1) var(--space-3);
    color: var(--color-include);
    background: var(--color-include-subtle);
  }
  .diff-line {
    display: flex;
    padding: 0 var(--space-3);
    line-height: 1.6;
  }
  .diff-line.add {
    background: var(--color-success-subtle);
    color: var(--color-success);
  }
  .diff-line.remove {
    background: var(--color-error-subtle);
    color: var(--color-error);
  }
  .diff-line.context {
    color: var(--text-tertiary);
  }
  .diff-marker {
    width: 16px;
    flex-shrink: 0;
    user-select: none;
  }
  .diff-text {
    white-space: pre-wrap;
  }
</style>
