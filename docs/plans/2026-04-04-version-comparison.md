# Prompt Version Comparison Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Compare two versions of a prompt side-by-side using CodeMirror's merge view, with version selection from starred versions and commit history.

**Architecture:** Rust backend provides file content at arbitrary commits via git2. Frontend uses @codemirror/merge (already a dependency) for split-pane diff visualization. CompareView overlays the editor area.

**Tech Stack:** Rust (git2), @codemirror/merge, Svelte 5, TypeScript

---

## Task 1: Backend -- git_show_file command

`git_ops::show_file_at_commit` already exists (line 395 of `git_ops.rs`) and handles tree traversal + UTF-8 validation. We just need a Tauri command wrapper and IPC binding.

**Files:**
- Modify: `src-tauri/src/commands.rs` (add command after `git_status` at ~line 306)
- Modify: `src-tauri/src/main.rs:22-51` (register new command in `generate_handler!`)
- Modify: `src-tauri/src/git_ops.rs` (no changes needed -- `show_file_at_commit` exists)

**Step 1: Add `git_show_file` Tauri command to `commands.rs`**

Add after the `git_status` command (line 306):

```rust
#[tauri::command]
pub fn git_show_file(
    state: tauri::State<'_, AppState>,
    path: String,
    commit: String,
) -> Result<String, AppError> {
    let repo = state.repo.lock().map_err(|_| AppError::Custom("Internal lock error".into()))?;
    crate::git_ops::show_file_at_commit(&*repo, &path, &commit)
}
```

**Step 2: Register in `main.rs`**

Add `commands::git_show_file,` to the `generate_handler!` macro after `commands::git_status,` (line 38).

**Step 3: Add unit test for `show_file_at_commit`**

Add to `src-tauri/src/git_ops.rs` (in a `#[cfg(test)] mod tests` block at the end):

```rust
#[cfg(test)]
mod tests {
    use super::*;
    use std::fs;
    use git2::{Repository, Signature};

    fn setup_test_repo() -> (tempfile::TempDir, Repository) {
        let dir = tempfile::tempdir().unwrap();
        let repo = Repository::init(dir.path()).unwrap();

        // Create an initial commit with a test file
        let file_path = dir.path().join("test.md");
        fs::write(&file_path, "version 1").unwrap();

        let mut index = repo.index().unwrap();
        index.add_path(Path::new("test.md")).unwrap();
        index.write().unwrap();
        let tree_id = index.write_tree().unwrap();
        let tree = repo.find_tree(tree_id).unwrap();
        let sig = Signature::now("Test", "test@test.com").unwrap();
        repo.commit(Some("HEAD"), &sig, &sig, "initial", &tree, &[]).unwrap();

        (dir, repo)
    }

    #[test]
    fn test_show_file_at_commit() {
        let (_dir, repo) = setup_test_repo();
        let head = repo.head().unwrap().peel_to_commit().unwrap();
        let hash = head.id().to_string();

        let content = show_file_at_commit(&repo, "test.md", &hash).unwrap();
        assert_eq!(content, "version 1");
    }

    #[test]
    fn test_show_file_at_commit_invalid_path() {
        let (_dir, repo) = setup_test_repo();
        let head = repo.head().unwrap().peel_to_commit().unwrap();
        let hash = head.id().to_string();

        let result = show_file_at_commit(&repo, "nonexistent.md", &hash);
        assert!(result.is_err());
    }

    #[test]
    fn test_show_file_at_commit_invalid_ref() {
        let (_dir, repo) = setup_test_repo();
        let result = show_file_at_commit(&repo, "test.md", "0000000");
        assert!(result.is_err());
    }
}
```

**Verification:**
```bash
cd src-tauri && cargo test git_ops::tests -- --nocapture
cd src-tauri && cargo check
```

**Commit:** `Add git_show_file Tauri command for retrieving file content at a specific commit`

---

## Task 2: Frontend -- IPC and compare store

**Files:**
- Modify: `src/lib/ipc.ts` (add `gitShowFile` call)
- Modify: `src/lib/types.ts` (add `CompareState` interface)
- Create: `src/lib/stores/compare.ts` (compare state management)

**Step 1: Add `CompareState` type to `src/lib/types.ts`**

Add after the `DiffLine` interface (line 64):

```typescript
export interface CompareVersion {
  hash: string;
  label: string;
  content: string;
}

export interface CompareState {
  visible: boolean;
  path: string;
  commitA: CompareVersion;
  commitB: CompareVersion;
}
```

**Step 2: Add `gitShowFile` to `src/lib/ipc.ts`**

Add after `gitStatus` (line 72):

```typescript
  gitShowFile: (path: string, commit: string) =>
    call<string>("git_show_file", { path, commit }),
```

Also update the type imports at top of file to include `CompareState` (not strictly needed for IPC, but keep types co-located in the imports).

**Step 3: Create `src/lib/stores/compare.ts`**

```typescript
import { writable, get } from "svelte/store";
import type { CompareState, CompareVersion, CommitEntry } from "../types";
import { api } from "../ipc";
import { activeFile, fileHistory, editorContent } from "./editor";
import { addToast } from "./toast";

const EMPTY_VERSION: CompareVersion = { hash: "", label: "", content: "" };

const initialState: CompareState = {
  visible: false,
  path: "",
  commitA: { ...EMPTY_VERSION },
  commitB: { ...EMPTY_VERSION },
};

export const compareState = writable<CompareState>({ ...initialState });

/** Selection mode: null = not selecting, "a" = picked A waiting for B */
export const compareSelectionMode = writable<"a" | null>(null);
export const pendingCommitA = writable<CommitEntry | null>(null);

/**
 * Open the compare view with two commits.
 * Pass "WORKING" as commitHash to use the current editor content.
 */
export async function openCompare(
  path: string,
  commitA: { hash: string; label: string },
  commitB: { hash: string; label: string },
): Promise<void> {
  try {
    const [contentA, contentB] = await Promise.all([
      commitA.hash === "WORKING"
        ? Promise.resolve(get(editorContent))
        : api.gitShowFile(path, commitA.hash),
      commitB.hash === "WORKING"
        ? Promise.resolve(get(editorContent))
        : api.gitShowFile(path, commitB.hash),
    ]);

    compareState.set({
      visible: true,
      path,
      commitA: { ...commitA, content: contentA },
      commitB: { ...commitB, content: contentB },
    });
  } catch (err) {
    console.error("Failed to load versions for comparison:", err);
    addToast("Failed to load versions", "error");
  }
}

export function closeCompare(): void {
  compareState.set({ ...initialState });
  compareSelectionMode.set(null);
  pendingCommitA.set(null);
}

/**
 * Handle a commit being clicked in compare-selection mode.
 * First click sets commit A, second click sets commit B and opens the view.
 */
export function handleCompareSelect(commit: CommitEntry): void {
  const mode = get(compareSelectionMode);
  const file = get(activeFile);
  if (!file) return;

  if (mode === null) {
    // First click: select as version A
    pendingCommitA.set(commit);
    compareSelectionMode.set("a");
    addToast(`Selected version A: ${commit.hash.slice(0, 7)}. Now pick version B.`, "info", 3000);
  } else {
    // Second click: select as version B and open
    const a = get(pendingCommitA);
    if (!a) return;

    openCompare(
      file.path,
      { hash: a.hash, label: `${a.hash.slice(0, 7)} - ${a.message}` },
      { hash: commit.hash, label: `${commit.hash.slice(0, 7)} - ${commit.message}` },
    );

    compareSelectionMode.set(null);
    pendingCommitA.set(null);
  }
}

/** Compare a specific commit against the current working version. */
export function compareWithCurrent(commit: CommitEntry): void {
  const file = get(activeFile);
  if (!file) return;

  openCompare(
    file.path,
    { hash: commit.hash, label: `${commit.hash.slice(0, 7)} - ${commit.message}` },
    { hash: "WORKING", label: "Current (working)" },
  );
}
```

**Verification:**
```bash
npm run check
```

**Commit:** `Add compare store with IPC binding and version selection state management`

---

## Task 3: Frontend -- CompareView component

**Files:**
- Create: `src/lib/components/CompareView.svelte`

**Important:** `@codemirror/merge` exposes `MergeView` which creates a two-pane diff editor. It manages its own DOM -- we create a container div and mount the MergeView into it on mount.

**Step 1: Create `src/lib/components/CompareView.svelte`**

```svelte
<script lang="ts">
  import { onMount, onDestroy } from "svelte";
  import { compareState, closeCompare } from "../stores/compare";
  import { promptcaseTheme, promptcaseHighlighting } from "../codemirror/theme";

  // Lazy-load @codemirror/merge and dependencies
  let container: HTMLDivElement;
  let mergeViewInstance: any = null;

  onMount(async () => {
    const [{ MergeView }, { EditorView }, { EditorState }, { markdown }] =
      await Promise.all([
        import("@codemirror/merge"),
        import("@codemirror/view"),
        import("@codemirror/state"),
        import("@codemirror/lang-markdown"),
      ]);

    const state = $compareState;

    const sharedExtensions = [
      EditorView.editable.of(false),
      EditorState.readOnly.of(true),
      markdown(),
      promptcaseTheme,
      promptcaseHighlighting,
      EditorView.lineWrapping,
    ];

    mergeViewInstance = new MergeView({
      a: {
        doc: state.commitA.content,
        extensions: sharedExtensions,
      },
      b: {
        doc: state.commitB.content,
        extensions: sharedExtensions,
      },
      parent: container,
      collapseUnchanged: { margin: 3, minSize: 4 },
      gutter: true,
    });
  });

  onDestroy(() => {
    if (mergeViewInstance) {
      mergeViewInstance.destroy();
      mergeViewInstance = null;
    }
  });

  function handleKeydown(e: KeyboardEvent) {
    if (e.key === "Escape") {
      e.preventDefault();
      closeCompare();
    }
  }
</script>

<svelte:window on:keydown={handleKeydown} />

<div class="compare-overlay">
  <div class="compare-header">
    <div class="version-info version-a">
      <span class="version-badge">A</span>
      <span class="version-label">{$compareState.commitA.label}</span>
    </div>
    <div class="compare-actions">
      <span class="compare-path">{$compareState.path}</span>
      <button class="close-btn" onclick={closeCompare} title="Close (Esc)">
        &times;
      </button>
    </div>
    <div class="version-info version-b">
      <span class="version-badge">B</span>
      <span class="version-label">{$compareState.commitB.label}</span>
    </div>
  </div>

  <div class="compare-body" bind:this={container}></div>
</div>

<style>
  .compare-overlay {
    position: absolute;
    inset: 0;
    z-index: 50;
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
    gap: var(--space-3);
    flex-shrink: 0;
  }
  .version-info {
    display: flex;
    align-items: center;
    gap: var(--space-2);
    flex: 1;
    min-width: 0;
  }
  .version-b {
    justify-content: flex-end;
  }
  .version-badge {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 20px;
    height: 20px;
    border-radius: var(--radius-sm);
    font-size: var(--font-size-xs);
    font-weight: var(--font-weight-semibold);
    flex-shrink: 0;
  }
  .version-a .version-badge {
    background: rgba(255, 69, 58, 0.15);
    color: #ff453a;
  }
  .version-b .version-badge {
    background: rgba(48, 209, 88, 0.15);
    color: #30d158;
  }
  .version-label {
    font-size: var(--font-size-sm);
    color: var(--text-secondary);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .compare-actions {
    display: flex;
    align-items: center;
    gap: var(--space-2);
    flex-shrink: 0;
  }
  .compare-path {
    font-family: var(--font-mono);
    font-size: var(--font-size-xs);
    color: var(--text-tertiary);
  }
  .close-btn {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 28px;
    height: 28px;
    border-radius: var(--radius-sm);
    font-size: 18px;
    color: var(--text-secondary);
    transition: background var(--transition-fast), color var(--transition-fast);
  }
  .close-btn:hover {
    background: rgba(255, 255, 255, 0.08);
    color: var(--text-primary);
  }
  .compare-body {
    flex: 1;
    overflow: auto;
    min-height: 0;
  }
  /* Style the MergeView panes */
  .compare-body :global(.cm-mergeView) {
    height: 100%;
  }
  .compare-body :global(.cm-mergeViewEditor) {
    height: 100%;
    overflow: auto;
  }
  /* Diff coloring: deletions (left side) */
  .compare-body :global(.cm-deletedChunk) {
    background: rgba(255, 69, 58, 0.08);
  }
  .compare-body :global(.cm-changedLine.cm-deletedLine) {
    background: rgba(255, 69, 58, 0.12);
  }
  .compare-body :global(.cm-changedText.cm-deletedText) {
    background: rgba(255, 69, 58, 0.25);
  }
  /* Diff coloring: insertions (right side) */
  .compare-body :global(.cm-insertedChunk) {
    background: rgba(48, 209, 88, 0.08);
  }
  .compare-body :global(.cm-changedLine.cm-insertedLine) {
    background: rgba(48, 209, 88, 0.12);
  }
  .compare-body :global(.cm-changedText.cm-insertedText) {
    background: rgba(48, 209, 88, 0.25);
  }
  /* Collapse unchanged regions */
  .compare-body :global(.cm-collapsedLines) {
    background: var(--bg-tertiary);
    color: var(--text-quaternary);
    font-size: var(--font-size-xs);
    padding: var(--space-1) var(--space-2);
    text-align: center;
    cursor: pointer;
  }
</style>
```

**Key implementation notes on `@codemirror/merge`:**
- `MergeView` takes `a` (original) and `b` (modified) configs, each with `doc` and `extensions`
- `collapseUnchanged: { margin: 3, minSize: 4 }` folds regions of 4+ unchanged lines, showing 3 lines of context
- `gutter: true` shows a connecting gutter between panes that visualizes which lines changed
- Both editors are set to `readOnly` + `editable.of(false)` since this is view-only
- The MergeView creates its own DOM structure inside the `parent` element -- we do not create two separate EditorViews

**Verification:**
```bash
npm run check
```

**Commit:** `Add CompareView component with @codemirror/merge split-pane diff visualization`

---

## Task 4: Frontend -- HistoryPanel integration

**Files:**
- Modify: `src/lib/components/HistoryPanel.svelte`

**Step 1: Add imports and compare logic**

Add imports at the top of the `<script>` block:

```typescript
import {
  compareSelectionMode,
  pendingCommitA,
  handleCompareSelect,
  compareWithCurrent,
  closeCompare,
} from "../stores/compare";
```

**Step 2: Add a "Compare" toolbar section**

Add after the `<h3>History</h3>` heading (line 34), before the `{#if}`:

```svelte
<div class="compare-toolbar">
  {#if $compareSelectionMode === "a"}
    <div class="compare-hint">
      Pick version B (or <button class="link-btn" onclick={() => { compareSelectionMode.set(null); pendingCommitA.set(null); }}>cancel</button>)
    </div>
  {:else}
    <button class="compare-start-btn" onclick={() => compareSelectionMode.set(null)}>
      Compare versions
    </button>
  {/if}
</div>
```

**Step 3: Add compare actions to each commit entry**

Replace the existing `<button class="history-entry" ...>` block (lines 43-56) with:

```svelte
{#each $fileHistory as commit}
  <button
    class="history-entry"
    class:starred={isStarred(commit)}
    class:selected-a={$pendingCommitA?.hash === commit.hash}
    onclick={() => {
      if ($compareSelectionMode !== null) {
        handleCompareSelect(commit);
      }
    }}
  >
    <div class="entry-header">
      {#if isStarred(commit)}
        <span class="star">*</span>
      {/if}
      <span class="date">{formatDate(commit.date)}</span>
      <span class="hash">{commit.hash.slice(0, 7)}</span>
    </div>
    <div class="message">{commit.message}</div>
    {#if isStarred(commit) && getStarLabel(commit)}
      <div class="star-label">{getStarLabel(commit)}</div>
    {/if}
    {#if $compareSelectionMode === null}
      <div class="entry-actions">
        <button
          class="action-btn"
          title="Compare with current"
          onclick|stopPropagation={() => compareWithCurrent(commit)}
        >
          Diff
        </button>
      </div>
    {/if}
  </button>
{/each}
```

**Step 4: Add styles for new elements**

Append to `<style>`:

```css
.compare-toolbar {
  display: flex;
  align-items: center;
  margin-bottom: var(--space-2);
}
.compare-start-btn {
  font-size: var(--font-size-xs);
  color: var(--text-tertiary);
  padding: var(--space-1) var(--space-2);
  border-radius: var(--radius-sm);
  transition: background var(--transition-fast), color var(--transition-fast);
}
.compare-start-btn:hover {
  background: rgba(255, 255, 255, 0.06);
  color: var(--text-secondary);
}
.compare-hint {
  font-size: var(--font-size-xs);
  color: var(--color-info);
  padding: var(--space-1) 0;
}
.link-btn {
  color: var(--color-info);
  text-decoration: underline;
  font-size: var(--font-size-xs);
  background: none;
  border: none;
  cursor: pointer;
  padding: 0;
}
.history-entry.selected-a {
  border-left: 2px solid var(--color-info);
  background: rgba(10, 132, 255, 0.06);
}
.entry-actions {
  display: flex;
  gap: var(--space-1);
  margin-top: var(--space-1);
  opacity: 0;
  transition: opacity var(--transition-fast);
}
.history-entry:hover .entry-actions {
  opacity: 1;
}
.action-btn {
  font-size: var(--font-size-xs);
  color: var(--text-tertiary);
  padding: var(--space-1) var(--space-2);
  border-radius: var(--radius-sm);
  transition: background var(--transition-fast), color var(--transition-fast);
}
.action-btn:hover {
  background: rgba(10, 132, 255, 0.15);
  color: var(--color-info);
}
```

**UX flow:**
1. Hover a commit in HistoryPanel -> "Diff" button appears -> click it -> compare that commit vs current working content
2. Click "Compare versions" -> enters selection mode -> click first commit (highlights as version A) -> click second commit -> CompareView opens with both versions
3. Escape or cancel exits selection mode / closes CompareView

**Verification:**
```bash
npm run check
```

**Commit:** `Add compare buttons to HistoryPanel with version A/B selection flow`

---

## Task 5: Frontend -- App integration

**Files:**
- Modify: `src/App.svelte` (show CompareView overlay when active)
- Modify: `src/lib/stores/keybindings.ts` (register Escape action if not already handled)

**Step 1: Import CompareView and store in `src/App.svelte`**

Add import:

```typescript
import CompareView from "./lib/components/CompareView.svelte";
import { compareState, closeCompare } from "./lib/stores/compare";
```

**Step 2: Add CompareView overlay inside the editor-area**

Replace the `.editor-area` div (lines 73-91) with:

```svelte
<div class="editor-area">
  {#if $compareState.visible}
    <CompareView />
  {:else if $activeFile}
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
```

This places CompareView as the highest-priority view in the editor area. When `compareState.visible` is true, it replaces the editor entirely. The Escape key handler is already in CompareView itself (Task 3), so no separate keybinding registration is needed.

**Step 3: Register a keybinding action for closing compare (optional but nice)**

In the `onMount` block of `App.svelte`, add:

```typescript
registerAction("closeCompare", () => {
  if (get(compareState).visible) {
    closeCompare();
  }
});
```

This lets users bind a custom key to close compare (in addition to the built-in Escape handler in CompareView).

**Verification:**
```bash
npm run check
npm run build
```

**Full E2E test scenario (manual):**
1. Open a prompt that has commit history
2. In the History panel on the inspector, hover a commit and click "Diff" -> CompareView opens showing that commit vs current working content side-by-side
3. Verify the left pane shows the historical version, right pane shows current content
4. Verify diff highlighting: red for removed lines, green for added lines
5. Verify unchanged regions are collapsed with a clickable "N lines" indicator
6. Press Escape -> CompareView closes, editor returns to normal
7. Click "Compare versions" in History panel -> click one commit (it highlights blue) -> click a second commit -> CompareView opens with those two versions
8. Close and verify editor state is preserved (no content loss, no unsaved changes flag changed)

**Commit:** `Integrate CompareView overlay into App.svelte with keybinding support`
