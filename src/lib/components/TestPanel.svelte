<script lang="ts">
  import { get } from "svelte/store";
  import {
    testingConfig,
    isRunning,
    responseText,
    tokenUsage,
    testError,
    providerModels,
    runPrompt,
    cancelPrompt,
    type LlmProvider,
  } from "../stores/testing";
  import { activeFile, editorContent, resolvedText, variableValues } from "../stores/editor";
  import { api } from "../ipc";
  import { addToast } from "../stores/toast";

  let config = $testingConfig;
  let running = $isRunning;
  let response = $responseText;
  let usage = $tokenUsage;
  let error = $testError;
  let file = $activeFile;
  let systemPrompt = $state("");

  let models = $derived(providerModels[config.provider] ?? []);

  function handleProviderChange(provider: LlmProvider) {
    testingConfig.update((c) => ({
      ...c,
      provider,
      model: providerModels[provider][0],
    }));
  }

  async function handleRun() {
    const currentFile = get(activeFile);
    if (!currentFile) {
      addToast("No file open to test", "error");
      return;
    }

    // Resolve template with current variable values
    let promptText: string;
    try {
      const vars = get(variableValues);
      const resolved = await api.resolveTemplate(currentFile.path, vars);
      promptText = resolved.text;
    } catch {
      // Fall back to raw editor content
      promptText = get(editorContent);
    }

    const messages: Array<{ role: string; content: string }> = [];
    if (systemPrompt.trim()) {
      messages.push({ role: "system", content: systemPrompt.trim() });
    }
    messages.push({ role: "user", content: promptText });

    await runPrompt(messages);
  }

  function handleCopy() {
    const text = get(responseText);
    if (text) {
      navigator.clipboard.writeText(text);
      addToast("Copied to clipboard", "success", 2000);
    }
  }
</script>

<div class="test-panel">
  <div class="test-controls">
    <div class="control-row">
      <label class="control-label">Provider</label>
      <select
        class="control-select"
        value={config.provider}
        onchange={(e) => handleProviderChange(e.currentTarget.value as LlmProvider)}
      >
        <option value="anthropic">Anthropic</option>
        <option value="openai">OpenAI</option>
      </select>
    </div>

    <div class="control-row">
      <label class="control-label">Model</label>
      <select
        class="control-select"
        value={config.model}
        onchange={(e) => testingConfig.update((c) => ({ ...c, model: e.currentTarget.value }))}
      >
        {#each models as model}
          <option value={model}>{model}</option>
        {/each}
      </select>
    </div>

    <div class="control-row">
      <label class="control-label">Temperature <span class="control-value">{config.temperature.toFixed(1)}</span></label>
      <input
        type="range"
        class="range-input"
        min="0"
        max="2"
        step="0.1"
        value={config.temperature}
        oninput={(e) => testingConfig.update((c) => ({ ...c, temperature: parseFloat(e.currentTarget.value) }))}
      />
    </div>

    <div class="control-row">
      <label class="control-label">Max tokens</label>
      <input
        type="number"
        class="control-number"
        min="1"
        max="128000"
        value={config.maxTokens}
        onchange={(e) => testingConfig.update((c) => ({ ...c, maxTokens: parseInt(e.currentTarget.value, 10) || 1024 }))}
      />
    </div>

    <div class="control-row">
      <label class="control-label">System prompt</label>
      <textarea
        class="control-textarea"
        placeholder="Optional system message..."
        bind:value={systemPrompt}
        rows="2"
      ></textarea>
    </div>

    <div class="button-row">
      {#if running}
        <button class="btn btn-stop" onclick={cancelPrompt}>
          Stop
        </button>
      {:else}
        <button class="btn btn-run" onclick={handleRun} disabled={!file}>
          Run
        </button>
      {/if}
    </div>
  </div>

  <div class="response-area">
    {#if error}
      <div class="response-error">{error}</div>
    {:else if response}
      <div class="response-header">
        <span class="response-label">Response</span>
        <button class="copy-btn" onclick={handleCopy} title="Copy response">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect>
            <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path>
          </svg>
        </button>
      </div>
      <pre class="response-text">{response}{#if running}<span class="cursor">|</span>{/if}</pre>
    {:else if running}
      <div class="response-loading">Waiting for response...</div>
    {:else}
      <div class="response-empty">Run a prompt to see the response here.</div>
    {/if}
  </div>

  {#if usage}
    <div class="usage-bar">
      <span class="usage-item">Input: {usage.inputTokens}</span>
      <span class="usage-item">Output: {usage.outputTokens}</span>
      <span class="usage-item">Total: {usage.inputTokens + usage.outputTokens}</span>
    </div>
  {/if}
</div>

<style>
  .test-panel {
    display: flex;
    flex-direction: column;
    height: 100%;
    gap: var(--space-2);
  }
  .test-controls {
    display: flex;
    flex-direction: column;
    gap: var(--space-2);
    padding: var(--space-2) 0;
  }
  .control-row {
    display: flex;
    flex-direction: column;
    gap: var(--space-1);
  }
  .control-label {
    font-size: var(--font-size-xs);
    color: var(--text-tertiary);
    font-weight: var(--font-weight-medium);
  }
  .control-value {
    float: right;
    font-family: var(--font-mono);
    color: var(--text-secondary);
  }
  .control-select,
  .control-number {
    width: 100%;
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
  .control-select:focus,
  .control-number:focus {
    border-color: var(--border-focus);
  }
  .control-textarea {
    width: 100%;
    padding: var(--space-1) var(--space-2);
    background: var(--bg-tertiary);
    border: 1px solid var(--border-primary);
    border-radius: var(--radius-md);
    color: var(--text-primary);
    font-size: var(--font-size-sm);
    font-family: var(--font-mono);
    outline: none;
    resize: vertical;
    min-height: 40px;
    transition: border-color var(--transition-fast);
  }
  .control-textarea:focus {
    border-color: var(--border-focus);
  }
  .range-input {
    width: 100%;
    accent-color: var(--accent);
  }
  .button-row {
    display: flex;
    gap: var(--space-2);
    padding-top: var(--space-1);
  }
  .btn {
    flex: 1;
    padding: var(--space-2) var(--space-3);
    border-radius: var(--radius-md);
    font-size: var(--font-size-sm);
    font-weight: var(--font-weight-medium);
    cursor: pointer;
    transition: all var(--transition-fast);
    border: none;
  }
  .btn-run {
    background: var(--accent);
    color: white;
  }
  .btn-run:hover:not(:disabled) {
    opacity: 0.9;
  }
  .btn-run:disabled {
    opacity: 0.4;
    cursor: not-allowed;
  }
  .btn-stop {
    background: var(--error, #e74c3c);
    color: white;
  }
  .btn-stop:hover {
    opacity: 0.9;
  }

  .response-area {
    flex: 1;
    overflow-y: auto;
    background: var(--bg-tertiary);
    border: 1px solid var(--border-secondary);
    border-radius: var(--radius-md);
    padding: var(--space-2);
    min-height: 80px;
  }
  .response-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: var(--space-1);
  }
  .response-label {
    font-size: var(--font-size-xs);
    color: var(--text-tertiary);
    font-weight: var(--font-weight-medium);
    text-transform: uppercase;
    letter-spacing: 0.05em;
  }
  .copy-btn {
    padding: var(--space-1);
    border-radius: var(--radius-sm);
    color: var(--text-tertiary);
    background: none;
    border: none;
    cursor: pointer;
    transition: all var(--transition-fast);
  }
  .copy-btn:hover {
    color: var(--text-primary);
    background: var(--bg-quaternary);
  }
  .response-text {
    font-size: var(--font-size-sm);
    font-family: var(--font-mono);
    color: var(--text-primary);
    white-space: pre-wrap;
    word-break: break-word;
    margin: 0;
    line-height: 1.5;
  }
  .response-empty,
  .response-loading {
    font-size: var(--font-size-sm);
    color: var(--text-tertiary);
    text-align: center;
    padding: var(--space-4);
  }
  .response-error {
    font-size: var(--font-size-sm);
    color: var(--error, #e74c3c);
    padding: var(--space-2);
  }
  .cursor {
    animation: blink 1s step-end infinite;
    color: var(--accent);
  }
  @keyframes blink {
    50% { opacity: 0; }
  }

  .usage-bar {
    display: flex;
    gap: var(--space-3);
    padding: var(--space-2) 0;
    font-size: var(--font-size-xs);
    color: var(--text-tertiary);
    font-family: var(--font-mono);
    border-top: 1px solid var(--border-secondary);
  }
  .usage-item {
    display: flex;
    gap: var(--space-1);
  }
</style>
