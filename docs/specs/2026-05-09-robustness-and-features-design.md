# Promptcase Robustness & Feature Push — Design Spec

**Date:** 2026-05-09
**Goal:** Take Promptcase from "nice side project" to "essential tool" for developers working with LLMs.
**Approach:** 8 parallel work streams covering table stakes, unique features, and hardening.

---

## Stream 1: Editor Essentials

**Problem:** No find/replace or multi-cursor support in the editor despite CodeMirror supporting both natively.

**Design:**
- Wire `@codemirror/search` extension into the editor (find panel, replace panel, search highlighting)
- Enable multi-cursor via `Cmd+D` (select next occurrence) using CodeMirror's built-in `selectNextOccurrence`
- Register `Cmd+F` (find), `Cmd+H` (find/replace), `Cmd+D` (select next) in keybindings store
- Theme already has `.cm-searchMatch` and `.cm-panels` styles — no new CSS needed

**Files:**
- Modify: `src/lib/codemirror/extensions.ts` or wherever CodeMirror extensions are composed
- Modify: `src/lib/stores/keybindings.ts` (register new shortcuts)
- Modify: Editor component to include search extension

**Acceptance Criteria:**
- Cmd+F opens find panel styled to match app theme
- Cmd+H opens find/replace panel
- Cmd+D selects next occurrence for multi-cursor editing
- Search highlights match existing `.cm-searchMatch` styling

---

## Stream 2: File Watcher

**Problem:** Changes made outside the app (git pull, external editors, CLI operations) are invisible until manual reload.

**Design:**
- Add `notify` crate (v7) to Rust dependencies for cross-platform filesystem watching
- New `src-tauri/src/watcher.rs` module:
  - Watch the repo directory recursively for `.md` file create/modify/delete events
  - Debounce events with 500ms window to avoid thrashing during git operations
  - Track in-flight writes from the app itself to skip self-triggered events
  - Emit `files-changed` Tauri event to frontend with list of changed paths
- Frontend listener in `src/lib/stores/files.ts`:
  - On `files-changed` event, refresh file list via `loadFiles()`
  - If the currently-open file is in the changed list, show toast: "File changed externally" with Reload/Ignore buttons
  - On reload, re-read the file and update editor content
- Watcher starts on app launch, stops on exit
- Tauri commands: `start_watcher`, `stop_watcher` (called from setup/teardown)

**Files:**
- Create: `src-tauri/src/watcher.rs`
- Modify: `src-tauri/Cargo.toml` (add `notify = "7"`)
- Modify: `src-tauri/src/main.rs` (add module, register commands)
- Modify: `src-tauri/src/commands.rs` (watcher commands)
- Modify: `src/lib/stores/files.ts` (event listener)
- Modify: `src/App.svelte` (init/destroy watcher listener)

**Acceptance Criteria:**
- Editing a `.md` file externally triggers sidebar refresh within 1 second
- Git pull with new files shows them in sidebar without manual reload
- Currently-open file changed externally shows reload prompt
- App's own saves do NOT trigger the watcher

---

## Stream 3: Crash Recovery

**Problem:** If the app crashes or is force-quit with unsaved changes, all edits are lost.

**Design:**
- New `src-tauri/src/recovery.rs` module:
  - Recovery file at `<repo>/.promptcase-recovery.json` (gitignored)
  - Format: `{ "buffers": [{ "path": string, "content": string, "timestamp": ISO8601 }] }`
  - `save_recovery(path, content)` — upsert buffer entry
  - `clear_recovery(path)` — remove buffer entry (called on successful save)
  - `load_recovery()` — read recovery file, return buffers newer than last git commit
  - `clear_all_recovery()` — delete recovery file (called on clean exit)
- Frontend integration:
  - Every 3 seconds, if `hasUnsavedChanges` is true, call `save_recovery` with current editor content
  - On successful save, call `clear_recovery` for that file
  - On app mount, call `load_recovery` — if buffers exist, show RecoveryDialog
- New `src/lib/components/RecoveryDialog.svelte`:
  - Shows list of recoverable files with timestamps
  - "Restore All" / "Discard" buttons
  - Restore opens each file with recovered content as unsaved changes

**Files:**
- Create: `src-tauri/src/recovery.rs`
- Create: `src/lib/components/RecoveryDialog.svelte`
- Modify: `src-tauri/src/main.rs` (add module)
- Modify: `src-tauri/src/commands.rs` (recovery commands)
- Modify: `src/lib/stores/editor.ts` (periodic save, clear on save)
- Modify: `src/App.svelte` (check recovery on mount)
- Modify: `.gitignore` in repo template (add `.promptcase-recovery.json`)

**Acceptance Criteria:**
- Force-quitting with unsaved changes → next launch offers recovery
- Recovery restores exact editor content
- Clean save clears recovery for that file
- Clean app exit clears all recovery data
- Recovery file is gitignored

---

## Stream 4: Onboarding

**Problem:** First-time users see an empty app with no guidance on what to do or how the app works.

**Design:**
- Add `onboarding_completed: bool` field to `RepoConfig` (default false)
- On first launch (when `onboarding_completed` is false), show `WelcomeScreen` overlay
- WelcomeScreen content:
  - App logo/name and one-line description
  - 3-4 feature highlights with icons (template composition, git versioning, token counting, prompt testing)
  - "Get Started" button that:
    1. Installs sample prompts into the repo
    2. Sets `onboarding_completed: true`
    3. Opens the first sample prompt in the editor
  - "Skip" link for experienced users (still sets onboarding_completed)
- Sample prompts:
  - `getting-started.md` — explains frontmatter, variables, tags with inline examples
  - `code-review.md` — practical prompt with `{{language}}` and `{{code}}` variables
  - `_templates/system-prompt.md` — reusable fragment demonstrating `{{> system-prompt}}`
  - `summarize.md` — simple prompt users can test immediately with the Test panel

**Files:**
- Create: `src/lib/components/WelcomeScreen.svelte`
- Create: sample prompt files (embedded as string constants or in a resources directory)
- Modify: `src-tauri/src/types.rs` (add `onboarding_completed` to RepoConfig)
- Modify: `src-tauri/src/commands.rs` (install_samples command)
- Modify: `src/App.svelte` (show WelcomeScreen when not onboarded)

**Acceptance Criteria:**
- First launch shows welcome screen
- "Get Started" installs 4 sample prompts and opens the first one
- Subsequent launches go straight to the editor
- "Skip" bypasses sample installation but still marks onboarding complete
- Sample prompts demonstrate all key features (variables, includes, tags)

---

## Stream 5: CLI Tool

**Problem:** No way to use prompts programmatically from scripts, CI pipelines, or the terminal. This is the #1 gap for developer adoption.

**Architecture — Cargo Workspace:**
```
/Cargo.toml              (workspace members: core, src-tauri, cli)
/core/Cargo.toml         (promptcase-core library)
/core/src/lib.rs         (re-exports all modules)
/core/src/config.rs      (moved from src-tauri/src/)
/core/src/file_ops.rs    (moved from src-tauri/src/)
/core/src/git_ops.rs     (moved from src-tauri/src/)
/core/src/template.rs    (moved from src-tauri/src/)
/core/src/linter.rs      (moved from src-tauri/src/)
/core/src/tokenizer.rs   (moved from src-tauri/src/)
/core/src/search.rs      (moved from src-tauri/src/)
/core/src/frontmatter.rs (moved from src-tauri/src/)
/core/src/types.rs       (moved from src-tauri/src/)
/core/src/error.rs       (moved from src-tauri/src/)
/src-tauri/Cargo.toml    (depends on promptcase-core + tauri)
/src-tauri/src/main.rs   (Tauri app — commands, state, LLM)
/cli/Cargo.toml          (depends on promptcase-core + clap)
/cli/src/main.rs         (CLI binary)
```

**CLI Commands:**
```
promptcase list [--tag TAG] [--search QUERY]     List prompts with optional filtering
promptcase show <name>                           Print raw prompt content
promptcase resolve <name> [--var key=value]...   Resolve template + variables, print result
promptcase lint [<name>]                         Lint one or all prompts
promptcase tokens <name> [--model MODEL]         Count tokens for resolved prompt
promptcase export <name> [-o FILE]               Export single prompt
promptcase test <name> --provider PROVIDER       Run prompt against LLM (requires API key env var)
promptcase eval <name>                           Run evaluation test cases from frontmatter
promptcase init [PATH]                           Initialize a new promptcase repo
```

**Files:**
- Create: `/Cargo.toml` (workspace root)
- Create: `/core/Cargo.toml`, `/core/src/lib.rs`
- Move: 10 modules from `src-tauri/src/` → `core/src/`
- Modify: `src-tauri/Cargo.toml` (depend on `promptcase-core`)
- Modify: `src-tauri/src/*.rs` (use `promptcase_core::` imports)
- Create: `/cli/Cargo.toml`, `/cli/src/main.rs`
- Add: `clap` dependency for CLI arg parsing

**Acceptance Criteria:**
- `cargo build -p promptcase-cli` produces a standalone binary
- `promptcase list` shows all prompts in `~/.promptcase`
- `promptcase resolve my-prompt --var language=python` outputs resolved text
- `promptcase lint` reports issues with exit code 1 on errors
- `promptcase tokens my-prompt` shows token counts
- Desktop app still builds and works unchanged after workspace restructure

---

## Stream 6: Prompt Evaluation

**Problem:** No way to systematically test whether a prompt produces the expected output. Users manually run prompts and eyeball results.

**Design — Frontmatter format:**
```yaml
tests:
  - name: "handles code review"
    variables:
      language: python
      code: "def add(a, b): return a + b"
    assertions:
      - type: contains
        value: "function"
      - type: max_tokens
        value: 500
  - name: "handles empty input"
    variables:
      code: ""
    assertions:
      - type: contains
        value: "no code"
```

**Assertion types:**
- `contains` — response includes substring (case-insensitive)
- `not_contains` — response does NOT include substring
- `matches_regex` — response matches regex pattern
- `max_tokens` — response token count ≤ value
- `min_tokens` — response token count ≥ value
- `starts_with` — response begins with string
- `max_latency_ms` — response completes within time limit

**Backend:**
- New `core/src/eval.rs`: `TestCase`, `Assertion`, `EvalResult` types
- `run_eval` function: resolve prompt with test variables → send to LLM → check assertions → return results
- New Tauri command `run_eval` that runs all test cases and returns results via events (streaming, one result per test case)

**Frontend:**
- New `src/lib/components/EvalPanel.svelte` as a tab in Inspector (alongside Info, Test)
- Shows test cases defined in frontmatter
- "Run All" button to execute all tests
- Per-test-case result: green checkmark / red X with details
- Summary: "3/4 passed" with timing

**Files:**
- Create: `core/src/eval.rs`
- Create: `src/lib/components/EvalPanel.svelte`
- Modify: `core/src/types.rs` (TestCase, Assertion, EvalResult types)
- Modify: `core/src/frontmatter.rs` (parse tests from frontmatter)
- Modify: `src-tauri/src/commands.rs` (run_eval command)
- Modify: `src/lib/components/Inspector.svelte` (add Eval tab)
- Modify: `src/lib/ipc.ts` (runEval binding)
- Modify: `src/lib/stores/testing.ts` (eval state management)

**Acceptance Criteria:**
- Tests defined in frontmatter YAML parse correctly
- `run_eval` executes each test case against configured LLM provider
- Each assertion type produces correct pass/fail
- EvalPanel shows results with green/red indicators
- CLI `promptcase eval <name>` runs same evaluation from terminal

---

## Stream 7: Test Suite

**Problem:** Very limited test coverage — 20 frontend tests, no tests for template resolution, linting, git operations, or file operation edge cases. Regressions are likely.

**Design:**
- Add comprehensive unit tests to core Rust modules
- Use `tempfile` crate for isolated test directories (already in dev-dependencies)
- Each module gets its own test section

**Test plan by module:**

| Module | Tests |
|---|---|
| `template.rs` | Variable substitution, include resolution, nested includes (2+ levels), circular include detection, missing fragment error, variable in included fragment, empty body, frontmatter-only file |
| `linter.rs` | Each of the 11 lint rules individually, multiple rules on same file, severity levels, clean file returns empty results |
| `file_ops.rs` | Path traversal prevention (`../` attacks), Unicode filenames, empty filename, concurrent create (dedup), file with no frontmatter, malformed YAML frontmatter |
| `git_ops.rs` | Commit on empty repo, diff with no changes, log with no commits, restore to specific commit, large diff handling |
| `frontmatter.rs` | Valid frontmatter, missing frontmatter defaults, extra fields ignored, Unicode in frontmatter, empty file, test case parsing |
| `search.rs` | Index build, search by query, search by tag, reindex after file change, empty index, special characters in query |
| `tokenizer.rs` | Token count for empty string, known test strings, multiple models |

**Files:**
- Modify: All `core/src/*.rs` files (add `#[cfg(test)] mod tests` blocks)
- Potentially new integration test files in `core/tests/`

**Acceptance Criteria:**
- All core modules have unit tests
- `cargo test -p promptcase-core` passes with 80%+ coverage
- Edge cases (empty input, Unicode, path traversal) are covered
- CI can run `cargo test` as a gate

---

## Stream 8: Accessibility

**Problem:** Screen reader users cannot navigate the sidebar tree, context menus lack proper ARIA roles, async operations have no announcements, and drag-and-drop has no keyboard alternative.

**Design:**

**Sidebar Tree:**
- Add `role="tree"` to the sidebar file list container
- Add `role="treeitem"` to each file and folder row in FolderTree.svelte
- Add `aria-expanded` to folder rows (matches existing expanded state)
- Add `aria-selected` to the active file
- Add `aria-level` based on nesting depth

**Context Menus:**
- Add `role="menu"` to FileContextMenu and FolderContextMenu containers
- Add `role="menuitem"` to each menu option
- Add arrow key navigation between menu items

**Async Announcements:**
- Add `aria-live="polite"` region to ToastContainer
- Announce: file saved, import complete, export complete, lint results

**Keyboard DnD Alternative:**
- When files are selected, `Cmd+Shift+M` opens the existing MoveToFolderDialog
- This provides a keyboard-accessible alternative to drag-and-drop

**Other:**
- `aria-label` on editor gutter, toolbar buttons, and icon-only buttons
- Skip-to-content link (hidden until focused) for keyboard users

**Files:**
- Modify: `src/lib/components/FolderTree.svelte`
- Modify: `src/lib/components/Sidebar.svelte`
- Modify: `src/lib/components/FileContextMenu.svelte`
- Modify: `src/lib/components/FolderContextMenu.svelte`
- Modify: `src/lib/components/ToastContainer.svelte`
- Modify: `src/lib/components/StatusBar.svelte`
- Modify: `src/lib/stores/keybindings.ts` (Cmd+Shift+M)
- Modify: `src/App.svelte` (skip link)

**Acceptance Criteria:**
- VoiceOver can navigate the sidebar tree structure
- Context menus are navigable with arrow keys
- Toasts are announced by screen readers
- Cmd+Shift+M opens move dialog as DnD alternative
- All icon-only buttons have aria-labels

---

## Dependencies Between Streams

```
Stream 5 (CLI/Workspace) ──blocks──▶ Stream 6 (Eval — needs core crate)
                         ──blocks──▶ Stream 7 (Tests — tests go in core crate)
All other streams are independent.
```

Streams 1, 2, 3, 4, 8 can run in parallel with no dependencies.
Streams 6 and 7 are blocked by Stream 5 (workspace restructure).

---

## Out of Scope

- Custom theme engine (dark/light is sufficient)
- Collaboration / sharing features
- Plugin system
- Cloud sync
- Auto-updater (handled by release pipeline)
- Performance optimizations (virtual scrolling, lazy loading) — follow-up
