<script lang="ts">
  import { onMount, onDestroy } from "svelte";
  import { editorContent, activeFile, markModified, saveFile, updateTokenCounts, showPreview, editorConfig } from "../stores/editor";

  let editorContainer: HTMLDivElement;
  let view: import("@codemirror/view").EditorView | null = null;
  let debounceTimer: ReturnType<typeof setTimeout>;
  let currentPath: string | null = null;
  let loading = $state(true);

  // Lazy-loaded modules
  let cmState: typeof import("@codemirror/state");
  let cmView: typeof import("@codemirror/view");
  let cmCommands: typeof import("@codemirror/commands");
  let cmSearch: typeof import("@codemirror/search");
  let cmAutocomplete: typeof import("@codemirror/autocomplete");
  let cmMarkdown: typeof import("@codemirror/lang-markdown");
  let themeModule: typeof import("../codemirror/theme");
  let templateHighlightingModule: typeof import("../codemirror/template-highlighting");
  let autocompleteModule: typeof import("../codemirror/autocomplete");

  async function loadCodeMirror() {
    [cmState, cmView, cmCommands, cmSearch, cmAutocomplete, cmMarkdown, themeModule, templateHighlightingModule, autocompleteModule] = await Promise.all([
      import("@codemirror/state"),
      import("@codemirror/view"),
      import("@codemirror/commands"),
      import("@codemirror/search"),
      import("@codemirror/autocomplete"),
      import("@codemirror/lang-markdown"),
      import("../codemirror/theme"),
      import("../codemirror/template-highlighting"),
      import("../codemirror/autocomplete"),
    ]);
  }

  function createState(content: string): import("@codemirror/state").EditorState {
    return cmState.EditorState.create({
      doc: content,
      extensions: [
        cmView.lineNumbers(),
        cmView.highlightActiveLine(),
        cmView.highlightActiveLineGutter(),
        cmCommands.history(),
        cmAutocomplete.closeBrackets(),
        cmSearch.highlightSelectionMatches(),
        cmMarkdown.markdown(),
        themeModule.promptcaseTheme,
        themeModule.promptcaseHighlighting,
        templateHighlightingModule.templateHighlighting,
        autocompleteModule.templateAutocompletion,
        cmView.keymap.of([
          ...cmCommands.defaultKeymap,
          ...cmCommands.historyKeymap,
          ...cmSearch.searchKeymap,
          ...cmAutocomplete.closeBracketsKeymap,
          {
            key: "Mod-e",
            run: () => {
              showPreview.update((v) => !v);
              return true;
            },
          },
        ]),
        cmView.EditorView.updateListener.of((update) => {
          if (update.docChanged) {
            const content = update.state.doc.toString();
            editorContent.set(content);
            markModified();

            clearTimeout(debounceTimer);
            debounceTimer = setTimeout(() => {
              updateTokenCounts(content);
            }, 300);
          }
        }),
        cmView.EditorView.lineWrapping,
      ],
    });
  }

  onMount(async () => {
    await loadCodeMirror();
    loading = false;

    const initialContent = $editorContent || "";
    view = new cmView.EditorView({
      state: createState(initialContent),
      parent: editorContainer,
    });

    const file = $activeFile;
    if (file) {
      currentPath = file.path;
    }
  });

  onDestroy(() => {
    if (view) view.destroy();
    clearTimeout(debounceTimer);
  });

  $effect(() => {
    const file = $activeFile;
    const content = $editorContent;
    if (view && file && file.path !== currentPath) {
      currentPath = file.path;
      view.setState(createState(content));
    }
  });

  // Apply editor config changes (font, etc.) to the container
  $effect(() => {
    const cfg = $editorConfig;
    if (editorContainer) {
      editorContainer.style.setProperty("--editor-font-family", cfg.editorFontFamily || "Fira Code, monospace");
      editorContainer.style.setProperty("--editor-font-size", `${cfg.editorFontSize || 14}px`);
    }
  });
</script>

<div class="editor-wrapper">
  {#if loading}
    <div class="editor-loading">Loading editor...</div>
  {/if}
  <div class="editor-container" bind:this={editorContainer}></div>
</div>

<style>
  .editor-wrapper {
    flex: 1;
    overflow: hidden;
    display: flex;
    flex-direction: column;
  }
  .editor-container {
    flex: 1;
    overflow: auto;
  }
  .editor-container :global(.cm-editor) {
    height: 100%;
    font-family: var(--editor-font-family, "Fira Code", monospace);
    font-size: var(--editor-font-size, 14px);
  }
  .editor-container :global(.cm-scroller) {
    overflow: auto;
  }
  .editor-container :global(.cm-gutters) {
    font-family: var(--editor-font-family, "Fira Code", monospace);
    font-size: var(--editor-font-size, 14px);
  }
  .editor-loading {
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 2rem;
    color: var(--text-tertiary);
    font-size: var(--font-size-md);
  }
</style>
