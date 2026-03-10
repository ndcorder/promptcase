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
    padding: var(--space-1) var(--space-3);
    border-bottom: 1px solid var(--border-primary);
    font-size: var(--font-size-sm);
    font-weight: var(--font-weight-semibold);
    color: var(--text-secondary);
  }
  .count {
    font-weight: var(--font-weight-regular);
    color: var(--text-tertiary);
  }
  .no-problems {
    padding: var(--space-3);
    color: var(--text-tertiary);
    font-size: var(--font-size-sm);
  }
  .problems-list {
    flex: 1;
    overflow-y: auto;
  }
  .problem {
    display: flex;
    align-items: center;
    gap: var(--space-2);
    padding: var(--space-1) var(--space-3);
    font-size: var(--font-size-sm);
    cursor: pointer;
    transition: background var(--transition-fast);
  }
  .problem:hover {
    background: rgba(255, 255, 255, 0.04);
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
    background: var(--color-error-subtle);
    color: var(--color-error);
  }
  .problem.warning .severity {
    background: var(--color-warning-subtle);
    color: var(--color-warning);
  }
  .message {
    flex: 1;
    color: var(--text-primary);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .location {
    color: var(--text-tertiary);
    font-family: var(--font-mono);
  }
  .rule {
    color: var(--text-quaternary);
    font-family: var(--font-mono);
    font-size: var(--font-size-xs);
  }
</style>
