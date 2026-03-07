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
        {$activeFile.frontmatter.type === "fragment" ? "Fragment" : "Prompt"}
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
    padding: 0 12px;
    background: #27272a;
    border-top: 1px solid #3f3f46;
    font-size: 12px;
    color: #a1a1aa;
  }
  .left, .right {
    display: flex;
    align-items: center;
    gap: 12px;
  }
  .status-item {
    display: flex;
    align-items: center;
    gap: 4px;
  }
  .tokens {
    font-family: monospace;
    font-size: 11px;
    color: #71717a;
  }
</style>
