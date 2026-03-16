<script lang="ts">
  import { activeFile, variableValues } from "../stores/editor";

  function handleInput(name: string, value: string) {
    variableValues.update((v) => ({ ...v, [name]: value }));
  }
</script>

{#if $activeFile}
  <div class="variables-panel">
    <h3>Variables</h3>
    {#if $activeFile.frontmatter.variables.length > 0}
      {#each $activeFile.frontmatter.variables as variable}
        <div class="variable">
          <div class="var-header">
            <span class="var-name">{"{{" + variable.name + "}}"}</span>
            {#if variable.enum}
              <span class="var-type">enum</span>
            {/if}
          </div>
          {#if variable.description}
            <div class="var-desc">{variable.description}</div>
          {/if}
          <div class="var-default">
            {#if variable.enum}
              <select
                class="var-input"
                onchange={(e) => handleInput(variable.name, e.currentTarget.value)}
              >
                {#each variable.enum as option}
                  <option value={option} selected={option === variable.default}>{option}</option>
                {/each}
              </select>
            {:else}
              <input
                type="text"
                class="var-input"
                value={variable.default || ""}
                placeholder="No default"
                oninput={(e) => handleInput(variable.name, e.currentTarget.value)}
              />
            {/if}
          </div>
        </div>
      {/each}
    {:else}
      <div class="empty-state">
        <span class="icon">{"{ }"}</span>
        <span class="message">No variables defined</span>
        <span class="hint">{"Use {{name}} syntax in your prompt"}</span>
      </div>
    {/if}
  </div>
{/if}

<style>
  .variables-panel {
    padding: var(--space-3);
    border-top: 1px solid var(--border-primary);
  }
  h3 {
    margin: 0 0 var(--space-3);
    font-size: var(--font-size-xs);
    font-weight: var(--font-weight-semibold);
    color: var(--text-tertiary);
    text-transform: uppercase;
    letter-spacing: 0.05em;
  }
  .variable {
    margin-bottom: var(--space-2);
    padding: var(--space-2);
    background: rgba(255, 255, 255, 0.04);
    border-radius: var(--radius-md);
    border: 1px solid var(--border-secondary);
  }
  .var-header {
    display: flex;
    align-items: center;
    gap: var(--space-1);
    margin-bottom: var(--space-1);
  }
  .var-name {
    font-family: var(--font-mono);
    font-size: var(--font-size-base);
    color: var(--color-variable);
  }
  .var-type {
    font-size: var(--font-size-xs);
    color: var(--color-include);
    background: var(--color-include-subtle);
    padding: 0 var(--space-1);
    border-radius: var(--radius-sm);
  }
  .var-desc {
    font-size: var(--font-size-sm);
    color: var(--text-secondary);
    margin-bottom: var(--space-1);
  }
  .var-input {
    width: 100%;
    padding: var(--space-1) var(--space-2);
    background: var(--bg-primary);
    border: 1px solid var(--border-primary);
    border-radius: var(--radius-sm);
    color: var(--text-primary);
    font-size: var(--font-size-base);
    font-family: var(--font-mono);
  }
  .var-input:focus {
    border-color: var(--accent);
    box-shadow: 0 0 0 1px var(--border-focus);
  }
  select.var-input {
    cursor: pointer;
  }
  .empty-state {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: var(--space-2);
    padding: var(--space-6) var(--space-3);
    text-align: center;
  }
  .empty-state .icon {
    font-size: 24px;
    opacity: 0.4;
    font-family: var(--font-mono);
  }
  .empty-state .message {
    font-size: var(--font-size-sm);
    color: var(--text-tertiary);
    font-style: italic;
  }
  .empty-state .hint {
    font-size: var(--font-size-xs);
    color: var(--text-quaternary);
    font-family: var(--font-mono);
  }
</style>
