<script lang="ts">
  import { lintResults } from "../stores/editor";

  function severityIcon(severity: string): string {
    switch (severity) {
      case "error": return "E";
      case "warning": return "W";
      case "info": return "I";
      default: return "?";
    }
  }
</script>

<div class="problems-panel">
  <div class="problems-header">
    <span>Problems</span>
    <span class="count">
      {$lintResults.filter((r) => r.severity === "error").length} errors,
      {$lintResults.filter((r) => r.severity === "warning").length} warnings
    </span>
  </div>
  {#if $lintResults.length === 0}
    <div class="no-problems">No problems detected.</div>
  {:else}
    <div class="problems-list">
      {#each $lintResults as result}
        <div class="problem" class:error={result.severity === "error"} class:warning={result.severity === "warning"}>
          <span class="severity">{severityIcon(result.severity)}</span>
          <span class="message">{result.message}</span>
          {#if result.line}
            <span class="location">:{result.line}</span>
          {/if}
          <span class="rule">{result.rule}</span>
        </div>
      {/each}
    </div>
  {/if}
</div>

<style>
  .problems-panel {
    height: 100%;
    display: flex;
    flex-direction: column;
  }
  .problems-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 6px 12px;
    border-bottom: 1px solid #27272a;
    font-size: 12px;
    font-weight: 600;
    color: #a1a1aa;
  }
  .count {
    font-weight: 400;
    color: #71717a;
  }
  .no-problems {
    padding: 12px;
    color: #52525b;
    font-size: 12px;
  }
  .problems-list {
    flex: 1;
    overflow-y: auto;
  }
  .problem {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 4px 12px;
    font-size: 12px;
    cursor: pointer;
  }
  .problem:hover {
    background: #27272a;
  }
  .severity {
    width: 16px;
    height: 16px;
    display: flex;
    align-items: center;
    justify-content: center;
    border-radius: 50%;
    font-size: 10px;
    font-weight: 700;
  }
  .problem.error .severity {
    background: #ef444430;
    color: #ef4444;
  }
  .problem.warning .severity {
    background: #f59e0b30;
    color: #f59e0b;
  }
  .message {
    flex: 1;
    color: #d4d4d8;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .location {
    color: #71717a;
    font-family: monospace;
  }
  .rule {
    color: #52525b;
    font-family: monospace;
    font-size: 11px;
  }
</style>
