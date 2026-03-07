<script lang="ts">
  import { saveFile, showPreview, showSidebar, showInspector, showBottomPanel } from "../stores/editor";

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
  <div class="overlay" onclick={onClose} onkeydown={handleKeydown} role="dialog" aria-modal="true" aria-label="Command palette" tabindex="-1">
    <div class="palette" onclick={(e) => e.stopPropagation()}>
      <input
        bind:this={inputEl}
        type="text"
        placeholder="Type a command..."
        bind:value={query}
        onkeydown={handleKeydown}
      />
      <div class="commands">
        {#each filteredCommands as cmd, i}
          <button
            class="command"
            class:selected={i === selectedIndex}
            onclick={() => cmd.action()}
          >
            <span class="cmd-label">{cmd.label}</span>
            {#if cmd.shortcut}
              <span class="cmd-shortcut">{cmd.shortcut}</span>
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
    background: #00000060;
    display: flex;
    justify-content: center;
    padding-top: 15vh;
    z-index: 100;
  }
  .palette {
    width: 500px;
    max-height: 360px;
    background: #27272a;
    border: 1px solid #3f3f46;
    border-radius: 8px;
    overflow: hidden;
    box-shadow: 0 20px 60px #00000060;
    align-self: flex-start;
  }
  input {
    width: 100%;
    padding: 12px 16px;
    background: none;
    border: none;
    border-bottom: 1px solid #3f3f46;
    color: #d4d4d8;
    font-size: 15px;
    outline: none;
    font-family: inherit;
  }
  input::placeholder {
    color: #52525b;
  }
  .commands {
    max-height: 300px;
    overflow-y: auto;
  }
  .command {
    display: flex;
    align-items: center;
    justify-content: space-between;
    width: 100%;
    padding: 8px 16px;
    border: none;
    background: none;
    color: #d4d4d8;
    font-size: 14px;
    cursor: pointer;
    text-align: left;
    font-family: inherit;
  }
  .command:hover,
  .command.selected {
    background: #3f3f46;
  }
  .cmd-shortcut {
    font-size: 12px;
    color: #71717a;
    font-family: monospace;
    background: #18181b;
    padding: 2px 6px;
    border-radius: 3px;
  }
</style>
