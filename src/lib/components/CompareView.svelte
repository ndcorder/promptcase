<script lang="ts">
  import { onMount, onDestroy } from "svelte";
  import { compareState, closeCompare } from "../stores/compare";
  import { EditorView } from "@codemirror/view";
  import { EditorState } from "@codemirror/state";
  import { MergeView } from "@codemirror/merge";
  import { promptcaseTheme, promptcaseHighlighting } from "../codemirror/theme";
  import { markdown } from "@codemirror/lang-markdown";

  let container: HTMLDivElement;
  let mergeView: MergeView | null = null;

  function handleKeydown(e: KeyboardEvent) {
    if (e.key === "Escape") {
      closeCompare();
    }
  }

  $effect(() => {
    const state = $compareState;
    if (!state.visible || !state.versionA || !state.versionB || !container) {
      if (mergeView) {
        mergeView.destroy();
        mergeView = null;
      }
      return;
    }

    // Destroy previous instance
    if (mergeView) {
      mergeView.destroy();
      mergeView = null;
    }

    const sharedExtensions = [
      EditorState.readOnly.of(true),
      EditorView.editable.of(false),
      promptcaseTheme,
      promptcaseHighlighting,
      markdown(),
    ];

    mergeView = new MergeView({
      a: {
        doc: state.versionA.content,
        extensions: sharedExtensions,
      },
      b: {
        doc: state.versionB.content,
        extensions: sharedExtensions,
      },
      parent: container,
      highlightChanges: true,
      gutter: true,
      collapseUnchanged: { margin: 3, minSize: 4 },
    });
  });

  onDestroy(() => {
    if (mergeView) {
      mergeView.destroy();
      mergeView = null;
    }
  });
</script>

<svelte:window on:keydown={handleKeydown} />

{#if $compareState.visible && $compareState.versionA && $compareState.versionB}
  <div class="compare-overlay">
    <div class="compare-header">
      <div class="compare-labels">
        <span class="version-label label-a">{$compareState.versionA.label}</span>
        <span class="separator">vs</span>
        <span class="version-label label-b">{$compareState.versionB.label}</span>
      </div>
      <button class="close-btn" onclick={() => closeCompare()} title="Close (Esc)">
        &times;
      </button>
    </div>
    <div class="compare-container" bind:this={container}></div>
  </div>
{/if}

<style>
  .compare-overlay {
    position: absolute;
    inset: 0;
    z-index: 20;
    display: flex;
    flex-direction: column;
    background: var(--bg-primary);
  }

  .compare-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: var(--space-2) var(--space-3);
    border-bottom: 1px solid var(--border-primary);
    background: var(--bg-secondary);
    flex-shrink: 0;
  }

  .compare-labels {
    display: flex;
    align-items: center;
    gap: var(--space-2);
    font-size: var(--font-size-sm);
  }

  .version-label {
    font-family: var(--font-mono);
    font-size: var(--font-size-xs);
    padding: var(--space-1) var(--space-2);
    border-radius: var(--radius-sm);
    background: var(--bg-tertiary);
    color: var(--text-secondary);
  }

  .label-a {
    border-left: 2px solid var(--color-error, #ff453a);
  }

  .label-b {
    border-left: 2px solid var(--color-success, #30d158);
  }

  .separator {
    color: var(--text-quaternary);
    font-size: var(--font-size-xs);
  }

  .close-btn {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 28px;
    height: 28px;
    border-radius: var(--radius-sm);
    color: var(--text-tertiary);
    font-size: 18px;
    line-height: 1;
    transition: background var(--transition-fast), color var(--transition-fast);
  }

  .close-btn:hover {
    background: rgba(255, 255, 255, 0.08);
    color: var(--text-primary);
  }

  .compare-container {
    flex: 1;
    overflow: auto;
  }

  .compare-container :global(.cm-mergeView) {
    height: 100%;
    overflow: auto;
  }

  .compare-container :global(.cm-editor) {
    height: 100%;
  }
</style>
