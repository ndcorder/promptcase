<script lang="ts">
  import {
    testingConfig,
  } from "../stores/testing";
  import {
    evalRunning,
    evalResults,
    evalError,
    evalSummary,
    runEval,
    initEvalListeners,
  } from "../stores/eval";
  import { activeFile } from "../stores/editor";
  import type { TestCase } from "../types";

  let running = $evalRunning;
  let results = $evalResults;
  let error = $evalError;
  let summary = $evalSummary;
  let file = $activeFile;
  let config = $testingConfig;

  let tests = $derived<TestCase[]>(file?.frontmatter?.tests ?? []);

  let expanded = $state<Set<string>>(new Set());

  function toggleExpand(name: string) {
    expanded = new Set(expanded);
    if (expanded.has(name)) {
      expanded.delete(name);
    } else {
      expanded.add(name);
    }
  }

  function getStatus(name: string): "pending" | "running" | "pass" | "fail" {
    const result = results.find((r) => r.name === name);
    if (result) return result.passed ? "pass" : "fail";
    if (running) {
      const completedCount = results.length;
      const idx = tests.findIndex((t) => t.name === name);
      if (idx === completedCount) return "running";
    }
    return "pending";
  }

  function totalDuration(): string {
    const ms = results.reduce((sum, r) => sum + r.durationMs, 0);
    return (ms / 1000).toFixed(1);
  }

  async function handleRunAll() {
    if (!file) return;
    await initEvalListeners();
    await runEval(
      file.path,
      config.provider,
      config.model,
      config.temperature,
      config.maxTokens,
    );
  }
</script>

<div class="eval-panel">
  <div class="eval-header">
    <span class="eval-title">Evaluation</span>
    <button
      class="btn btn-run-eval"
      onclick={handleRunAll}
      disabled={running || tests.length === 0}
    >
      {running ? "Running..." : "Run All"}
    </button>
  </div>

  {#if tests.length === 0}
    <div class="eval-empty">
      No test cases defined. Add a <code>tests</code> section to the frontmatter.
    </div>
  {:else}
    <div class="test-list">
      {#each tests as test (test.name)}
        {@const status = getStatus(test.name)}
        {@const result = results.find((r) => r.name === test.name)}
        <div class="test-item" class:expanded={expanded.has(test.name)}>
          <button class="test-row" onclick={() => toggleExpand(test.name)}>
            <span class="status-icon" class:pass={status === "pass"} class:fail={status === "fail"} class:running={status === "running"}>
              {#if status === "pass"}✓{:else if status === "fail"}✗{:else if status === "running"}⟳{:else}○{/if}
            </span>
            <span class="test-name">{test.name}</span>
            {#if result}
              <span class="test-duration">{(result.durationMs / 1000).toFixed(1)}s</span>
            {/if}
          </button>

          {#if expanded.has(test.name) && result}
            <div class="test-details">
              {#each result.assertionResults as ar}
                <div class="assertion-row" class:assertion-pass={ar.passed} class:assertion-fail={!ar.passed}>
                  <span class="assertion-icon">{ar.passed ? "✓" : "✗"}</span>
                  <span class="assertion-detail">{ar.detail}</span>
                </div>
              {/each}
              {#if result.responseText}
                <details class="response-details">
                  <summary>Response ({result.tokenCount} tokens)</summary>
                  <pre class="response-preview">{result.responseText}</pre>
                </details>
              {/if}
            </div>
          {/if}
        </div>
      {/each}
    </div>

    {#if summary}
      <div class="eval-summary" class:all-passed={summary.passed === summary.total}>
        {summary.passed}/{summary.total} passed ({totalDuration()}s)
      </div>
    {/if}

    {#if error}
      <div class="eval-error">{error}</div>
    {/if}
  {/if}
</div>

<style>
  .eval-panel {
    display: flex;
    flex-direction: column;
    gap: var(--space-2);
    padding: var(--space-2) 0;
  }
  .eval-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
  }
  .eval-title {
    font-size: var(--font-size-sm);
    font-weight: var(--font-weight-medium);
    color: var(--text-secondary);
  }
  .btn-run-eval {
    padding: var(--space-1) var(--space-3);
    border-radius: var(--radius-md);
    font-size: var(--font-size-xs);
    font-weight: var(--font-weight-medium);
    cursor: pointer;
    transition: all var(--transition-fast);
    border: none;
    background: var(--accent);
    color: white;
  }
  .btn-run-eval:hover:not(:disabled) {
    opacity: 0.9;
  }
  .btn-run-eval:disabled {
    opacity: 0.4;
    cursor: not-allowed;
  }
  .eval-empty {
    font-size: var(--font-size-sm);
    color: var(--text-tertiary);
    text-align: center;
    padding: var(--space-4);
  }
  .eval-empty code {
    background: var(--bg-tertiary);
    padding: 0 var(--space-1);
    border-radius: var(--radius-sm);
    font-family: var(--font-mono);
    font-size: var(--font-size-xs);
  }
  .test-list {
    display: flex;
    flex-direction: column;
    gap: var(--space-1);
  }
  .test-item {
    border: 1px solid var(--border-secondary);
    border-radius: var(--radius-md);
    overflow: hidden;
  }
  .test-row {
    display: flex;
    align-items: center;
    gap: var(--space-2);
    width: 100%;
    padding: var(--space-2);
    background: var(--bg-tertiary);
    border: none;
    cursor: pointer;
    text-align: left;
    color: var(--text-primary);
    font-size: var(--font-size-sm);
    transition: background var(--transition-fast);
  }
  .test-row:hover {
    background: var(--bg-quaternary);
  }
  .status-icon {
    flex-shrink: 0;
    width: 16px;
    text-align: center;
    font-weight: var(--font-weight-bold);
    color: var(--text-tertiary);
  }
  .status-icon.pass {
    color: var(--success, #27ae60);
  }
  .status-icon.fail {
    color: var(--error, #e74c3c);
  }
  .status-icon.running {
    color: var(--accent);
    animation: spin 1s linear infinite;
  }
  @keyframes spin {
    100% { transform: rotate(360deg); }
  }
  .test-name {
    flex: 1;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .test-duration {
    flex-shrink: 0;
    font-size: var(--font-size-xs);
    color: var(--text-tertiary);
    font-family: var(--font-mono);
  }
  .test-details {
    padding: var(--space-2);
    display: flex;
    flex-direction: column;
    gap: var(--space-1);
    border-top: 1px solid var(--border-secondary);
    background: var(--bg-secondary);
  }
  .assertion-row {
    display: flex;
    align-items: center;
    gap: var(--space-2);
    font-size: var(--font-size-xs);
    font-family: var(--font-mono);
  }
  .assertion-icon {
    flex-shrink: 0;
    width: 14px;
    text-align: center;
    font-weight: var(--font-weight-bold);
  }
  .assertion-pass .assertion-icon {
    color: var(--success, #27ae60);
  }
  .assertion-fail .assertion-icon {
    color: var(--error, #e74c3c);
  }
  .assertion-detail {
    color: var(--text-secondary);
  }
  .response-details {
    margin-top: var(--space-1);
    font-size: var(--font-size-xs);
  }
  .response-details summary {
    cursor: pointer;
    color: var(--text-tertiary);
    font-size: var(--font-size-xs);
  }
  .response-preview {
    font-size: var(--font-size-xs);
    font-family: var(--font-mono);
    color: var(--text-secondary);
    white-space: pre-wrap;
    word-break: break-word;
    margin: var(--space-1) 0 0;
    padding: var(--space-2);
    background: var(--bg-tertiary);
    border-radius: var(--radius-sm);
    max-height: 200px;
    overflow-y: auto;
    line-height: 1.4;
  }
  .eval-summary {
    padding: var(--space-2);
    font-size: var(--font-size-sm);
    font-family: var(--font-mono);
    font-weight: var(--font-weight-medium);
    color: var(--error, #e74c3c);
    text-align: center;
    border-radius: var(--radius-md);
    background: var(--bg-tertiary);
  }
  .eval-summary.all-passed {
    color: var(--success, #27ae60);
  }
  .eval-error {
    font-size: var(--font-size-sm);
    color: var(--error, #e74c3c);
    padding: var(--space-2);
  }
</style>
