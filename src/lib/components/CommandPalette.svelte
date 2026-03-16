<script lang="ts">
  import { saveFile, showPreview, showSidebar, showInspector, showBottomPanel, activeFile, resolvedText } from "../stores/editor";
  import { api } from "../ipc";
  import { loadFiles } from "../stores/files";
  import { get } from "svelte/store";

  interface Command {
    id: string;
    label: string;
    shortcut?: string;
    action: () => void;
  }

  interface Props {
    visible: boolean;
    onClose: () => void;
  }

  let { visible, onClose }: Props = $props();
  let query = $state("");
  let selectedIndex = $state(0);
  let inputEl: HTMLInputElement;

  const commands: Command[] = [
    { id: "save", label: "Save File", shortcut: "Cmd+S", action: () => { saveFile(); onClose(); } },
    { id: "copy-resolved", label: "Copy Resolved Prompt", action: () => { navigator.clipboard.writeText(get(resolvedText)); onClose(); } },
    { id: "copy-raw", label: "Copy Raw Content", action: () => { const f = get(activeFile); if (f) navigator.clipboard.writeText(f.body); onClose(); } },
    { id: "preview", label: "Toggle Resolved Preview", shortcut: "Cmd+E", action: () => { showPreview.update((v) => !v); onClose(); } },
    { id: "sidebar", label: "Toggle Sidebar", shortcut: "Cmd+B", action: () => { showSidebar.update((v) => !v); onClose(); } },
    { id: "inspector", label: "Toggle Inspector", action: () => { showInspector.update((v) => !v); onClose(); } },
    { id: "bottom", label: "Toggle Bottom Panel", shortcut: "Cmd+J", action: () => { showBottomPanel.update((v) => !v); onClose(); } },
  ];

  let filteredCommands = $derived.by(() => {
    if (!query) return commands;
    const q = query.toLowerCase();
    return commands.filter((c) => c.label.toLowerCase().includes(q));
  });

  function handleKeydown(e: KeyboardEvent) {
    if (e.key === "Escape") {
      onClose();
    } else if (e.key === "ArrowDown") {
      e.preventDefault();
      selectedIndex = Math.min(selectedIndex + 1, filteredCommands.length - 1);
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      selectedIndex = Math.max(selectedIndex - 1, 0);
    } else if (e.key === "Enter") {
      e.preventDefault();
      if (filteredCommands[selectedIndex]) {
        filteredCommands[selectedIndex].action();
      }
    }
  }

  $effect(() => {
    if (filteredCommands.length > 0) {
      selectedIndex = Math.min(selectedIndex, filteredCommands.length - 1);
    } else {
      selectedIndex = 0;
    }
  });

  $effect(() => {
    if (visible && inputEl) {
      query = "";
      selectedIndex = 0;
      inputEl.focus();
    }
  });
</script>

{#if visible}
  <div class="overlay" onclick={(e) => { if (e.target === e.currentTarget) onClose(); }} onkeydown={handleKeydown} role="dialog" aria-modal="true" aria-label="Command palette" tabindex="-1">
    <div class="palette">
      <div class="palette-input-wrapper">
        <svg class="cmd-icon" width="14" height="14" viewBox="0 0 14 14">
          <path d="M7 1v12M1 7h12" stroke="currentColor" stroke-width="1.3" stroke-linecap="round"/>
        </svg>
        <input
          bind:this={inputEl}
          type="text"
          placeholder="Type a command..."
          bind:value={query}
          onkeydown={handleKeydown}
        />
      </div>
      <div class="commands">
        {#each filteredCommands as cmd, i}
          <button
            class="command"
            class:selected={i === selectedIndex}
            onclick={() => cmd.action()}
          >
            <span class="cmd-label">{cmd.label}</span>
            {#if cmd.shortcut}
              <kbd class="cmd-shortcut">{cmd.shortcut}</kbd>
            {/if}
          </button>
        {/each}
      </div>
    </div>
  </div>
{/if}

<style>
  .overlay {
    position: fixed;
    top: 0;
    left: 0;
    right: 0;
    bottom: 0;
    background: rgba(0, 0, 0, 0.4);
    backdrop-filter: blur(4px);
    -webkit-backdrop-filter: blur(4px);
    display: flex;
    justify-content: center;
    padding-top: 15vh;
    z-index: 100;
  }
  .palette {
    width: 500px;
    max-height: 360px;
    background: var(--bg-tertiary);
    border: 1px solid var(--border-primary);
    border-radius: var(--radius-lg);
    overflow: hidden;
    box-shadow: var(--shadow-xl);
    align-self: flex-start;
  }
  .palette-input-wrapper {
    display: flex;
    align-items: center;
    gap: var(--space-2);
    padding: 0 var(--space-4);
    border-bottom: 1px solid var(--border-primary);
  }
  .cmd-icon {
    color: var(--text-tertiary);
    flex-shrink: 0;
  }
  input {
    flex: 1;
    padding: var(--space-3) 0;
    background: none;
    border: none;
    color: var(--text-primary);
    font-size: var(--font-size-lg);
    outline: none;
    font-family: inherit;
  }
  .commands {
    max-height: 300px;
    overflow-y: auto;
    padding: var(--space-1);
  }
  .command {
    display: flex;
    align-items: center;
    justify-content: space-between;
    width: 100%;
    padding: var(--space-2) var(--space-3);
    color: var(--text-primary);
    font-size: var(--font-size-md);
    text-align: left;
    border-radius: var(--radius-md);
    transition: background var(--transition-fast);
  }
  .command:hover,
  .command.selected {
    background: rgba(255, 255, 255, 0.08);
  }
  .command.selected {
    background: var(--accent-subtle);
  }
  .cmd-shortcut {
    font-size: var(--font-size-xs);
    color: var(--text-tertiary);
    font-family: var(--font-mono);
    background: var(--bg-primary);
    padding: var(--space-1) var(--space-2);
    border-radius: var(--radius-sm);
    border: 1px solid var(--border-primary);
  }
</style>
