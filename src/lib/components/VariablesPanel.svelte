<script lang="ts">
  import { activeFile, variableValues } from "../stores/editor";

  function handleInput(name: string, value: string) {
    variableValues.update((v) => ({ ...v, [name]: value }));
  }
</script>

{#if $activeFile && $activeFile.frontmatter.variables.length > 0}
  <div class="variables-panel">
    <h3>Variables</h3>
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
  </div>
{/if}

<style>
  .variables-panel {
    padding: 12px;
    border-top: 1px solid #27272a;
  }
  h3 {
    margin: 0 0 12px;
    font-size: 12px;
    font-weight: 600;
    color: #71717a;
    text-transform: uppercase;
    letter-spacing: 0.5px;
  }
  .variable {
    margin-bottom: 10px;
    padding: 8px;
    background: #27272a;
    border-radius: 6px;
  }
  .var-header {
    display: flex;
    align-items: center;
    gap: 6px;
    margin-bottom: 4px;
  }
  .var-name {
    font-family: monospace;
    font-size: 13px;
    color: #f59e0b;
  }
  .var-type {
    font-size: 10px;
    color: #a78bfa;
    background: #a78bfa20;
    padding: 0 4px;
    border-radius: 2px;
  }
  .var-desc {
    font-size: 12px;
    color: #a1a1aa;
    margin-bottom: 6px;
  }
  .var-input {
    width: 100%;
    padding: 4px 8px;
    background: #18181b;
    border: 1px solid #3f3f46;
    border-radius: 4px;
    color: #d4d4d8;
    font-size: 13px;
    font-family: monospace;
    outline: none;
  }
  .var-input:focus {
    border-color: #a78bfa;
  }
  select.var-input {
    cursor: pointer;
  }
</style>
