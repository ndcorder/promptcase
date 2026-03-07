<script lang="ts">
  import { onMount, onDestroy } from "svelte";
  import { EditorState } from "@codemirror/state";
  import { EditorView, keymap, lineNumbers, highlightActiveLine, highlightActiveLineGutter } from "@codemirror/view";
  import { defaultKeymap, history, historyKeymap } from "@codemirror/commands";
  import { markdown } from "@codemirror/lang-markdown";

  import { searchKeymap, highlightSelectionMatches } from "@codemirror/search";
  import { closeBrackets, closeBracketsKeymap } from "@codemirror/autocomplete";
  import { promptcaseTheme, promptcaseHighlighting } from "../codemirror/theme";
  import { templateHighlighting } from "../codemirror/template-highlighting";
  import { templateAutocompletion } from "../codemirror/autocomplete";
  import { editorContent, activeFile, markModified, saveFile, updateTokenCounts, showPreview } from "../stores/editor";

  let editorContainer: HTMLDivElement;
  let view: EditorView | null = null;
  let debounceTimer: ReturnType<typeof setTimeout>;
  let currentPath: string | null = null;

  function createState(content: string): EditorState {
    return EditorState.create({
      doc: content,
      extensions: [
        lineNumbers(),
        highlightActiveLine(),
        highlightActiveLineGutter(),
        history(),
        closeBrackets(),
        highlightSelectionMatches(),
        markdown(),
        promptcaseTheme,
        promptcaseHighlighting,
        templateHighlighting,
        templateAutocompletion,
        keymap.of([
          ...defaultKeymap,
          ...historyKeymap,
          ...searchKeymap,
          ...closeBracketsKeymap,
          {
            key: "Mod-s",
            run: () => {
              saveFile();
              return true;
            },
          },
          {
            key: "Mod-e",
            run: () => {
              showPreview.update((v) => !v);
              return true;
            },
          },
        ]),
        EditorView.updateListener.of((update) => {
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
        EditorView.lineWrapping,
      ],
    });
  }

  onMount(() => {
    view = new EditorView({
      state: createState(""),
      parent: editorContainer,
    });
  });

  onDestroy(() => {
    if (view) view.destroy();
    clearTimeout(debounceTimer);
  });

  // React to file changes
  $effect(() => {
    const file = $activeFile;
    if (view && file && file.path !== currentPath) {
      currentPath = file.path;
      view.setState(createState(file.body));
    }
  });
</script>

<div class="editor-wrapper">
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
  }
  .editor-container :global(.cm-scroller) {
    overflow: auto;
  }
</style>
