<script lang="ts">
  import { tokenCounts, lintResults, activeFile } from "../stores/editor";
  import { currentTheme, setTheme } from "../stores/theme";
  import { api } from "../ipc";
  import { onMount } from "svelte";

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

  let gitClean = $state<boolean | null>(null);

  onMount(() => {
    checkGitStatus();
    const interval = setInterval(checkGitStatus, 10000);
    return () => clearInterval(interval);
  });

  async function checkGitStatus() {
    try {
      const status = await api.gitStatus();
      gitClean = status.clean;
    } catch {
      gitClean = null;
    }
  }

  function toggleTheme() {
    setTheme($currentTheme === "dark" ? "light" : "dark");
  }

  let fileType = $derived($activeFile?.frontmatter.type ?? null);
</script>

<footer class="status-bar">
  <div class="left">
    {#if $activeFile}
      <span class="status-item file-type">
        {fileType === "fragment" ? "Fragment" : "Prompt"}
      </span>
      {#if errorCount > 0}
        <span class="status-item errors">
          <span class="dot dot-error"></span>
          {errorCount}
        </span>
      {/if}
      {#if warnCount > 0}
        <span class="status-item warnings">
          <span class="dot dot-warning"></span>
          {warnCount}
        </span>
      {/if}
      {#if errorCount === 0 && warnCount === 0}
        <span class="status-item no-issues">
          <span class="dot dot-success"></span>
          0
        </span>
      {/if}
    {/if}
    {#if gitClean !== null}
      <span class="status-item git-status" title={gitClean ? "Git: clean" : "Git: uncommitted changes"}>
        <span class="dot" class:dot-success={gitClean} class:dot-warning={!gitClean}></span>
        {gitClean ? "Clean" : "Dirty"}
      </span>
    {/if}
  </div>
  <div class="right">
    {#each Object.entries($tokenCounts) as [model, count]}
      <span class="status-item tokens">{formatTokenCount(model, count)}</span>
    {/each}
    <button class="theme-toggle" onclick={toggleTheme} title="Toggle theme">
      {$currentTheme === "dark" ? "\u{1F319}" : "\u{2600}\u{FE0F}"}
    </button>
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
    font-family: var(--font-mono);
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
  .file-type {
    font-family: var(--font-sans);
    font-weight: var(--font-weight-medium);
  }
  .dot {
    width: 6px;
    height: 6px;
    border-radius: 50%;
    flex-shrink: 0;
  }
  .dot-error {
    background: var(--color-error);
  }
  .dot-warning {
    background: var(--color-warning);
  }
  .dot-success {
    background: var(--color-success);
  }
  .errors {
    color: var(--color-error);
  }
  .warnings {
    color: var(--color-warning);
  }
  .no-issues {
    color: var(--text-tertiary);
  }
  .git-status {
    color: var(--text-tertiary);
  }
  .tokens {
    color: var(--text-tertiary);
  }
  .theme-toggle {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 20px;
    height: 20px;
    font-size: 12px;
    border-radius: var(--radius-sm);
    color: var(--text-secondary);
    transition: background var(--transition-fast);
    cursor: pointer;
    line-height: 1;
  }
  .theme-toggle:hover {
    background: rgba(255, 255, 255, 0.08);
  }
  .theme-toggle:active {
    background: rgba(255, 255, 255, 0.04);
  }
</style>
