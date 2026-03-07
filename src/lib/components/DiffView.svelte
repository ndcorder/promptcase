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
    font-family: monospace;
    font-size: 13px;
  }
  .empty {
    padding: 16px;
    color: #52525b;
    text-align: center;
    font-family: sans-serif;
  }
  .diff-content {
    padding: 8px 0;
  }
  .hunk-header {
    padding: 4px 12px;
    color: #a78bfa;
    background: #a78bfa10;
  }
  .diff-line {
    display: flex;
    padding: 0 12px;
    line-height: 1.6;
  }
  .diff-line.add {
    background: #22c55e10;
    color: #4ade80;
  }
  .diff-line.remove {
    background: #ef444410;
    color: #f87171;
  }
  .diff-line.context {
    color: #71717a;
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
