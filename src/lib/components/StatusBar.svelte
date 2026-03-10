<script lang="ts">
  import { tokenCounts, lintResults, activeFile } from "../stores/editor";

  function formatTokenCount(model: string, count: number): string {
    const approx = model.includes("claude") || model.includes("sonnet") || model.includes("opus") || model.includes("haiku");
    const prefix = approx ? "~" : "";
    return `${prefix}${count.toLocaleString()} tok (${shortModelName(model)})`;
  }

  function shortModelName(model: string): string {
    return model.replace("claude-", "").replace("gpt-", "");
  }

  let errorCount = $derived($lintResults.filter((r) => r.severity === "error").length);
  let warnCount = $derived($lintResults.filter((r) => r.severity === "warning").length);
</script>

<footer class="status-bar">
  <div class="left">
    {#if $activeFile}
      <span class="status-item">
        Prompt
      </span>
      <span class="status-item problems">
        {errorCount} errors, {warnCount} warnings
      </span>
    {/if}
  </div>
  <div class="right">
    {#each Object.entries($tokenCounts) as [model, count]}
      <span class="status-item tokens">{formatTokenCount(model, count)}</span>
    {/each}
  </div>
</footer>

<style>
  .status-bar {
    display: flex;
    align-items: center;
    justify-content: space-between;
    height: 24px;
    padding: 0 var(--space-3);
    background: var(--bg-tertiary);
    border-top: 1px solid var(--border-primary);
    font-size: var(--font-size-xs);
    color: var(--text-secondary);
  }
  .left, .right {
    display: flex;
    align-items: center;
    gap: var(--space-3);
  }
  .status-item {
    display: flex;
    align-items: center;
    gap: var(--space-1);
  }
  .tokens {
    font-family: var(--font-mono);
    font-size: var(--font-size-xs);
    color: var(--text-tertiary);
  }
</style>
