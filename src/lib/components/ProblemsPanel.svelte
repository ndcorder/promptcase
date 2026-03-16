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
    <div class="no-problems">
      <span class="check-icon">&#10003;</span>
      <span>No issues</span>
    </div>
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
    display: flex;
    align-items: center;
    justify-content: center;
    gap: var(--space-2);
    padding: var(--space-4);
    color: var(--color-success);
    font-size: var(--font-size-sm);
    flex: 1;
  }
  .check-icon {
    font-size: var(--font-size-lg);
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
  .problem:active {
    background: rgba(255, 255, 255, 0.02);
  }
  .severity {
    width: 16px;
    height: 16px;
    display: flex;
    align-items: center;
    justify-content: center;
    border-radius: 50%;
    font-size: var(--font-size-xs);
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
