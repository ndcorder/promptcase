# Debounced Commits with Diff-Based Messages

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Replace instant auto-commits on every save with debounced commits that use diff-based descriptions, and provide a hook point for future LLM-generated messages.

**Architecture:** `saveFile()` writes to disk immediately (no data loss) but does not commit. A per-file debounce timer (default 5s) fires after the user stops saving, generating a commit message from the structured diff (frontmatter + body changes). Two new Tauri commands (`generate_commit_message` and `commit_file`) decouple writing from committing. Create/delete/move operations keep their immediate commits.

**Tech Stack:** Rust (git2, serde_yaml), TypeScript (Svelte stores), existing Tauri IPC.

---

### Task 1: Remove auto-commit from write_file

Only `write_file` changes — `create_file`, `delete_file`, `move_file` keep their immediate auto-commits since those are discrete, intentional actions.

**Files:**
- Modify: `src-tauri/src/file_ops.rs:104-133`

**Step 1: Write the failing test**

```rust
// In src-tauri/src/file_ops.rs, inside mod tests
#[test]
fn test_write_file_does_not_auto_commit() {
    let tmp = TempDir::new().unwrap();
    let root = tmp.path();
    let repo = init_repo(root).unwrap();
    let config = test_config(true); // auto_commit = true

    // Create file (this DOES auto-commit)
    create_file(root, "test.md", "Test", "prompt", None, Some(&repo), &config).unwrap();
    let log_before = crate::git_ops::git_log(&repo, Some("test.md"), 50).unwrap();
    assert_eq!(log_before.len(), 1);

    // Write/update file — should NOT create a new commit
    let file = read_file(root, "test.md").unwrap();
    let mut fm = file.frontmatter.clone();
    fm.title = "Updated".to_string();
    write_file(root, "test.md", &fm, "New body\n", Some(&repo), &config).unwrap();

    let log_after = crate::git_ops::git_log(&repo, Some("test.md"), 50).unwrap();
    assert_eq!(log_after.len(), 1, "write_file should not auto-commit");
}
```

**Step 2: Run test to verify it fails**

Run: `cd src-tauri && cargo test test_write_file_does_not_auto_commit -- --nocapture`
Expected: FAIL — `log_after.len()` is 2 because write_file currently auto-commits.

**Step 3: Remove auto_commit from write_file**

In `src-tauri/src/file_ops.rs`, function `write_file`, remove the auto_commit block:

```rust
pub fn write_file(
    repo_root: &Path,
    file_path: &str,
    frontmatter: &PromptFrontmatter,
    body: &str,
    _repo: Option<&Repository>,
    _config: &RepoConfig,
) -> Result<(), AppError> {
    let full = safe_path(repo_root, file_path)?;

    if let Some(parent) = full.parent() {
        fs::create_dir_all(parent)?;
    }

    let content = serialize_prompt_file(frontmatter, body)?;
    fs::write(&full, &content)?;

    Ok(())
}
```

Note: `repo` and `config` params become unused. Keep them with `_` prefix for now — Task 4 will clean up the signature when the Tauri command stops passing the repo.

**Step 4: Run test to verify it passes**

Run: `cd src-tauri && cargo test test_write_file_does_not_auto_commit -- --nocapture`
Expected: PASS

**Step 5: Run all tests to check for regressions**

Run: `cd src-tauri && cargo test`
Expected: Some existing tests that assumed write_file auto-commits may fail. Update them:
- `test_create_with_auto_commit` — still passes (create_file unchanged)
- `test_delete_with_auto_commit` — still passes
- `test_move_with_auto_commit` — still passes
- Any test that does write_file then checks git_log — update assertion counts

**Step 6: Commit**

```bash
git add src-tauri/src/file_ops.rs
git commit -m "Remove auto-commit from write_file (prep for debounced commits)"
```

---

### Task 2: Add commit_with_message to git_ops

A lower-level version of `auto_commit` that accepts a full message string instead of formatting one from action/title/prefix.

**Files:**
- Modify: `src-tauri/src/git_ops.rs`

**Step 1: Write the failing test**

```rust
#[test]
fn test_commit_with_message() {
    let tmp = TempDir::new().unwrap();
    let repo = init_repo(tmp.path()).unwrap();

    std::fs::write(tmp.path().join("f.txt"), "hello").unwrap();
    let hash = commit_with_message(&repo, &["f.txt"], "My custom message").unwrap();
    assert!(hash.is_some());

    let log = git_log(&repo, None, 10).unwrap();
    assert_eq!(log.len(), 1);
    assert_eq!(log[0].message, "My custom message");
}
```

**Step 2: Run test to verify it fails**

Run: `cd src-tauri && cargo test test_commit_with_message -- --nocapture`
Expected: FAIL — `commit_with_message` doesn't exist yet.

**Step 3: Implement commit_with_message**

```rust
/// Stage the given files and commit with the provided message.
/// Returns the commit hash, or `None` if there was nothing to commit.
pub fn commit_with_message(
    repo: &Repository,
    file_paths: &[&str],
    message: &str,
) -> Result<Option<String>, AppError> {
    let mut index = repo.index()?;
    for fp in file_paths {
        index.add_path(Path::new(fp))?;
    }
    index.write()?;

    let tree_oid = index.write_tree()?;
    let tree = repo.find_tree(tree_oid)?;

    let sig = repo
        .signature()
        .unwrap_or_else(|_| git2::Signature::now("Promptcase", "promptcase@local").unwrap());

    let parent = repo.head().ok().and_then(|h| h.peel_to_commit().ok());
    let parents: Vec<&git2::Commit> = match parent.as_ref() {
        Some(p) => vec![p],
        None => vec![],
    };

    let oid = repo.commit(Some("HEAD"), &sig, &sig, message, &tree, &parents)?;
    Ok(Some(oid.to_string()))
}
```

**Step 4: Run test to verify it passes**

Run: `cd src-tauri && cargo test test_commit_with_message -- --nocapture`
Expected: PASS

**Step 5: Commit**

```bash
git add src-tauri/src/git_ops.rs
git commit -m "Add commit_with_message for custom commit messages"
```

---

### Task 3: Add generate_commit_message to git_ops

Reads the HEAD version and current working tree version of a file, parses frontmatter, and generates a human-readable description of what changed.

**Files:**
- Modify: `src-tauri/src/git_ops.rs`

**Step 1: Write failing tests**

```rust
#[test]
fn test_generate_message_body_change() {
    let tmp = TempDir::new().unwrap();
    let repo = init_repo(tmp.path()).unwrap();
    let root = tmp.path();

    // Create and commit initial version
    std::fs::write(root.join("p.md"), "---\ntitle: Test\ntags: []\n---\nOriginal body").unwrap();
    auto_commit(&repo, &["p.md"], "Create", None, "[pc]").unwrap();

    // Modify body on disk
    std::fs::write(root.join("p.md"), "---\ntitle: Test\ntags: []\n---\nUpdated body with more content").unwrap();

    let msg = generate_commit_message(&repo, root, "p.md").unwrap();
    assert!(msg.contains("Edit"), "Expected 'Edit' in message, got: {msg}");
}

#[test]
fn test_generate_message_tag_change() {
    let tmp = TempDir::new().unwrap();
    let repo = init_repo(tmp.path()).unwrap();
    let root = tmp.path();

    std::fs::write(root.join("p.md"), "---\ntitle: Test\ntags: []\n---\nBody").unwrap();
    auto_commit(&repo, &["p.md"], "Create", None, "[pc]").unwrap();

    std::fs::write(root.join("p.md"), "---\ntitle: Test\ntags:\n  - security\n---\nBody").unwrap();

    let msg = generate_commit_message(&repo, root, "p.md").unwrap();
    assert!(msg.contains("security"), "Expected tag name in message, got: {msg}");
}

#[test]
fn test_generate_message_title_change() {
    let tmp = TempDir::new().unwrap();
    let repo = init_repo(tmp.path()).unwrap();
    let root = tmp.path();

    std::fs::write(root.join("p.md"), "---\ntitle: Old Title\ntags: []\n---\nBody").unwrap();
    auto_commit(&repo, &["p.md"], "Create", None, "[pc]").unwrap();

    std::fs::write(root.join("p.md"), "---\ntitle: New Title\ntags: []\n---\nBody").unwrap();

    let msg = generate_commit_message(&repo, root, "p.md").unwrap();
    assert!(msg.contains("New Title"), "Expected new title in message, got: {msg}");
}

#[test]
fn test_generate_message_new_file() {
    let tmp = TempDir::new().unwrap();
    let repo = init_repo(tmp.path()).unwrap();
    let root = tmp.path();

    // File exists on disk but not in any commit
    std::fs::write(root.join("new.md"), "---\ntitle: Brand New\ntags: []\n---\nBody").unwrap();

    let msg = generate_commit_message(&repo, root, "new.md").unwrap();
    assert!(msg.contains("Brand New"), "Expected title in message, got: {msg}");
}
```

**Step 2: Run tests to verify they fail**

Run: `cd src-tauri && cargo test test_generate_message -- --nocapture`
Expected: FAIL — function doesn't exist.

**Step 3: Implement generate_commit_message**

```rust
/// Generate a human-readable commit message by diffing the HEAD version
/// of a file against the current working tree version.
pub fn generate_commit_message(
    repo: &Repository,
    repo_root: &Path,
    file_path: &str,
) -> Result<String, AppError> {
    use crate::frontmatter::parse_prompt_file;

    // Read current file from disk
    let full_path = repo_root.join(file_path);
    let current_content = std::fs::read_to_string(&full_path)
        .map_err(|e| AppError::Custom(format!("Cannot read file: {e}")))?;
    let current = parse_prompt_file(file_path, &current_content);

    // Try to read the HEAD version
    let old = match show_file_at_commit(repo, file_path, "HEAD") {
        Ok(old_content) => Some(parse_prompt_file(file_path, &old_content)),
        Err(_) => None, // New file, not yet in any commit
    };

    let title = &current.frontmatter.title;

    // New file — no HEAD version exists
    let Some(old) = old else {
        return Ok(format!("Create \"{title}\""));
    };

    let mut changes: Vec<String> = Vec::new();

    // Title change
    if current.frontmatter.title != old.frontmatter.title {
        changes.push(format!("Rename to \"{}\"", current.frontmatter.title));
    }

    // Tag changes
    let added_tags: Vec<&String> = current.frontmatter.tags.iter()
        .filter(|t| !old.frontmatter.tags.contains(t))
        .collect();
    let removed_tags: Vec<&String> = old.frontmatter.tags.iter()
        .filter(|t| !current.frontmatter.tags.contains(t))
        .collect();
    if !added_tags.is_empty() {
        let names: Vec<&str> = added_tags.iter().map(|s| s.as_str()).collect();
        changes.push(format!("Add tag{} {}", if names.len() > 1 { "s" } else { "" },
            names.iter().map(|n| format!("'{n}'")).collect::<Vec<_>>().join(", ")));
    }
    if !removed_tags.is_empty() {
        let names: Vec<&str> = removed_tags.iter().map(|s| s.as_str()).collect();
        changes.push(format!("Remove tag{} {}", if names.len() > 1 { "s" } else { "" },
            names.iter().map(|n| format!("'{n}'")).collect::<Vec<_>>().join(", ")));
    }

    // Body change
    if current.body.trim() != old.body.trim() {
        let old_lines: Vec<&str> = old.body.lines().collect();
        let new_lines: Vec<&str> = current.body.lines().collect();
        let old_len = old_lines.len().max(1);
        let adds = new_lines.iter().filter(|l| !old_lines.contains(l)).count();
        let dels = old_lines.iter().filter(|l| !new_lines.contains(l)).count();

        if (adds + dels) as f64 / old_len as f64 > 0.5 {
            changes.push("Rewrite body".to_string());
        } else {
            changes.push(format!("Edit body (+{adds}/-{dels} lines)"));
        }
    }

    if changes.is_empty() {
        // Only metadata like `modified` timestamp changed
        return Ok(format!("Update \"{title}\""));
    }

    // Join changes: "Edit body, add tag 'security'"
    let desc = changes.join(", ");
    // Lowercase first char of desc for natural reading after title
    let desc_lower = desc[..1].to_lowercase() + &desc[1..];
    Ok(format!("\"{title}\": {desc_lower}"))
}
```

**Step 4: Run tests to verify they pass**

Run: `cd src-tauri && cargo test test_generate_message -- --nocapture`
Expected: PASS

**Step 5: Commit**

```bash
git add src-tauri/src/git_ops.rs
git commit -m "Add generate_commit_message with diff-based descriptions"
```

---

### Task 4: Add new Tauri commands and update IPC

Wire up `generate_commit_message` and `commit_file` as Tauri commands, add them to the frontend API.

**Files:**
- Modify: `src-tauri/src/commands.rs`
- Modify: `src-tauri/src/main.rs`
- Modify: `src/lib/ipc.ts`

**Step 1: Add Tauri commands**

In `src-tauri/src/commands.rs`:

```rust
#[tauri::command]
pub fn generate_commit_message(
    state: tauri::State<'_, AppState>,
    path: String,
) -> Result<String, AppError> {
    let repo = state.repo.lock().map_err(|_| AppError::Custom("Internal lock error".into()))?;
    crate::git_ops::generate_commit_message(&*repo, &state.repo_root, &path)
}

#[tauri::command]
pub fn commit_file(
    state: tauri::State<'_, AppState>,
    path: String,
    message: String,
) -> Result<serde_json::Value, AppError> {
    let repo = state.repo.lock().map_err(|_| AppError::Custom("Internal lock error".into()))?;
    let full_message = format!("{} {}", state.config.commit_prefix, message);
    crate::git_ops::commit_with_message(&*repo, &[path.as_str()], &full_message)?;
    Ok(serde_json::json!({ "ok": true }))
}
```

**Step 2: Register commands in main.rs**

Add to the `invoke_handler` list:

```rust
commands::generate_commit_message,
commands::commit_file,
```

**Step 3: Add to frontend IPC API**

In `src/lib/ipc.ts`, add to the `api` object:

```typescript
// Debounced commit operations
generateCommitMessage: (path: string) =>
  call<string>("generate_commit_message", { path }),
commitFile: (path: string, message: string) =>
  call<{ ok: boolean }>("commit_file", { path, message }),
```

**Step 4: Verify Rust compiles**

Run: `cd src-tauri && cargo build`
Expected: Compiles without errors.

**Step 5: Commit**

```bash
git add src-tauri/src/commands.rs src-tauri/src/main.rs src/lib/ipc.ts
git commit -m "Add generate_commit_message and commit_file Tauri commands"
```

---

### Task 5: Add commit_delay to RepoConfig

Allow users to configure the debounce interval via `.promptcase.yaml`.

**Files:**
- Modify: `src-tauri/src/types.rs`
- Modify: `src-tauri/src/config.rs`

**Step 1: Write failing test**

```rust
// In src-tauri/src/config.rs tests
#[test]
fn test_commit_delay_default() {
    let config = RepoConfig::default();
    assert_eq!(config.commit_delay_ms, 5000);
}

#[test]
fn test_commit_delay_from_yaml() {
    let yaml = "version: 1\ndefaultModel: claude-sonnet-4\nautoCommit: true\ncommitPrefix: '[pc]'\ncommitDelayMs: 3000\ntokenCountModels:\n  - gpt-4o\nlintRules: {}\n";
    let config: RepoConfig = serde_yaml::from_str(yaml).unwrap();
    assert_eq!(config.commit_delay_ms, 3000);
}
```

**Step 2: Run to verify failure**

Run: `cd src-tauri && cargo test test_commit_delay -- --nocapture`
Expected: FAIL — field doesn't exist.

**Step 3: Add field to RepoConfig**

In `src-tauri/src/types.rs`, add to `RepoConfig`:

```rust
pub struct RepoConfig {
    pub version: u32,
    pub default_model: String,
    pub auto_commit: bool,
    pub commit_prefix: String,
    pub commit_delay_ms: u64,  // <-- NEW
    pub token_count_models: Vec<String>,
    pub lint_rules: HashMap<String, LintSeverity>,
}
```

In `Default`:

```rust
commit_delay_ms: 5000,
```

In `src-tauri/src/config.rs` `merge_config`, add:

```rust
commit_delay_ms: parsed.commit_delay_ms,
```

**Step 4: Run tests**

Run: `cd src-tauri && cargo test`
Expected: PASS (existing config tests may need `commit_delay_ms` added to their YAML strings).

**Step 5: Commit**

```bash
git add src-tauri/src/types.rs src-tauri/src/config.rs
git commit -m "Add commit_delay_ms config option (default 5000ms)"
```

---

### Task 6: Implement debounced commit logic in frontend

The core debounce module. Tracks dirty files, manages timers, triggers commit + history refresh.

**Files:**
- Create: `src/lib/stores/commit.ts`

**Step 1: Implement the debounce store**

```typescript
import { get } from "svelte/store";
import { api } from "../ipc";
import { activeFile, fileHistory } from "./editor";

let dirtyFiles = new Set<string>();
let debounceTimer: ReturnType<typeof setTimeout> | null = null;
let commitDelayMs = 5000;

/** Load commit delay from config (call once at startup). */
export async function initCommitConfig(): Promise<void> {
  try {
    const config = await api.getConfig();
    if (config.commitDelayMs) {
      commitDelayMs = config.commitDelayMs;
    }
  } catch {
    // use default
  }
}

/** Mark a file as dirty and (re)start the debounce timer. */
export function scheduleDebouncedCommit(path: string): void {
  dirtyFiles.add(path);

  if (debounceTimer !== null) {
    clearTimeout(debounceTimer);
  }

  debounceTimer = setTimeout(() => {
    debounceTimer = null;
    flushCommits();
  }, commitDelayMs);
}

/** Commit all dirty files immediately. Call on app close. */
export async function flushCommits(): Promise<void> {
  if (dirtyFiles.size === 0) return;

  const paths = [...dirtyFiles];
  dirtyFiles.clear();

  for (const path of paths) {
    try {
      const message = await api.generateCommitMessage(path);
      await api.commitFile(path, message);
    } catch (err) {
      console.warn(`Failed to commit ${path}:`, err);
    }
  }

  // Refresh history for the currently active file
  const current = get(activeFile);
  if (current && paths.includes(current.path)) {
    try {
      const history = await api.gitLog(current.path);
      fileHistory.set(history);
    } catch (err) {
      console.warn("Failed to refresh history:", err);
    }
  }
}

/** Cancel any pending commit (e.g., when auto_commit is disabled). */
export function cancelPendingCommits(): void {
  if (debounceTimer !== null) {
    clearTimeout(debounceTimer);
    debounceTimer = null;
  }
  dirtyFiles.clear();
}
```

**Step 2: Verify no TypeScript errors**

Run: `npx tsc --noEmit`
Expected: No new errors.

**Step 3: Commit**

```bash
git add src/lib/stores/commit.ts
git commit -m "Add debounced commit store with per-file dirty tracking"
```

---

### Task 7: Wire up saveFile to use debounced commits

Replace the immediate commit-then-refresh-history flow with the debounce.

**Files:**
- Modify: `src/lib/stores/editor.ts`

**Step 1: Update saveFile**

Replace the current `saveFile` function:

```typescript
import { scheduleDebouncedCommit } from "./commit";

export async function saveFile(): Promise<void> {
  const file = get(activeFile);
  const content = get(editorContent);
  if (!file) return;

  isLoading.set(true);

  try {
    await api.writeFile(file.path, undefined, content);

    activeFile.update((f) => (f ? { ...f, body: content } : null));
    openTabs.update((tabs) =>
      tabs.map((t) =>
        t.path === file.path ? { ...t, modified: false } : t,
      ),
    );

    // Clear the buffer — content is now persisted
    tabBuffers.update((m) => {
      const next = new Map(m);
      next.delete(file.path);
      return next;
    });

    // Refresh lint results immediately
    const lint = await api.lintFile(file.path).catch(() => []);
    lintResults.set(lint);

    // Schedule debounced git commit (will refresh history when it fires)
    scheduleDebouncedCommit(file.path);

    // Refresh file list
    await loadFiles();

    addToast("File saved", "success", 2000);
  } catch (err) {
    console.error("Failed to save file:", err);
    addToast("Failed to save file", "error");
  } finally {
    isLoading.set(false);
  }
}
```

Key changes:
- Removed `api.gitLog()` call from the save flow
- Removed `fileHistory.set()` from the save flow
- Added `scheduleDebouncedCommit(file.path)` which handles commit + history refresh after delay

**Step 2: Verify no TypeScript errors**

Run: `npx tsc --noEmit`
Expected: No new errors.

**Step 3: Commit**

```bash
git add src/lib/stores/editor.ts
git commit -m "Wire saveFile to debounced commit instead of immediate auto-commit"
```

---

### Task 8: Flush commits on app close

Ensure pending commits are written before the app closes.

**Files:**
- Modify: `src/main.ts`

**Step 1: Add close handler**

At the top of `src/main.ts`, after existing imports/code, add:

```typescript
import { flushCommits, initCommitConfig } from "./lib/stores/commit";

// Initialize commit config
initCommitConfig();

// Flush pending commits before the window closes
window.addEventListener("beforeunload", () => {
  flushCommits();
});
```

Note: `beforeunload` fires synchronously so the async `flushCommits()` may not complete. For a more reliable approach, use Tauri's window close event:

```typescript
import { getCurrentWindow } from "@tauri-apps/api/window";

getCurrentWindow().onCloseRequested(async (event) => {
  await flushCommits();
});
```

Use the Tauri approach since we know we're in Tauri.

**Step 2: Verify no TypeScript errors**

Run: `npx tsc --noEmit`
Expected: No new errors.

**Step 3: Commit**

```bash
git add src/main.ts
git commit -m "Flush pending commits on app close"
```

---

### Task 9: Update MetadataPanel to use debounced commits

The MetadataPanel has inline `refreshHistory` calls after tag add/remove. These should use the debounce system instead.

**Files:**
- Modify: `src/lib/components/MetadataPanel.svelte`

**Step 1: Replace refreshHistory with scheduleDebouncedCommit**

```svelte
<script lang="ts">
  import { activeFile, editorContent, saveFile, fileHistory } from "../stores/editor";
  import { scheduleDebouncedCommit } from "../stores/commit";
  import { api } from "../ipc";
  import { get } from "svelte/store";

  let newTag = $state("");

  async function addTag() {
    const tag = newTag.trim().toLowerCase();
    if (!tag || !$activeFile) return;
    if ($activeFile.frontmatter.tags.includes(tag)) { newTag = ""; return; }
    const updatedTags = [...$activeFile.frontmatter.tags, tag];
    const path = $activeFile.path;
    await api.writeFile(path, { tags: updatedTags }, get(editorContent));
    activeFile.update((f) => f ? { ...f, frontmatter: { ...f.frontmatter, tags: updatedTags } } : null);
    newTag = "";
    scheduleDebouncedCommit(path);
  }

  async function removeTag(tag: string) {
    if (!$activeFile) return;
    const updatedTags = $activeFile.frontmatter.tags.filter((t) => t !== tag);
    const path = $activeFile.path;
    await api.writeFile(path, { tags: updatedTags }, get(editorContent));
    activeFile.update((f) => f ? { ...f, frontmatter: { ...f.frontmatter, tags: updatedTags } } : null);
    scheduleDebouncedCommit(path);
  }
</script>
```

Note: `fileHistory` import can be removed since it's no longer set here. The debounced commit will refresh history when it fires.

**Step 2: Verify no TypeScript errors**

Run: `npx tsc --noEmit`
Expected: No new errors.

**Step 3: Commit**

```bash
git add src/lib/components/MetadataPanel.svelte
git commit -m "Use debounced commit in MetadataPanel instead of direct refreshHistory"
```

---

### Task 10: Manual smoke test

**Steps:**
1. Run `npm run tauri dev`
2. Create a new prompt file — should commit immediately (create_file unchanged)
3. Open it, verify history shows the create commit
4. Edit the body, hit Cmd+S 5 times rapidly
5. Wait 5 seconds — should see exactly ONE new commit in history, with a descriptive message like `"My Prompt": edit body (+3/-1 lines)`
6. Add a tag, wait 5 seconds — should see a commit like `"My Prompt": add tag 'security'`
7. Close the app with a pending save — reopen, verify the commit was flushed

---

## Future: LLM Provider Hook

The architecture supports LLM-generated messages with zero changes to the Rust side. The frontend commit store would:

```typescript
// In commit.ts flushCommits():
const message = useLlmProvider
  ? await llmProvider.generateMessage(path, diff)
  : await api.generateCommitMessage(path);
await api.commitFile(path, message);
```

The provider interface and local model integration are a separate project.
