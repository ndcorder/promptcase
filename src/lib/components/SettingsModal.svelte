<script lang="ts">
  import { onMount } from "svelte";
  import type { RepoConfig, RepoStatus } from "../types";
  import { api } from "../ipc";
  import { setTheme, currentTheme } from "$lib/stores/theme";
  import { getAllShortcuts } from "$lib/stores/keybindings";
  import { editorConfig } from "$lib/stores/editor";
  import { sidebarPosition } from "$lib/stores/layout";

  interface Props {
    onclose: () => void;
  }

  let { onclose }: Props = $props();

  let activeTab = $state<"general" | "editor" | "appearance">("general");
  let config = $state<RepoConfig | null>(null);
  let repoPath = $state<string>("");

  onMount(async () => {
    try {
      config = await api.getConfig();
    } catch (err) {
      console.warn("Failed to load config:", err);
    }
    try {
      const status: RepoStatus = await api.gitStatus();
      repoPath = status.repoPath;
    } catch {
      repoPath = "Unknown";
    }
  });

  async function updateField(field: string, value: unknown) {
    if (!config) return;
    (config as unknown as Record<string, unknown>)[field] = value;
    try {
      await api.updateConfig({ [field]: value } as Partial<RepoConfig>);
    } catch (err) {
      console.warn("Failed to update config:", err);
    }
  }

  async function updateEditorField(field: string, value: unknown) {
    await updateField(field, value);
    editorConfig.update((c) => ({ ...c, [field]: value }));
  }

  function handleBackdropKeydown(e: KeyboardEvent) {
    if (e.key === "Escape") {
      e.stopPropagation();
      e.preventDefault();
      onclose();
    }
  }

  function formatActionName(action: string): string {
    return action
      .replace(/([A-Z])/g, " $1")
      .replace(/^./, (s) => s.toUpperCase())
      .replace(/(\d)/g, " $1")
      .trim();
  }

  function formatShortcut(shortcut: string): string {
    return shortcut
      .replace(/Cmd/g, "\u2318")
      .replace(/Shift/g, "\u21E7")
      .replace(/Alt/g, "\u2325")
      .replace(/Ctrl/g, "\u2303")
      .replace(/\+/g, "");
  }

  const tabs: Array<{ id: "general" | "editor" | "appearance"; label: string }> = [
    { id: "general", label: "General" },
    { id: "editor", label: "Editor" },
    { id: "appearance", label: "Appearance" },
  ];
</script>

<div
  class="overlay"
  role="dialog"
  aria-modal="true"
  aria-label="Settings"
  tabindex="-1"
  onkeydown={handleBackdropKeydown}
  onclick={(e) => { if (e.target === e.currentTarget) onclose(); }}
>
  <div class="panel">
    <header class="panel-header">
      <h2 class="panel-title">Settings</h2>
      <button class="close-btn" onclick={onclose} aria-label="Close settings">
        <svg width="12" height="12" viewBox="0 0 12 12">
          <path d="M1 1l10 10M11 1L1 11" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>
        </svg>
      </button>
    </header>

    <nav class="tabs">
      {#each tabs as tab}
        <button
          class="tab"
          class:active={activeTab === tab.id}
          onclick={() => (activeTab = tab.id)}
        >
          {tab.label}
        </button>
      {/each}
    </nav>

    <div class="tab-content">
      {#if !config}
        <div class="loading">Loading settings...</div>
      {:else}
        {#if activeTab === "general"}
          <div class="setting-row">
            <div class="setting-label">
              <span class="label-text">Repository path</span>
              <span class="label-hint">Location of your prompt repository</span>
            </div>
            <div class="setting-control">
              <span class="readonly-value">{repoPath || "..."}</span>
            </div>
          </div>

          <div class="setting-row">
            <div class="setting-label">
              <span class="label-text">Auto-commit</span>
              <span class="label-hint">Automatically commit changes after saving</span>
            </div>
            <div class="setting-control">
              <button
                class="toggle"
                class:active={config.autoCommit}
                onclick={() => { config!.autoCommit = !config!.autoCommit; updateField("autoCommit", config!.autoCommit); }}
                role="switch"
                aria-checked={config.autoCommit}
                aria-label="Toggle auto-commit"
              >
                <span class="toggle-thumb"></span>
              </button>
            </div>
          </div>

          <div class="setting-row">
            <div class="setting-label">
              <span class="label-text">Commit delay</span>
              <span class="label-hint">Wait time before auto-committing ({((config.commitDelayMs ?? 5000) / 1000).toFixed(0)}s)</span>
            </div>
            <div class="setting-control">
              <input
                type="range"
                class="range-input"
                min="1000"
                max="30000"
                step="1000"
                value={config.commitDelayMs ?? 5000}
                oninput={(e) => {
                  const val = Number(e.currentTarget.value);
                  config!.commitDelayMs = val;
                  updateField("commitDelayMs", val);
                }}
              />
            </div>
          </div>

          <div class="setting-row">
            <div class="setting-label">
              <span class="label-text">Commit prefix</span>
              <span class="label-hint">Prefix prepended to auto-commit messages</span>
            </div>
            <div class="setting-control">
              <input
                type="text"
                class="text-input"
                value={config.commitPrefix}
                onchange={(e) => updateField("commitPrefix", e.currentTarget.value)}
              />
            </div>
          </div>

          <div class="setting-row">
            <div class="setting-label">
              <span class="label-text">Default model</span>
              <span class="label-hint">Model used for token counting</span>
            </div>
            <div class="setting-control">
              <input
                type="text"
                class="text-input"
                value={config.defaultModel}
                onchange={(e) => updateField("defaultModel", e.currentTarget.value)}
              />
            </div>
          </div>

        {:else if activeTab === "editor"}
          <div class="setting-row">
            <div class="setting-label">
              <span class="label-text">Font family</span>
              <span class="label-hint">Monospace font for the editor</span>
            </div>
            <div class="setting-control">
              <input
                type="text"
                class="text-input"
                placeholder="Fira Code"
                value={config.editorFontFamily}
                onchange={(e) => updateEditorField("editorFontFamily", e.currentTarget.value)}
              />
            </div>
          </div>

          <div class="setting-row">
            <div class="setting-label">
              <span class="label-text">Font size</span>
              <span class="label-hint">Editor text size in pixels</span>
            </div>
            <div class="setting-control">
              <div class="number-stepper">
                <button
                  class="stepper-btn"
                  onclick={() => {
                    const val = Math.max(10, config!.editorFontSize - 1);
                    config!.editorFontSize = val;
                    updateEditorField("editorFontSize", val);
                  }}
                  aria-label="Decrease font size"
                >-</button>
                <span class="stepper-value">{config.editorFontSize}px</span>
                <button
                  class="stepper-btn"
                  onclick={() => {
                    const val = Math.min(24, config!.editorFontSize + 1);
                    config!.editorFontSize = val;
                    updateEditorField("editorFontSize", val);
                  }}
                  aria-label="Increase font size"
                >+</button>
              </div>
            </div>
          </div>

          <div class="setting-row">
            <div class="setting-label">
              <span class="label-text">Word wrap</span>
              <span class="label-hint">Wrap long lines instead of scrolling</span>
            </div>
            <div class="setting-control">
              <button
                class="toggle"
                class:active={config.editorWordWrap}
                onclick={() => { config!.editorWordWrap = !config!.editorWordWrap; updateEditorField("editorWordWrap", config!.editorWordWrap); }}
                role="switch"
                aria-checked={config.editorWordWrap}
                aria-label="Toggle word wrap"
              >
                <span class="toggle-thumb"></span>
              </button>
            </div>
          </div>

          <div class="setting-row">
            <div class="setting-label">
              <span class="label-text">Line numbers</span>
              <span class="label-hint">Show line numbers in the gutter</span>
            </div>
            <div class="setting-control">
              <button
                class="toggle"
                class:active={config.editorLineNumbers}
                onclick={() => { config!.editorLineNumbers = !config!.editorLineNumbers; updateEditorField("editorLineNumbers", config!.editorLineNumbers); }}
                role="switch"
                aria-checked={config.editorLineNumbers}
                aria-label="Toggle line numbers"
              >
                <span class="toggle-thumb"></span>
              </button>
            </div>
          </div>

          <div class="setting-row">
            <div class="setting-label">
              <span class="label-text">Show invisibles</span>
              <span class="label-hint">Display whitespace characters</span>
            </div>
            <div class="setting-control">
              <button
                class="toggle"
                class:active={config.editorShowInvisibles}
                onclick={() => { config!.editorShowInvisibles = !config!.editorShowInvisibles; updateEditorField("editorShowInvisibles", config!.editorShowInvisibles); }}
                role="switch"
                aria-checked={config.editorShowInvisibles}
                aria-label="Toggle show invisibles"
              >
                <span class="toggle-thumb"></span>
              </button>
            </div>
          </div>

        {:else if activeTab === "appearance"}
          <div class="setting-row">
            <div class="setting-label">
              <span class="label-text">Theme</span>
              <span class="label-hint">Application color scheme</span>
            </div>
            <div class="setting-control">
              <div class="radio-group">
                <button
                  class="radio-btn"
                  class:active={$currentTheme === "dark"}
                  onclick={() => { setTheme("dark"); }}
                >Dark</button>
                <button
                  class="radio-btn"
                  class:active={$currentTheme === "light"}
                  onclick={() => { setTheme("light"); }}
                >Light</button>
              </div>
            </div>
          </div>

          <div class="setting-row">
            <div class="setting-label">
              <span class="label-text">Sidebar position</span>
              <span class="label-hint">Which side the file sidebar appears on</span>
            </div>
            <div class="setting-control">
              <div class="radio-group">
                <button
                  class="radio-btn"
                  class:active={config.sidebarPosition === "left"}
                  onclick={() => { config!.sidebarPosition = "left"; updateField("sidebarPosition", "left"); sidebarPosition.set("left"); }}
                >Left</button>
                <button
                  class="radio-btn"
                  class:active={config.sidebarPosition === "right"}
                  onclick={() => { config!.sidebarPosition = "right"; updateField("sidebarPosition", "right"); sidebarPosition.set("right"); }}
                >Right</button>
              </div>
            </div>
          </div>

          <div class="setting-row shortcuts-row">
            <div class="setting-label">
              <span class="label-text">Keyboard shortcuts</span>
            </div>
          </div>
          <div class="shortcuts-table">
            {#each getAllShortcuts() as { action, shortcut }}
              <div class="shortcut-row">
                <span class="shortcut-action">{formatActionName(action)}</span>
                <kbd class="shortcut-key">{formatShortcut(shortcut)}</kbd>
              </div>
            {/each}
          </div>
        {/if}
      {/if}
    </div>
  </div>
</div>

<style>
  .overlay {
    position: fixed;
    top: 0;
    left: 0;
    right: 0;
    bottom: 0;
    background: rgba(0, 0, 0, 0.5);
    backdrop-filter: blur(8px);
    -webkit-backdrop-filter: blur(8px);
    display: flex;
    align-items: center;
    justify-content: center;
    z-index: 200;
  }
  :global([data-theme="light"]) .overlay {
    background: rgba(0, 0, 0, 0.3);
  }
  .panel {
    width: 600px;
    height: 520px;
    background: var(--bg-secondary);
    border: 1px solid var(--border-primary);
    border-radius: var(--radius-lg);
    box-shadow: var(--shadow-xl);
    display: flex;
    flex-direction: column;
    overflow: hidden;
  }
  .panel-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: var(--space-4) var(--space-5);
    padding-bottom: 0;
  }
  .panel-title {
    font-size: var(--font-size-lg);
    font-weight: var(--font-weight-semibold);
    color: var(--text-primary);
  }
  .close-btn {
    width: 28px;
    height: 28px;
    display: flex;
    align-items: center;
    justify-content: center;
    border-radius: var(--radius-md);
    color: var(--text-tertiary);
    transition: all var(--transition-fast);
  }
  .close-btn:hover {
    background: var(--bg-quaternary);
    color: var(--text-primary);
  }
  .tabs {
    display: flex;
    gap: var(--space-1);
    padding: var(--space-3) var(--space-5);
    border-bottom: 1px solid var(--border-secondary);
  }
  .tab {
    padding: var(--space-1) var(--space-3);
    font-size: var(--font-size-sm);
    color: var(--text-tertiary);
    border-radius: var(--radius-md);
    transition: all var(--transition-fast);
    position: relative;
  }
  .tab:hover {
    color: var(--text-secondary);
    background: var(--bg-tertiary);
  }
  .tab.active {
    color: var(--accent);
    background: var(--accent-subtle);
  }
  .tab.active::after {
    content: "";
    position: absolute;
    bottom: -13px;
    left: var(--space-3);
    right: var(--space-3);
    height: 2px;
    background: var(--accent);
    border-radius: 1px;
  }
  .tab-content {
    flex: 1;
    overflow-y: auto;
    padding: var(--space-3) var(--space-5);
  }
  .loading {
    padding: var(--space-8);
    text-align: center;
    color: var(--text-tertiary);
    font-size: var(--font-size-md);
  }
  .setting-row {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: var(--space-3) 0;
    border-bottom: 1px solid var(--border-secondary);
  }
  .setting-label {
    display: flex;
    flex-direction: column;
    gap: var(--space-1);
  }
  .label-text {
    font-size: var(--font-size-sm);
    color: var(--text-primary);
    font-weight: var(--font-weight-medium);
  }
  .label-hint {
    font-size: var(--font-size-xs);
    color: var(--text-tertiary);
  }

  /* Toggle */
  .toggle {
    width: 40px;
    height: 22px;
    border-radius: 11px;
    background: var(--bg-quaternary);
    position: relative;
    transition: background var(--transition-fast);
    cursor: pointer;
    flex-shrink: 0;
    border: none;
  }
  .toggle.active {
    background: var(--accent);
  }
  .toggle-thumb {
    position: absolute;
    top: 2px;
    left: 2px;
    width: 18px;
    height: 18px;
    border-radius: 50%;
    background: white;
    transition: transform var(--transition-fast);
    box-shadow: 0 1px 3px rgba(0, 0, 0, 0.2);
  }
  .toggle.active .toggle-thumb {
    transform: translateX(18px);
  }

  /* Text input */
  .text-input {
    width: 180px;
    padding: var(--space-1) var(--space-2);
    background: var(--bg-tertiary);
    border: 1px solid var(--border-primary);
    border-radius: var(--radius-md);
    color: var(--text-primary);
    font-size: var(--font-size-sm);
    font-family: var(--font-mono);
    outline: none;
    transition: border-color var(--transition-fast);
  }
  .text-input:focus {
    border-color: var(--border-focus);
  }

  /* Range input */
  .range-input {
    width: 160px;
    accent-color: var(--accent);
  }

  /* Readonly value */
  .readonly-value {
    font-family: var(--font-mono);
    font-size: var(--font-size-xs);
    color: var(--text-tertiary);
    max-width: 240px;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    direction: rtl;
    text-align: right;
  }

  /* Number stepper */
  .number-stepper {
    display: flex;
    align-items: center;
    gap: 0;
    border: 1px solid var(--border-primary);
    border-radius: var(--radius-md);
    overflow: hidden;
  }
  .stepper-btn {
    width: 28px;
    height: 28px;
    display: flex;
    align-items: center;
    justify-content: center;
    background: var(--bg-tertiary);
    color: var(--text-secondary);
    font-size: var(--font-size-md);
    font-weight: var(--font-weight-medium);
    transition: all var(--transition-fast);
    border: none;
    cursor: pointer;
  }
  .stepper-btn:hover {
    background: var(--bg-quaternary);
    color: var(--text-primary);
  }
  .stepper-value {
    padding: 0 var(--space-3);
    font-size: var(--font-size-sm);
    font-family: var(--font-mono);
    color: var(--text-primary);
    min-width: 42px;
    text-align: center;
    background: var(--bg-secondary);
  }

  /* Radio group */
  .radio-group {
    display: flex;
    border: 1px solid var(--border-primary);
    border-radius: var(--radius-md);
    overflow: hidden;
  }
  .radio-btn {
    padding: var(--space-1) var(--space-3);
    font-size: var(--font-size-sm);
    color: var(--text-secondary);
    background: var(--bg-tertiary);
    transition: all var(--transition-fast);
    border: none;
    cursor: pointer;
  }
  .radio-btn:not(:last-child) {
    border-right: 1px solid var(--border-primary);
  }
  .radio-btn:hover {
    background: var(--bg-quaternary);
  }
  .radio-btn.active {
    background: var(--accent-subtle);
    color: var(--accent);
    font-weight: var(--font-weight-medium);
  }

  /* Shortcuts */
  .shortcuts-row {
    border-bottom: none;
    padding-bottom: var(--space-1);
  }
  .shortcuts-table {
    display: flex;
    flex-direction: column;
    border: 1px solid var(--border-secondary);
    border-radius: var(--radius-md);
    overflow: hidden;
    margin-bottom: var(--space-3);
  }
  .shortcut-row {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: var(--space-2) var(--space-3);
    font-size: var(--font-size-sm);
  }
  .shortcut-row:not(:last-child) {
    border-bottom: 1px solid var(--border-secondary);
  }
  .shortcut-action {
    color: var(--text-secondary);
  }
  .shortcut-key {
    font-family: var(--font-mono);
    font-size: var(--font-size-xs);
    color: var(--text-tertiary);
    background: var(--bg-primary);
    padding: var(--space-1) var(--space-2);
    border-radius: var(--radius-sm);
    border: 1px solid var(--border-primary);
  }
</style>
