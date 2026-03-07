<script lang="ts">
  import { onMount } from "svelte";
  import Sidebar from "./lib/components/Sidebar.svelte";
  import EditorTabs from "./lib/components/EditorTabs.svelte";
  import Editor from "./lib/components/Editor.svelte";
  import Inspector from "./lib/components/Inspector.svelte";
  import ProblemsPanel from "./lib/components/ProblemsPanel.svelte";
  import StatusBar from "./lib/components/StatusBar.svelte";
  import QuickOpen from "./lib/components/QuickOpen.svelte";
  import CommandPalette from "./lib/components/CommandPalette.svelte";
  import ResolvedPreview from "./lib/components/ResolvedPreview.svelte";
  import {
    showSidebar,
    showInspector,
    showBottomPanel,
    showPreview,
    saveFile,
    activeFile,
  } from "./lib/stores/editor";
  import { loadFiles } from "./lib/stores/files";
  import { templateHighlightingStyles } from "./lib/codemirror/template-highlighting";

  let quickOpenVisible = $state(false);
  let commandPaletteVisible = $state(false);

  const isMac = navigator.platform.toUpperCase().indexOf("MAC") >= 0;
  const modKey = isMac ? "Cmd" : "Ctrl";

  onMount(async () => {
    await loadFiles();
  });

  function handleGlobalKeydown(e: KeyboardEvent) {
    const mod = e.metaKey || e.ctrlKey;

    if (mod && e.key === "p" && !e.shiftKey) {
      e.preventDefault();
      quickOpenVisible = true;
    } else if (mod && e.shiftKey && e.key === "P") {
      e.preventDefault();
      commandPaletteVisible = true;
    } else if (mod && e.key === "s") {
      e.preventDefault();
      saveFile();
    } else if (mod && e.key === "b") {
      e.preventDefault();
      showSidebar.update((v) => !v);
    } else if (mod && e.key === "j") {
      e.preventDefault();
      showBottomPanel.update((v) => !v);
    } else if (mod && e.key === "e") {
      e.preventDefault();
      showPreview.update((v) => !v);
    }
  }
</script>

<svelte:window onkeydown={handleGlobalKeydown} />

{@html `<style>${templateHighlightingStyles}</style>`}

<div class="app" data-testid="app">
  {#if $showSidebar}
    <div class="panel sidebar-panel" style="width: 260px;">
      <Sidebar />
    </div>
  {/if}

  <div class="main-area">
    <EditorTabs />

    <div class="editor-area">
      {#if $activeFile}
        <div class="editor-split">
          <Editor />
          {#if $showPreview}
            <div class="preview-split">
              <ResolvedPreview />
            </div>
          {/if}
        </div>
      {:else}
        <div class="empty-state">
          <div class="empty-content">
            <h1>Promptcase</h1>
            <p>Open a prompt from the sidebar or press <kbd>{modKey}+P</kbd> to search.</p>
          </div>
        </div>
      {/if}
    </div>

    {#if $showBottomPanel}
      <div class="bottom-panel" style="height: 160px;">
        <ProblemsPanel />
      </div>
    {/if}
  </div>

  {#if $showInspector}
    <div class="panel inspector-panel" style="width: 280px;">
      <Inspector />
    </div>
  {/if}

  <StatusBar />

  <QuickOpen
    visible={quickOpenVisible}
    onClose={() => (quickOpenVisible = false)}
  />
  <CommandPalette
    visible={commandPaletteVisible}
    onClose={() => (commandPaletteVisible = false)}
  />
</div>

<style>
  .app {
    display: grid;
    grid-template-columns: auto 1fr auto;
    grid-template-rows: 1fr auto;
    height: 100vh;
    overflow: hidden;
    background: #09090b;
    color: #d4d4d8;
  }
  .sidebar-panel {
    grid-row: 1;
    grid-column: 1;
    overflow: hidden;
  }
  .main-area {
    grid-row: 1;
    grid-column: 2;
    display: flex;
    flex-direction: column;
    overflow: hidden;
    min-width: 0;
  }
  .inspector-panel {
    grid-row: 1;
    grid-column: 3;
    overflow: hidden;
  }
  .editor-area {
    flex: 1;
    overflow: hidden;
    display: flex;
    flex-direction: column;
  }
  .editor-split {
    flex: 1;
    display: flex;
    overflow: hidden;
  }
  .preview-split {
    width: 50%;
    border-left: 1px solid #27272a;
  }
  .bottom-panel {
    border-top: 1px solid #27272a;
    background: #18181b;
    overflow: hidden;
  }
  :global(footer.status-bar) {
    grid-row: 2;
    grid-column: 1 / -1;
  }
  .empty-state {
    flex: 1;
    display: flex;
    align-items: center;
    justify-content: center;
  }
  .empty-content {
    text-align: center;
  }
  .empty-content h1 {
    font-size: 28px;
    font-weight: 300;
    color: #3f3f46;
    margin: 0 0 8px;
  }
  .empty-content p {
    color: #52525b;
    font-size: 14px;
  }
  .empty-content kbd {
    background: #27272a;
    padding: 2px 6px;
    border-radius: 4px;
    font-family: monospace;
    font-size: 13px;
    color: #a1a1aa;
    border: 1px solid #3f3f46;
  }
  .panel {
    flex-shrink: 0;
  }
</style>
