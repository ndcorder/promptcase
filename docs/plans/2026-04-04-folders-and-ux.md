# Folders & UX Improvements Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add full folder management (create/rename/delete/drag), sidebar search, bulk selection, drag reordering, duplicate prompt, and "Move to..." dialog.

**Architecture:** Filesystem-backed folders with new Rust Tauri commands for folder CRUD and batch operations. Frontend uses Svelte 5 runes (`$state`, `$derived`, `$effect`) with existing store patterns. Drag-and-drop uses native HTML5 drag API. Custom sort order persisted in localStorage.

**Tech Stack:** Rust (Tauri v2 commands, git2, walkdir, std::fs), Svelte 5, TypeScript, CSS custom properties

---

## Task 1: Backend — Folder CRUD Commands

**Files:**
- Modify: `src-tauri/src/file_ops.rs` (add 3 functions after line 260)
- Modify: `src-tauri/src/commands.rs` (add 3 commands)
- Modify: `src-tauri/src/main.rs:22-45` (register new commands)

**Step 1: Add `create_folder` to `file_ops.rs`**

Add after the `move_file` function (line 260):

```rust
/// Create an empty folder and optionally auto-commit.
pub fn create_folder(
    repo_root: &Path,
    folder_path: &str,
    repo: Option<&Repository>,
    config: &RepoConfig,
) -> Result<(), AppError> {
    let full = safe_path(repo_root, folder_path)?;
    if full.exists() {
        return Err(AppError::Custom(format!(
            "Folder already exists: {folder_path}"
        )));
    }
    fs::create_dir_all(&full)?;

    // Git doesn't track empty directories, so create a .gitkeep
    let gitkeep = full.join(".gitkeep");
    fs::write(&gitkeep, "")?;

    if config.auto_commit {
        if let Some(r) = repo {
            let gitkeep_rel = format!("{folder_path}/.gitkeep");
            auto_commit(r, &[&gitkeep_rel], "Create folder", Some(folder_path), &config.commit_prefix)?;
        }
    }

    Ok(())
}
```

**Step 2: Add `rename_folder` to `file_ops.rs`**

```rust
/// Rename/move a folder and all its contents. Auto-commits if enabled.
pub fn rename_folder(
    repo_root: &Path,
    from: &str,
    to: &str,
    repo: Option<&Repository>,
    config: &RepoConfig,
) -> Result<Vec<(String, String)>, AppError> {
    let from_full = safe_path(repo_root, from)?;
    let to_full = safe_path(repo_root, to)?;

    if !from_full.is_dir() {
        return Err(AppError::Custom(format!("Not a directory: {from}")));
    }
    if to_full.exists() {
        return Err(AppError::Custom(format!(
            "Destination already exists: {to}"
        )));
    }

    // Collect all file paths before the move for git staging
    let mut old_paths: Vec<String> = Vec::new();
    for entry in WalkDir::new(&from_full) {
        let entry = entry.map_err(|e| AppError::Custom(format!("walkdir error: {e}")))?;
        if entry.file_type().is_file() {
            let rel = entry.path().strip_prefix(repo_root).unwrap_or(entry.path());
            old_paths.push(rel.to_string_lossy().replace('\\', "/"));
        }
    }

    if let Some(parent) = to_full.parent() {
        fs::create_dir_all(parent)?;
    }

    fs::rename(&from_full, &to_full)?;

    // Compute new paths
    let moved: Vec<(String, String)> = old_paths
        .iter()
        .map(|old| {
            let suffix = old.strip_prefix(from).unwrap_or(old);
            let new = format!("{to}{suffix}");
            (old.clone(), new)
        })
        .collect();

    if config.auto_commit {
        if let Some(r) = repo {
            let mut index = r.index()?;
            for (old, new) in &moved {
                let _ = index.remove_path(Path::new(old));
                let _ = index.add_path(Path::new(new));
            }
            index.write()?;

            let tree_oid = index.write_tree()?;
            let tree = r.find_tree(tree_oid)?;
            let message = format!("{} Rename folder \"{}\" → \"{}\"", config.commit_prefix, from, to);
            let sig = r.signature().unwrap_or_else(|_| {
                git2::Signature::now("Promptcase", "promptcase@local").unwrap()
            });
            let parent = r.head().ok().and_then(|h| h.peel_to_commit().ok());
            let parents: Vec<&git2::Commit> = match parent.as_ref() {
                Some(p) => vec![p],
                None => vec![],
            };
            r.commit(Some("HEAD"), &sig, &sig, &message, &tree, &parents)?;
        }
    }

    Ok(moved)
}
```

**Step 3: Add `delete_folder` to `file_ops.rs`**

```rust
/// Delete an empty folder. Returns error if folder is non-empty (excluding .gitkeep).
pub fn delete_folder(
    repo_root: &Path,
    folder_path: &str,
    repo: Option<&Repository>,
    config: &RepoConfig,
) -> Result<(), AppError> {
    let full = safe_path(repo_root, folder_path)?;
    if !full.is_dir() {
        return Err(AppError::Custom(format!("Not a directory: {folder_path}")));
    }

    // Check if the folder has any real content (ignore .gitkeep)
    let has_content = fs::read_dir(&full)?
        .filter_map(|e| e.ok())
        .any(|e| e.file_name() != ".gitkeep");

    if has_content {
        return Err(AppError::Custom(
            "Cannot delete non-empty folder. Move or delete its contents first.".into(),
        ));
    }

    // Remove .gitkeep first if it exists
    let gitkeep = full.join(".gitkeep");
    if gitkeep.exists() {
        fs::remove_file(&gitkeep)?;
    }

    fs::remove_dir(&full)?;

    if config.auto_commit {
        if let Some(r) = repo {
            let gitkeep_rel = format!("{folder_path}/.gitkeep");
            let mut index = r.index()?;
            let _ = index.remove_path(Path::new(&gitkeep_rel));
            index.write()?;

            let tree_oid = index.write_tree()?;
            let tree = r.find_tree(tree_oid)?;
            let message = format!("{} Delete folder \"{}\"", config.commit_prefix, folder_path);
            let sig = r.signature().unwrap_or_else(|_| {
                git2::Signature::now("Promptcase", "promptcase@local").unwrap()
            });
            let parent = r.head().ok().and_then(|h| h.peel_to_commit().ok());
            let parents: Vec<&git2::Commit> = match parent.as_ref() {
                Some(p) => vec![p],
                None => vec![],
            };
            r.commit(Some("HEAD"), &sig, &sig, &message, &tree, &parents)?;
        }
    }

    Ok(())
}
```

**Step 4: Add Tauri commands to `commands.rs`**

Add after the existing `move_file` command (~line 172):

```rust
#[tauri::command]
pub fn create_folder(
    state: tauri::State<'_, AppState>,
    path: String,
) -> Result<serde_json::Value, AppError> {
    let repo = state.repo.lock().map_err(|_| AppError::Custom("Internal lock error".into()))?;
    crate::file_ops::create_folder(&state.repo_root, &path, Some(&*repo), &state.config)?;
    Ok(serde_json::json!({ "ok": true }))
}

#[tauri::command]
pub fn rename_folder(
    state: tauri::State<'_, AppState>,
    from: String,
    to: String,
) -> Result<serde_json::Value, AppError> {
    let moved = {
        let repo = state.repo.lock().map_err(|_| AppError::Custom("Internal lock error".into()))?;
        crate::file_ops::rename_folder(&state.repo_root, &from, &to, Some(&*repo), &state.config)?
    };

    // Update search index for all moved files
    let mut search = state.search.lock().map_err(|_| AppError::Custom("Internal lock error".into()))?;
    for (old, new) in &moved {
        search.remove_document(old);
        if let Ok(file) = crate::file_ops::read_file(&state.repo_root, new) {
            let entry = PromptEntry {
                path: file.path,
                frontmatter: file.frontmatter,
            };
            search.add_document(&entry, &file.body);
        }
    }

    Ok(serde_json::json!({ "ok": true }))
}

#[tauri::command]
pub fn delete_folder(
    state: tauri::State<'_, AppState>,
    path: String,
) -> Result<serde_json::Value, AppError> {
    let repo = state.repo.lock().map_err(|_| AppError::Custom("Internal lock error".into()))?;
    crate::file_ops::delete_folder(&state.repo_root, &path, Some(&*repo), &state.config)?;
    Ok(serde_json::json!({ "ok": true }))
}
```

**Step 5: Register commands in `main.rs`**

Add to the `invoke_handler` array:
```rust
commands::create_folder,
commands::rename_folder,
commands::delete_folder,
```

**Step 6: Write tests for folder operations**

Add to the `#[cfg(test)]` section of `file_ops.rs`:

```rust
#[test]
fn test_create_folder() {
    let tmp = TempDir::new().unwrap();
    let root = tmp.path();
    let config = test_config(false);

    create_folder(root, "my-folder", None, &config).unwrap();
    assert!(root.join("my-folder").is_dir());
    assert!(root.join("my-folder/.gitkeep").exists());
}

#[test]
fn test_create_folder_already_exists() {
    let tmp = TempDir::new().unwrap();
    let root = tmp.path();
    let config = test_config(false);

    fs::create_dir_all(root.join("existing")).unwrap();
    let result = create_folder(root, "existing", None, &config);
    assert!(result.is_err());
}

#[test]
fn test_rename_folder() {
    let tmp = TempDir::new().unwrap();
    let root = tmp.path();
    let config = test_config(false);

    create_folder(root, "old-name", None, &config).unwrap();
    create_file(root, "old-name/test.md", "Test", "prompt", None, None, &config).unwrap();

    let moved = rename_folder(root, "old-name", "new-name", None, &config).unwrap();
    assert!(!root.join("old-name").exists());
    assert!(root.join("new-name").is_dir());
    assert!(root.join("new-name/test.md").exists());
    assert!(!moved.is_empty());
}

#[test]
fn test_rename_folder_destination_exists() {
    let tmp = TempDir::new().unwrap();
    let root = tmp.path();
    let config = test_config(false);

    create_folder(root, "a", None, &config).unwrap();
    create_folder(root, "b", None, &config).unwrap();
    let result = rename_folder(root, "a", "b", None, &config);
    assert!(result.is_err());
}

#[test]
fn test_delete_empty_folder() {
    let tmp = TempDir::new().unwrap();
    let root = tmp.path();
    let config = test_config(false);

    create_folder(root, "empty-folder", None, &config).unwrap();
    delete_folder(root, "empty-folder", None, &config).unwrap();
    assert!(!root.join("empty-folder").exists());
}

#[test]
fn test_delete_non_empty_folder() {
    let tmp = TempDir::new().unwrap();
    let root = tmp.path();
    let config = test_config(false);

    create_folder(root, "has-files", None, &config).unwrap();
    create_file(root, "has-files/test.md", "Test", "prompt", None, None, &config).unwrap();
    let result = delete_folder(root, "has-files", None, &config);
    assert!(result.is_err());
}

#[test]
fn test_create_folder_with_auto_commit() {
    let tmp = TempDir::new().unwrap();
    let root = tmp.path();
    let repo = init_repo(root).unwrap();
    let config = test_config(true);

    create_folder(root, "committed-folder", Some(&repo), &config).unwrap();
    let log = crate::git_ops::git_log(&repo, None, 10).unwrap();
    assert_eq!(log.len(), 1);
    assert!(log[0].message.contains("Create folder"));
}

#[test]
fn test_rename_folder_nested() {
    let tmp = TempDir::new().unwrap();
    let root = tmp.path();
    let config = test_config(false);

    create_folder(root, "parent", None, &config).unwrap();
    create_folder(root, "target", None, &config).unwrap();
    create_file(root, "parent/a.md", "A", "prompt", None, None, &config).unwrap();

    let moved = rename_folder(root, "parent", "target/parent", None, &config).unwrap();
    assert!(root.join("target/parent/a.md").exists());
    assert!(!root.join("parent").exists());
    assert!(!moved.is_empty());
}
```

**Step 7: Run Rust tests**

Run: `cd src-tauri && cargo test`
Expected: All new tests pass alongside existing ones.

**Step 8: Commit**

```bash
git add src-tauri/src/file_ops.rs src-tauri/src/commands.rs src-tauri/src/main.rs
git commit -m "feat: add folder CRUD backend commands (create, rename, delete)"
```

---

## Task 2: Backend — Duplicate File & Batch Move Commands

**Files:**
- Modify: `src-tauri/src/file_ops.rs` (add 2 functions)
- Modify: `src-tauri/src/commands.rs` (add 2 commands)
- Modify: `src-tauri/src/main.rs` (register 2 commands)

**Step 1: Add `duplicate_file` to `file_ops.rs`**

```rust
/// Duplicate a prompt file with a new ID and "(Copy)" title suffix.
pub fn duplicate_file(
    repo_root: &Path,
    file_path: &str,
    repo: Option<&Repository>,
    config: &RepoConfig,
) -> Result<PromptFile, AppError> {
    let full = safe_path(repo_root, file_path)?;
    let content = fs::read_to_string(&full)?;
    let parsed = parse_prompt_file(file_path, &content);

    // Generate destination path: {dir}/{slug}-copy.md, {dir}/{slug}-copy-2.md, etc.
    let base = file_path.trim_end_matches(".md");
    let mut new_path = format!("{base}-copy.md");
    let mut counter = 2u32;
    while safe_path(repo_root, &new_path)
        .map(|p| p.exists())
        .unwrap_or(false)
    {
        new_path = format!("{base}-copy-{counter}.md");
        counter += 1;
    }

    let new_full = safe_path(repo_root, &new_path)?;
    if let Some(parent) = new_full.parent() {
        fs::create_dir_all(parent)?;
    }

    let now = Utc::now().to_rfc3339_opts(chrono::SecondsFormat::Millis, true);
    let mut fm = parsed.frontmatter.clone();
    fm.id = generate_id();
    fm.title = format!("{} (Copy)", fm.title);
    fm.created = now.clone();
    fm.modified = now;
    fm.starred_versions = Vec::new();

    let new_content = serialize_prompt_file(&fm, &parsed.body)?;
    fs::write(&new_full, &new_content)?;

    if config.auto_commit {
        if let Some(r) = repo {
            auto_commit(r, &[&new_path], "Duplicate", Some(&fm.title), &config.commit_prefix)?;
        }
    }

    Ok(parse_prompt_file(&new_path, &new_content))
}
```

**Step 2: Add `move_files` (batch) to `file_ops.rs`**

```rust
/// Move multiple files to a destination folder. Single commit for all moves.
pub fn move_files(
    repo_root: &Path,
    paths: &[String],
    destination: &str,
    repo: Option<&Repository>,
    config: &RepoConfig,
) -> Result<Vec<(String, String)>, AppError> {
    let dest_full = safe_path(repo_root, destination)?;
    if !dest_full.is_dir() {
        fs::create_dir_all(&dest_full)?;
    }

    let mut moved: Vec<(String, String)> = Vec::new();
    for path in paths {
        let filename = Path::new(path)
            .file_name()
            .ok_or_else(|| AppError::Custom(format!("Invalid path: {path}")))?
            .to_string_lossy();
        let new_path = if destination.is_empty() {
            filename.to_string()
        } else {
            format!("{destination}/{filename}")
        };
        let from_full = safe_path(repo_root, path)?;
        let to_full = safe_path(repo_root, &new_path)?;

        if let Some(parent) = to_full.parent() {
            fs::create_dir_all(parent)?;
        }
        fs::rename(&from_full, &to_full)?;
        moved.push((path.clone(), new_path));
    }

    if config.auto_commit {
        if let Some(r) = repo {
            let mut index = r.index()?;
            for (old, new) in &moved {
                let _ = index.remove_path(Path::new(old));
                let _ = index.add_path(Path::new(new));
            }
            index.write()?;

            let tree_oid = index.write_tree()?;
            let tree = r.find_tree(tree_oid)?;
            let message = format!(
                "{} Move {} file(s) to \"{}\"",
                config.commit_prefix,
                moved.len(),
                destination
            );
            let sig = r.signature().unwrap_or_else(|_| {
                git2::Signature::now("Promptcase", "promptcase@local").unwrap()
            });
            let parent = r.head().ok().and_then(|h| h.peel_to_commit().ok());
            let parents: Vec<&git2::Commit> = match parent.as_ref() {
                Some(p) => vec![p],
                None => vec![],
            };
            r.commit(Some("HEAD"), &sig, &sig, &message, &tree, &parents)?;
        }
    }

    Ok(moved)
}
```

**Step 3: Add Tauri commands to `commands.rs`**

```rust
#[tauri::command]
pub fn duplicate_file(
    state: tauri::State<'_, AppState>,
    path: String,
) -> Result<PromptFile, AppError> {
    let file = {
        let repo = state.repo.lock().map_err(|_| AppError::Custom("Internal lock error".into()))?;
        crate::file_ops::duplicate_file(&state.repo_root, &path, Some(&*repo), &state.config)?
    };

    let entry = PromptEntry {
        path: file.path.clone(),
        frontmatter: file.frontmatter.clone(),
    };
    state.search.lock().map_err(|_| AppError::Custom("Internal lock error".into()))?.add_document(&entry, &file.body);

    Ok(file)
}

#[tauri::command]
pub fn move_files(
    state: tauri::State<'_, AppState>,
    paths: Vec<String>,
    destination: String,
) -> Result<serde_json::Value, AppError> {
    let moved = {
        let repo = state.repo.lock().map_err(|_| AppError::Custom("Internal lock error".into()))?;
        crate::file_ops::move_files(&state.repo_root, &paths, &destination, Some(&*repo), &state.config)?
    };

    let mut search = state.search.lock().map_err(|_| AppError::Custom("Internal lock error".into()))?;
    for (old, new) in &moved {
        search.remove_document(old);
        if let Ok(file) = crate::file_ops::read_file(&state.repo_root, new) {
            let entry = PromptEntry {
                path: file.path,
                frontmatter: file.frontmatter,
            };
            search.add_document(&entry, &file.body);
        }
    }

    Ok(serde_json::json!({ "ok": true }))
}
```

**Step 4: Register commands in `main.rs`**

Add to the `invoke_handler` array:
```rust
commands::duplicate_file,
commands::move_files,
```

**Step 5: Write tests**

Add to `file_ops.rs` tests:

```rust
#[test]
fn test_duplicate_file() {
    let tmp = TempDir::new().unwrap();
    let root = tmp.path();
    let config = test_config(false);

    create_file(root, "original.md", "Original", "prompt", None, None, &config).unwrap();
    let dup = duplicate_file(root, "original.md", None, &config).unwrap();
    assert_eq!(dup.path, "original-copy.md");
    assert_eq!(dup.frontmatter.title, "Original (Copy)");
    assert_ne!(dup.frontmatter.id, read_file(root, "original.md").unwrap().frontmatter.id);
}

#[test]
fn test_duplicate_file_increments_suffix() {
    let tmp = TempDir::new().unwrap();
    let root = tmp.path();
    let config = test_config(false);

    create_file(root, "test.md", "Test", "prompt", None, None, &config).unwrap();
    duplicate_file(root, "test.md", None, &config).unwrap();
    let dup2 = duplicate_file(root, "test.md", None, &config).unwrap();
    assert_eq!(dup2.path, "test-copy-2.md");
}

#[test]
fn test_duplicate_file_in_subfolder() {
    let tmp = TempDir::new().unwrap();
    let root = tmp.path();
    let config = test_config(false);

    create_file(root, "sub/original.md", "Sub Original", "prompt", None, None, &config).unwrap();
    let dup = duplicate_file(root, "sub/original.md", None, &config).unwrap();
    assert_eq!(dup.path, "sub/original-copy.md");
    assert!(root.join("sub/original-copy.md").exists());
}

#[test]
fn test_move_files_batch() {
    let tmp = TempDir::new().unwrap();
    let root = tmp.path();
    let config = test_config(false);

    create_file(root, "a.md", "A", "prompt", None, None, &config).unwrap();
    create_file(root, "b.md", "B", "prompt", None, None, &config).unwrap();
    create_folder(root, "dest", None, &config).unwrap();

    let moved = move_files(
        root,
        &["a.md".into(), "b.md".into()],
        "dest",
        None,
        &config,
    ).unwrap();

    assert_eq!(moved.len(), 2);
    assert!(root.join("dest/a.md").exists());
    assert!(root.join("dest/b.md").exists());
    assert!(!root.join("a.md").exists());
    assert!(!root.join("b.md").exists());
}

#[test]
fn test_move_files_to_root() {
    let tmp = TempDir::new().unwrap();
    let root = tmp.path();
    let config = test_config(false);

    create_file(root, "sub/a.md", "A", "prompt", None, None, &config).unwrap();
    let moved = move_files(root, &["sub/a.md".into()], "", None, &config).unwrap();
    assert_eq!(moved.len(), 1);
    assert!(root.join("a.md").exists());
}
```

**Step 6: Run Rust tests**

Run: `cd src-tauri && cargo test`
Expected: All tests pass.

**Step 7: Commit**

```bash
git add src-tauri/src/file_ops.rs src-tauri/src/commands.rs src-tauri/src/main.rs
git commit -m "feat: add duplicate_file and move_files batch backend commands"
```

---

## Task 3: Frontend — IPC Bindings & Store Updates

**Files:**
- Modify: `src/lib/ipc.ts:31-91` (add 5 API methods)
- Modify: `src/lib/types.ts` (no changes needed — existing types sufficient)
- Modify: `src/lib/stores/files.ts` (add stores and update sort logic)

**Step 1: Add IPC bindings to `ipc.ts`**

Add to the `api` object, after the `moveFile` entry (line 46):

```typescript
  // Folder operations
  createFolder: (path: string) =>
    call<{ ok: boolean }>("create_folder", { path }),
  renameFolder: (from: string, to: string) =>
    call<{ ok: boolean }>("rename_folder", { from, to }),
  deleteFolder: (path: string) =>
    call<{ ok: boolean }>("delete_folder", { path }),

  // Duplicate
  duplicateFile: (path: string) =>
    call<PromptFile>("duplicate_file", { path }),

  // Batch move
  moveFiles: (paths: string[], destination: string) =>
    call<{ ok: boolean }>("move_files", { paths, destination }),
```

Also add `PromptFile` to the import at the top if not already imported (it is — line 4).

**Step 2: Add selection and search stores to `files.ts`**

Add after the `filesLoading` writable (line 9):

```typescript
export const selectedPaths = writable<Set<string>>(new Set());
export const searchQuery = writable<string>("");
```

**Step 3: Update `filteredEntries` to include search query**

Replace the current `filteredEntries` derived (lines 21-31) with:

```typescript
export const filteredEntries = derived(
  [promptEntries, tagFilter, searchQuery],
  ([$entries, $filter, $search]) => {
    let result = $entries;
    if ($filter) {
      result = result.filter((e) =>
        e.frontmatter.tags.some((t) =>
          t.toLowerCase().includes($filter.toLowerCase()),
        ),
      );
    }
    if ($search) {
      const q = $search.toLowerCase();
      result = result.filter((e) =>
        (e.frontmatter.title || "").toLowerCase().includes(q) ||
        e.path.toLowerCase().includes(q),
      );
    }
    return result;
  },
);
```

**Step 4: Add folder file count helper**

Add after `folderTree`:

```typescript
export const folderFileCounts = derived(folderTree, ($tree) => {
  const counts = new Map<string, number>();
  function countRecursive(node: FolderNode): number {
    let total = node.files.length;
    for (const child of node.children) {
      total += countRecursive(child);
    }
    if (node.path) {
      counts.set(node.path, total);
    }
    return total;
  }
  countRecursive($tree);
  return counts;
});
```

**Step 5: Add folder paths helper for MoveToFolderDialog**

```typescript
export const allFolderPaths = derived(folderTree, ($tree) => {
  const paths: string[] = [];
  function collect(node: FolderNode) {
    if (node.path) paths.push(node.path);
    for (const child of node.children) collect(child);
  }
  collect($tree);
  return paths.sort();
});
```

**Step 6: Update `sortTree` to support custom ordering**

Replace the current `sortTree` function (lines 73-81):

```typescript
function getCustomOrder(folderPath: string): string[] | null {
  try {
    const key = `promptcase:folder-order:${folderPath || "__root__"}`;
    const stored = localStorage.getItem(key);
    return stored ? JSON.parse(stored) : null;
  } catch {
    return null;
  }
}

export function saveCustomOrder(folderPath: string, filePaths: string[]): void {
  const key = `promptcase:folder-order:${folderPath || "__root__"}`;
  localStorage.setItem(key, JSON.stringify(filePaths));
}

export function clearCustomOrder(folderPath: string): void {
  const key = `promptcase:folder-order:${folderPath || "__root__"}`;
  localStorage.removeItem(key);
}

function sortTree(node: FolderNode): void {
  node.children.sort((a, b) => a.name.localeCompare(b.name));

  const customOrder = getCustomOrder(node.path);
  if (customOrder) {
    const orderMap = new Map(customOrder.map((p, i) => [p, i]));
    node.files.sort((a, b) => {
      const ai = orderMap.get(a.path);
      const bi = orderMap.get(b.path);
      if (ai !== undefined && bi !== undefined) return ai - bi;
      if (ai !== undefined) return -1;
      if (bi !== undefined) return 1;
      return a.frontmatter.title.localeCompare(b.frontmatter.title);
    });
  } else {
    node.files.sort((a, b) =>
      a.frontmatter.title.localeCompare(b.frontmatter.title),
    );
  }

  for (const child of node.children) {
    sortTree(child);
  }
}
```

**Step 7: Add bulk selection helpers**

```typescript
export function toggleSelection(path: string, multi: boolean): void {
  selectedPaths.update((set) => {
    const next = new Set(multi ? set : []);
    if (next.has(path)) {
      next.delete(path);
    } else {
      next.add(path);
    }
    return next;
  });
}

export function selectRange(fromPath: string, toPath: string, entries: PromptEntry[]): void {
  const paths = entries.map((e) => e.path);
  const fromIdx = paths.indexOf(fromPath);
  const toIdx = paths.indexOf(toPath);
  if (fromIdx === -1 || toIdx === -1) return;
  const [start, end] = fromIdx < toIdx ? [fromIdx, toIdx] : [toIdx, fromIdx];
  const range = new Set(paths.slice(start, end + 1));
  selectedPaths.set(range);
}

export function clearSelection(): void {
  selectedPaths.set(new Set());
}

export function selectAll(): void {
  selectedPaths.update((_) => {
    const entries = get(filteredEntries);
    return new Set(entries.map((e) => e.path));
  });
}
```

Add `import { get } from "svelte/store";` at the top if not already present.

**Step 8: Commit**

```bash
git add src/lib/ipc.ts src/lib/stores/files.ts
git commit -m "feat: add IPC bindings and stores for folders, search, selection, custom ordering"
```

---

## Task 4: Sidebar Search Input

**Files:**
- Modify: `src/lib/components/Sidebar.svelte:126-164`

**Step 1: Add search input between TagFilter and tree container**

In `Sidebar.svelte`, add the search input import and bind to the store. Add after `<TagFilter />` (line 140):

```svelte
<div class="sidebar-search">
  <svg class="search-icon" width="13" height="13" viewBox="0 0 16 16">
    <circle cx="6.5" cy="6.5" r="5.5" fill="none" stroke="currentColor" stroke-width="1.3"/>
    <path d="M10.5 10.5L14.5 14.5" stroke="currentColor" stroke-width="1.3" stroke-linecap="round"/>
  </svg>
  <input
    class="search-input"
    type="text"
    placeholder="Filter prompts..."
    bind:value={searchValue}
    onkeydown={(e) => { if (e.key === "Escape") { searchValue = ""; } }}
  />
  {#if searchValue}
    <button class="search-clear" onclick={() => { searchValue = ""; }}>
      <svg width="8" height="8" viewBox="0 0 8 8">
        <path d="M1 1l6 6M7 1l-6 6" stroke="currentColor" stroke-width="1.2" stroke-linecap="round"/>
      </svg>
    </button>
  {/if}
</div>
```

**Step 2: Add the searchValue state and sync to store**

In the `<script>` block, add:

```typescript
import { searchQuery } from "../stores/files";

let searchValue = $state("");

$effect(() => {
  searchQuery.set(searchValue);
});
```

**Step 3: Add CSS styles**

Add to the `<style>` block:

```css
.sidebar-search {
  position: relative;
  display: flex;
  align-items: center;
  margin: 0 var(--space-2) var(--space-2);
}
.search-icon {
  position: absolute;
  left: var(--space-2);
  color: var(--text-tertiary);
  pointer-events: none;
}
.search-input {
  width: 100%;
  padding: var(--space-1) var(--space-2) var(--space-1) calc(var(--space-2) + 18px);
  background: var(--bg-secondary);
  border: 1px solid var(--border-primary);
  border-radius: var(--radius-md);
  color: var(--text-primary);
  font-size: var(--font-size-sm);
  font-family: inherit;
  outline: none;
  transition: border-color var(--transition-fast);
}
.search-input:focus {
  border-color: var(--accent);
}
.search-input::placeholder {
  color: var(--text-tertiary);
}
.search-clear {
  position: absolute;
  right: var(--space-1);
  padding: var(--space-1);
  color: var(--text-tertiary);
  cursor: pointer;
  border-radius: var(--radius-sm);
}
.search-clear:hover {
  color: var(--text-primary);
}
```

**Step 4: Commit**

```bash
git add src/lib/components/Sidebar.svelte
git commit -m "feat: add sidebar search input for filtering prompts by name"
```

---

## Task 5: Folder Context Menu & Create Folder Button

**Files:**
- Create: `src/lib/components/FolderContextMenu.svelte`
- Modify: `src/lib/components/FolderTree.svelte`
- Modify: `src/lib/components/Sidebar.svelte`

**Step 1: Create `FolderContextMenu.svelte`**

```svelte
<script lang="ts">
  interface Props {
    x: number;
    y: number;
    isEmpty: boolean;
    onNewPromptHere: () => void;
    onNewFolderInside: () => void;
    onRename: () => void;
    onDelete: () => void;
    onClose: () => void;
  }

  let { x, y, isEmpty, onNewPromptHere, onNewFolderInside, onRename, onDelete, onClose }: Props = $props();

  function handleAction(fn: () => void) {
    fn();
    onClose();
  }
</script>

<svelte:window onclick={onClose} />

<div class="context-menu" style="left: {x}px; top: {y}px" onclick={(e) => e.stopPropagation()}>
  <button class="menu-item" onclick={() => handleAction(onNewPromptHere)}>New Prompt Here</button>
  <button class="menu-item" onclick={() => handleAction(onNewFolderInside)}>New Folder Inside</button>
  <div class="separator"></div>
  <button class="menu-item" onclick={() => handleAction(onRename)}>Rename</button>
  <button
    class="menu-item danger"
    class:disabled={!isEmpty}
    onclick={() => { if (isEmpty) handleAction(onDelete); }}
    title={isEmpty ? "" : "Folder must be empty to delete"}
  >
    Delete
  </button>
</div>

<style>
  .context-menu {
    position: fixed;
    z-index: 200;
    min-width: 180px;
    background: var(--bg-tertiary);
    border: 1px solid var(--border-primary);
    border-radius: var(--radius-lg);
    padding: var(--space-1) 0;
    box-shadow: var(--shadow-popover);
  }
  .menu-item {
    display: block;
    width: calc(100% - var(--space-2));
    margin: 0 var(--space-1);
    padding: var(--space-1) var(--space-3);
    color: var(--text-primary);
    font-size: var(--font-size-base);
    text-align: left;
    border-radius: var(--radius-sm);
    transition: background var(--transition-fast);
  }
  .menu-item:hover {
    background: var(--accent);
    color: white;
  }
  .menu-item.danger {
    color: var(--color-error);
  }
  .menu-item.danger:hover {
    background: var(--color-error);
    color: white;
  }
  .menu-item.disabled {
    opacity: 0.4;
    cursor: not-allowed;
  }
  .menu-item.disabled:hover {
    background: none;
    color: var(--color-error);
  }
  .separator {
    height: 1px;
    background: var(--border-primary);
    margin: var(--space-1) 0;
  }
</style>
```

**Step 2: Add folder context event to `FolderTree.svelte`**

Add to Props interface:
```typescript
onFolderContext?: (path: string, x: number, y: number) => void;
```

Add to the destructuring:
```typescript
let { node, depth = 0, onFileSelect, onFileContext, onFolderContext, selectedPath }: Props = $props();
```

Add `oncontextmenu` handler to the folder-row button (the `{#if node.name}` block):
```svelte
<button
  class="folder-row"
  style="padding-left: {depth * 16 + 8}px"
  onclick={toggleExpand}
  oncontextmenu={(e) => { e.preventDefault(); onFolderContext?.(node.path, e.clientX, e.clientY); }}
>
```

Pass `onFolderContext` through the recursive `<svelte:self>`:
```svelte
<svelte:self
  node={child}
  depth={node.name ? depth + 1 : depth}
  {onFileSelect}
  {onFileContext}
  {onFolderContext}
  {selectedPath}
/>
```

**Step 3: Add folder file count display to `FolderTree.svelte`**

Add import:
```typescript
import { folderFileCounts } from "../stores/files";
```

Update the folder name span to show count:
```svelte
<span class="folder-name">{node.name}</span>
<span class="folder-count">{$folderFileCounts.get(node.path) ?? 0}</span>
```

Add CSS:
```css
.folder-count {
  color: var(--text-tertiary);
  font-size: var(--font-size-xs, 11px);
  font-weight: var(--font-weight-normal, 400);
  margin-left: auto;
  padding-right: var(--space-2);
  text-transform: none;
  letter-spacing: normal;
}
```

**Step 4: Wire folder context menu in `Sidebar.svelte`**

Add state and handlers to the script block:

```typescript
import FolderContextMenu from "./FolderContextMenu.svelte";

let folderContextMenu = $state<{ path: string; x: number; y: number } | null>(null);

function handleFolderContext(path: string, x: number, y: number) {
  folderContextMenu = { path, x, y };
}

async function handleCreateFolder(parentPath?: string) {
  dialogMode = "create-folder";
  dialogTitle = "New Folder";
  dialogDefault = "New Folder";
  deleteTargetPath = parentPath || "";
  dialogVisible = true;
}

async function handleRenameFolder(path: string) {
  dialogMode = "rename-folder";
  dialogTitle = "Rename Folder";
  dialogDefault = path.split("/").pop() || "";
  deleteTargetPath = path;
  dialogVisible = true;
}

async function handleDeleteFolder(path: string) {
  try {
    await api.deleteFolder(path);
    await loadFiles();
    addToast("Folder deleted", "success", 2000);
  } catch (err: any) {
    addToast(err?.message || "Failed to delete folder", "error");
  }
}

function handleNewPromptInFolder(folderPath: string) {
  dialogMode = "create-in-folder";
  dialogTitle = "New Prompt";
  dialogDefault = "New Prompt";
  deleteTargetPath = folderPath;
  dialogVisible = true;
}
```

Update the `dialogMode` type to include the new modes:
```typescript
let dialogMode: "create" | "rename" | "create-folder" | "rename-folder" | "create-in-folder" = "create";
```

Update `handleDialogConfirm` to handle new modes:
```typescript
async function handleDialogConfirm(name: string) {
  dialogVisible = false;
  if (creating) return;
  creating = true;
  try {
    const slug = name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");

    if (dialogMode === "create-folder") {
      const folderPath = deleteTargetPath ? `${deleteTargetPath}/${slug}` : slug;
      await api.createFolder(folderPath);
      await loadFiles();
      addToast("Folder created", "success", 2000);
    } else if (dialogMode === "rename-folder") {
      const oldPath = deleteTargetPath;
      const parentDir = oldPath.includes("/") ? oldPath.substring(0, oldPath.lastIndexOf("/")) : "";
      const newPath = parentDir ? `${parentDir}/${slug}` : slug;
      await api.renameFolder(oldPath, newPath);
      await loadFiles();
      addToast("Folder renamed", "success", 2000);
    } else if (dialogMode === "create-in-folder") {
      const filePath = `${deleteTargetPath}/${slug}.md`;
      const file = await api.createFile(filePath, name, "prompt");
      await loadFiles();
      openFile(file.path);
    } else if (dialogMode === "rename") {
      const oldPath = deleteTargetPath;
      const dir = oldPath.includes("/") ? oldPath.substring(0, oldPath.lastIndexOf("/") + 1) : "";
      const newPath = dir + slug + ".md";
      await api.moveFile(oldPath, newPath);
      await api.writeFile(newPath, { title: name });
      closeTab(oldPath);
      await loadFiles();
      openFile(newPath);
    } else {
      const file = await api.createFile(slug + ".md", name, "prompt");
      await loadFiles();
      openFile(file.path);
    }
  } catch (err) {
    console.error(`Failed to ${dialogMode}:`, err);
    addToast(`Failed to ${dialogMode}`, "error");
  } finally {
    creating = false;
  }
}
```

Add the "New Folder" button in the header-actions div:
```svelte
<div class="header-actions">
  <button class="action-btn" onclick={handleNewPrompt} title="New Prompt">
    <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
      <path d="M6 1v10M1 6h10" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>
    </svg>
    New Prompt
  </button>
  <button class="action-btn" onclick={() => handleCreateFolder()} title="New Folder">
    <svg width="12" height="12" viewBox="0 0 14 12" fill="none">
      <path d="M1 2.5A1.5 1.5 0 012.5 1H5l1.5 2H11.5A1.5 1.5 0 0113 4.5v5A1.5 1.5 0 0111.5 11h-9A1.5 1.5 0 011 9.5z" stroke="currentColor" stroke-width="1.2"/>
      <path d="M7 5.5v3M5.5 7h3" stroke="currentColor" stroke-width="1.2" stroke-linecap="round"/>
    </svg>
  </button>
</div>
```

Pass `onFolderContext` to FolderTree:
```svelte
<FolderTree
  node={$folderTree}
  onFileSelect={handleFileSelect}
  onFileContext={handleFileContext}
  onFolderContext={handleFolderContext}
  selectedPath={$selectedPath}
/>
```

Render the folder context menu:
```svelte
{#if folderContextMenu}
  <FolderContextMenu
    x={folderContextMenu.x}
    y={folderContextMenu.y}
    isEmpty={($folderFileCounts.get(folderContextMenu.path) ?? 0) === 0}
    onNewPromptHere={() => handleNewPromptInFolder(folderContextMenu!.path)}
    onNewFolderInside={() => handleCreateFolder(folderContextMenu!.path)}
    onRename={() => handleRenameFolder(folderContextMenu!.path)}
    onDelete={() => handleDeleteFolder(folderContextMenu!.path)}
    onClose={() => { folderContextMenu = null; }}
  />
{/if}
```

Add import for `folderFileCounts`:
```typescript
import { folderFileCounts } from "../stores/files";
```

And import `addToast`:
```typescript
import { addToast } from "../stores/toast";
```

**Step 5: Commit**

```bash
git add src/lib/components/FolderContextMenu.svelte src/lib/components/FolderTree.svelte src/lib/components/Sidebar.svelte
git commit -m "feat: add folder context menu, create folder button, and file counts"
```

---

## Task 6: Duplicate Prompt (End-to-End)

**Files:**
- Modify: `src/lib/components/Sidebar.svelte` (update `handleDuplicate`)

**Step 1: Replace the existing `handleDuplicate` function**

The current implementation (lines 63-76) manually creates a file and copies the body. Replace with:

```typescript
async function handleDuplicate(path: string) {
  try {
    const file = await api.duplicateFile(path);
    await loadFiles();
    openFile(file.path);
    addToast(`Duplicated as "${file.frontmatter.title}"`, "success", 2000);
  } catch (err) {
    console.error("Failed to duplicate:", err);
    addToast("Failed to duplicate", "error");
  }
}
```

**Step 2: Commit**

```bash
git add src/lib/components/Sidebar.svelte
git commit -m "feat: wire duplicate prompt through dedicated backend command"
```

---

## Task 7: Drag-and-Drop — Files Between Folders

**Files:**
- Modify: `src/lib/components/FolderTree.svelte`
- Modify: `src/lib/components/Sidebar.svelte`

**Step 1: Add drag state store**

Add to `files.ts`:

```typescript
export const dragState = writable<{
  type: "file" | "folder" | "files";
  paths: string[];
} | null>(null);
```

**Step 2: Add drag handlers to file rows in `FolderTree.svelte`**

Add imports:
```typescript
import { dragState, selectedPaths } from "../stores/files";
import { get } from "svelte/store";
```

Add props:
```typescript
onFileDrop?: (sourcePaths: string[], destinationFolder: string) => void;
onFolderDrop?: (sourceFolder: string, destinationFolder: string) => void;
```

Add drag/drop state:
```typescript
let dropTarget = $state(false);
```

Update the file-row button — add drag attributes and handlers:
```svelte
<button
  class="file-row"
  class:selected={selectedPath === file.path || $selectedPaths.has(file.path)}
  style="padding-left: {(node.name ? depth + 1 : depth) * 16 + 8}px"
  draggable="true"
  onclick={(e) => onFileSelect(file.path, e)}
  oncontextmenu={(e) => { e.preventDefault(); onFileContext?.(file.path, e.clientX, e.clientY); }}
  ondragstart={(e) => {
    const sel = get(selectedPaths);
    const paths = sel.has(file.path) && sel.size > 1
      ? [...sel]
      : [file.path];
    dragState.set({ type: paths.length > 1 ? "files" : "file", paths });
    e.dataTransfer!.effectAllowed = "move";
    e.dataTransfer!.setData("text/plain", paths.join("\n"));
  }}
  ondragend={() => { dragState.set(null); }}
>
```

Update the folder-row button — add drop target handlers:
```svelte
<button
  class="folder-row"
  class:drop-target={dropTarget}
  style="padding-left: {depth * 16 + 8}px"
  onclick={toggleExpand}
  oncontextmenu={(e) => { e.preventDefault(); onFolderContext?.(node.path, e.clientX, e.clientY); }}
  draggable="true"
  ondragstart={(e) => {
    dragState.set({ type: "folder", paths: [node.path] });
    e.dataTransfer!.effectAllowed = "move";
    e.dataTransfer!.setData("text/plain", node.path);
  }}
  ondragend={() => { dragState.set(null); }}
  ondragover={(e) => {
    const ds = get(dragState);
    if (!ds) return;
    // Prevent dropping folder into itself or its descendants
    if (ds.type === "folder" && (node.path === ds.paths[0] || node.path.startsWith(ds.paths[0] + "/"))) return;
    e.preventDefault();
    e.dataTransfer!.dropEffect = "move";
    dropTarget = true;
  }}
  ondragleave={() => { dropTarget = false; }}
  ondrop={(e) => {
    e.preventDefault();
    dropTarget = false;
    const ds = get(dragState);
    if (!ds) return;
    if (ds.type === "folder") {
      onFolderDrop?.(ds.paths[0], node.path);
    } else {
      onFileDrop?.(ds.paths, node.path);
    }
    dragState.set(null);
  }}
>
```

Add CSS for drop target:
```css
.folder-row.drop-target {
  background: var(--accent-subtle);
  outline: 1px dashed var(--accent);
  outline-offset: -1px;
}
```

Pass through the new props in `<svelte:self>`:
```svelte
<svelte:self
  node={child}
  depth={node.name ? depth + 1 : depth}
  {onFileSelect}
  {onFileContext}
  {onFolderContext}
  {onFileDrop}
  {onFolderDrop}
  {selectedPath}
/>
```

**Step 3: Update `onFileSelect` signature for modifier keys**

In the Props interface:
```typescript
onFileSelect: (path: string, event?: MouseEvent) => void;
```

**Step 4: Wire drop handlers in `Sidebar.svelte`**

Add handlers:
```typescript
async function handleFileDrop(sourcePaths: string[], destinationFolder: string) {
  try {
    if (sourcePaths.length === 1) {
      const filename = sourcePaths[0].split("/").pop()!;
      const newPath = destinationFolder ? `${destinationFolder}/${filename}` : filename;
      await api.moveFile(sourcePaths[0], newPath);
    } else {
      await api.moveFiles(sourcePaths, destinationFolder);
    }
    // Close tabs for moved files and reopen at new paths
    for (const p of sourcePaths) {
      closeTab(p);
    }
    clearSelection();
    await loadFiles();
    addToast(`Moved ${sourcePaths.length} item(s)`, "success", 2000);
  } catch (err) {
    console.error("Failed to move:", err);
    addToast("Failed to move files", "error");
  }
}

async function handleFolderDrop(sourceFolder: string, destinationFolder: string) {
  try {
    const folderName = sourceFolder.split("/").pop()!;
    const newPath = destinationFolder ? `${destinationFolder}/${folderName}` : folderName;
    await api.renameFolder(sourceFolder, newPath);
    await loadFiles();
    addToast("Folder moved", "success", 2000);
  } catch (err) {
    console.error("Failed to move folder:", err);
    addToast("Failed to move folder", "error");
  }
}
```

Add `clearSelection` import from files store.

Pass props to FolderTree:
```svelte
<FolderTree
  node={$folderTree}
  onFileSelect={handleFileSelect}
  onFileContext={handleFileContext}
  onFolderContext={handleFolderContext}
  onFileDrop={handleFileDrop}
  onFolderDrop={handleFolderDrop}
  selectedPath={$selectedPath}
/>
```

**Step 5: Add root-level drop zone in `Sidebar.svelte`**

Wrap the tree-container or add a drop zone at the bottom:
```svelte
<div
  class="tree-container"
  ondragover={(e) => {
    const ds = get(dragState);
    if (!ds) return;
    e.preventDefault();
    e.dataTransfer!.dropEffect = "move";
  }}
  ondrop={(e) => {
    e.preventDefault();
    const ds = get(dragState);
    if (!ds) return;
    if (ds.type === "folder") {
      handleFolderDrop(ds.paths[0], "");
    } else {
      handleFileDrop(ds.paths, "");
    }
    dragState.set(null);
  }}
>
```

Add import:
```typescript
import { dragState, clearSelection } from "../stores/files";
import { get } from "svelte/store";
```

**Step 6: Commit**

```bash
git add src/lib/stores/files.ts src/lib/components/FolderTree.svelte src/lib/components/Sidebar.svelte
git commit -m "feat: add drag-and-drop for files and folders between locations"
```

---

## Task 8: Drag Reorder Within Folders

**Files:**
- Modify: `src/lib/components/FolderTree.svelte`
- Uses: `saveCustomOrder` from `files.ts` (already added in Task 3)

**Step 1: Add reorder drop state and insertion indicator**

Add to FolderTree script:
```typescript
let insertTarget = $state<{ path: string; position: "above" | "below" } | null>(null);
```

**Step 2: Add reorder drag handlers to file rows**

Add to each file row's handlers — detect if the drag is within the same folder:

```svelte
ondragover={(e) => {
  const ds = get(dragState);
  if (!ds || ds.type === "folder") return;
  // Check if source is in the same folder
  const sourceFolder = ds.paths[0].includes("/") ? ds.paths[0].substring(0, ds.paths[0].lastIndexOf("/")) : "";
  const thisFolder = file.path.includes("/") ? file.path.substring(0, file.path.lastIndexOf("/")) : "";
  if (sourceFolder !== thisFolder) return;
  e.preventDefault();
  e.dataTransfer!.dropEffect = "move";
  const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
  const midY = rect.top + rect.height / 2;
  insertTarget = { path: file.path, position: e.clientY < midY ? "above" : "below" };
}}
ondragleave={() => { if (insertTarget?.path === file.path) insertTarget = null; }}
ondrop={(e) => {
  const ds = get(dragState);
  if (!ds) return;
  const sourceFolder = ds.paths[0].includes("/") ? ds.paths[0].substring(0, ds.paths[0].lastIndexOf("/")) : "";
  const thisFolder = file.path.includes("/") ? file.path.substring(0, file.path.lastIndexOf("/")) : "";
  if (sourceFolder !== thisFolder) {
    // Cross-folder drop already handled by folder drop target
    return;
  }
  e.preventDefault();
  e.stopPropagation();

  // Reorder within this folder
  const currentOrder = node.files.map((f) => f.path);
  const draggedPath = ds.paths[0];
  const filtered = currentOrder.filter((p) => p !== draggedPath);
  const targetIdx = filtered.indexOf(file.path);
  const insertIdx = insertTarget?.position === "above" ? targetIdx : targetIdx + 1;
  filtered.splice(insertIdx, 0, draggedPath);
  saveCustomOrder(node.path, filtered);

  insertTarget = null;
  dragState.set(null);
  // Trigger re-render by reloading
  loadFiles();
}}
```

**Step 3: Show insertion line**

Add a visual indicator on the file row:
```svelte
<button
  class="file-row"
  class:selected={selectedPath === file.path || $selectedPaths.has(file.path)}
  class:insert-above={insertTarget?.path === file.path && insertTarget?.position === "above"}
  class:insert-below={insertTarget?.path === file.path && insertTarget?.position === "below"}
  ...
>
```

CSS:
```css
.file-row.insert-above {
  box-shadow: 0 -2px 0 0 var(--accent);
}
.file-row.insert-below {
  box-shadow: 0 2px 0 0 var(--accent);
}
```

Add `saveCustomOrder` and `loadFiles` imports:
```typescript
import { saveCustomOrder, loadFiles } from "../stores/files";
```

**Step 4: Commit**

```bash
git add src/lib/components/FolderTree.svelte
git commit -m "feat: add drag-to-reorder within folders with localStorage persistence"
```

---

## Task 9: Bulk Selection

**Files:**
- Modify: `src/lib/components/FolderTree.svelte`
- Modify: `src/lib/components/Sidebar.svelte`
- Modify: `src/lib/components/FileContextMenu.svelte`

**Step 1: Update `handleFileSelect` in `Sidebar.svelte` for modifier keys**

Replace the existing `handleFileSelect`:
```typescript
let lastClickedPath = $state<string>("");

function handleFileSelect(path: string, event?: MouseEvent) {
  if (event?.metaKey || event?.ctrlKey) {
    // Cmd/Ctrl+Click: toggle selection without opening
    toggleSelection(path, true);
    return;
  }
  if (event?.shiftKey && lastClickedPath) {
    // Shift+Click: range select
    selectRange(lastClickedPath, path, get(filteredEntries));
    return;
  }
  // Normal click: open file, clear multi-selection
  clearSelection();
  lastClickedPath = path;
  openFile(path);
}
```

Add imports:
```typescript
import { toggleSelection, selectRange, clearSelection, selectedPaths, filteredEntries } from "../stores/files";
```

**Step 2: Add Escape key handler to clear selection**

In `Sidebar.svelte`, add a keydown handler at the component level:
```svelte
<svelte:window onkeydown={(e) => {
  if (e.key === "Escape") clearSelection();
  if ((e.metaKey || e.ctrlKey) && e.key === "a" && document.activeElement?.closest(".sidebar")) {
    e.preventDefault();
    selectAll();
  }
}} />
```

Add `selectAll` import.

**Step 3: Add selection count badge to sidebar header**

After the header-actions div:
```svelte
{#if $selectedPaths.size > 1}
  <div class="selection-badge">{$selectedPaths.size} selected</div>
{/if}
```

CSS:
```css
.selection-badge {
  font-size: var(--font-size-xs, 11px);
  color: var(--accent);
  padding: var(--space-1) var(--space-2);
  margin-top: var(--space-1);
}
```

**Step 4: Update `FileContextMenu.svelte` for bulk mode**

Add props:
```typescript
interface Props {
  x: number;
  y: number;
  bulkCount: number;
  onRename: () => void;
  onDuplicate: () => void;
  onDelete: () => void;
  onMoveTo: () => void;
  onAddTag: () => void;
  onClose: () => void;
}

let { x, y, bulkCount, onRename, onDuplicate, onDelete, onMoveTo, onAddTag, onClose }: Props = $props();
```

Update the template:
```svelte
<div class="context-menu" style="left: {x}px; top: {y}px" onclick={(e) => e.stopPropagation()}>
  {#if bulkCount <= 1}
    <button class="menu-item" onclick={() => handleAction(onRename)}>Rename</button>
    <button class="menu-item" onclick={() => handleAction(onDuplicate)}>Duplicate</button>
  {/if}
  <button class="menu-item" onclick={() => handleAction(onMoveTo)}>Move to...</button>
  {#if bulkCount > 1}
    <button class="menu-item" onclick={() => handleAction(onAddTag)}>Add Tag to All</button>
  {/if}
  <div class="separator"></div>
  <button class="menu-item danger" onclick={() => handleAction(onDelete)}>
    {bulkCount > 1 ? `Delete ${bulkCount} items` : "Delete"}
  </button>
</div>
```

**Step 5: Update context menu usage in `Sidebar.svelte`**

```svelte
{#if contextMenu}
  <FileContextMenu
    x={contextMenu.x}
    y={contextMenu.y}
    bulkCount={$selectedPaths.size > 1 ? $selectedPaths.size : 1}
    onRename={() => handleRename(contextMenu!.path)}
    onDuplicate={() => handleDuplicate(contextMenu!.path)}
    onDelete={() => {
      if ($selectedPaths.size > 1) {
        handleBulkDeleteRequest();
      } else {
        handleDeleteRequest(contextMenu!.path);
      }
    }}
    onMoveTo={() => {
      const paths = $selectedPaths.size > 1 ? [...$selectedPaths] : [contextMenu!.path];
      moveToTargetPaths = paths;
      moveToDialogVisible = true;
    }}
    onAddTag={() => {
      bulkTagDialogVisible = true;
    }}
    onClose={() => { contextMenu = null; }}
  />
{/if}
```

Add bulk delete handler:
```typescript
async function handleBulkDeleteRequest() {
  deleteTargetPath = "";
  deleteConfirmVisible = true;
}
```

Update delete confirm dialog message:
```svelte
<ConfirmDialog
  visible={deleteConfirmVisible}
  title={$selectedPaths.size > 1 ? "Delete Files" : "Delete File"}
  message={$selectedPaths.size > 1
    ? `This will permanently delete ${$selectedPaths.size} files. Are you sure?`
    : "This will permanently delete this file. Are you sure?"}
  confirmLabel="Delete"
  cancelLabel="Cancel"
  onConfirm={handleDeleteConfirm}
  onCancel={() => { deleteConfirmVisible = false; }}
/>
```

Update `handleDeleteConfirm` for bulk:
```typescript
async function handleDeleteConfirm() {
  deleteConfirmVisible = false;
  try {
    if ($selectedPaths.size > 1) {
      for (const path of $selectedPaths) {
        await api.deleteFile(path);
        closeTab(path);
      }
      clearSelection();
    } else {
      await api.deleteFile(deleteTargetPath);
      closeTab(deleteTargetPath);
    }
    await loadFiles();
  } catch (err) {
    console.error("Failed to delete:", err);
    addToast("Failed to delete", "error");
  }
}
```

**Step 6: Add bulk tag dialog state** (simple reuse of InputDialog)

```typescript
let bulkTagDialogVisible = $state(false);

async function handleBulkAddTag(tag: string) {
  bulkTagDialogVisible = false;
  const t = tag.trim().toLowerCase();
  if (!t) return;
  try {
    for (const path of $selectedPaths) {
      const file = await api.readFile(path);
      if (!file.frontmatter.tags.includes(t)) {
        await api.writeFile(path, { tags: [...file.frontmatter.tags, t] });
      }
    }
    await loadFiles();
    addToast(`Added tag "${t}" to ${$selectedPaths.size} files`, "success", 2000);
  } catch (err) {
    console.error("Failed to add tag:", err);
    addToast("Failed to add tag", "error");
  }
}
```

Render the dialog:
```svelte
<InputDialog
  visible={bulkTagDialogVisible}
  title="Add Tag to All"
  placeholder="Enter tag name..."
  defaultValue=""
  onConfirm={handleBulkAddTag}
  onCancel={() => { bulkTagDialogVisible = false; }}
/>
```

**Step 7: Commit**

```bash
git add src/lib/components/FolderTree.svelte src/lib/components/Sidebar.svelte src/lib/components/FileContextMenu.svelte
git commit -m "feat: add bulk selection with shift/cmd-click, bulk delete, and bulk tag"
```

---

## Task 10: Move to Folder Dialog

**Files:**
- Create: `src/lib/components/MoveToFolderDialog.svelte`
- Modify: `src/lib/components/Sidebar.svelte`

**Step 1: Create `MoveToFolderDialog.svelte`**

```svelte
<script lang="ts">
  import { allFolderPaths } from "../stores/files";
  import { api } from "../ipc";

  interface Props {
    visible: boolean;
    paths: string[];
    onConfirm: (destination: string) => void;
    onCancel: () => void;
  }

  let { visible, paths, onConfirm, onCancel }: Props = $props();

  let selectedFolder = $state("");
  let filterText = $state("");
  let creatingFolder = $state(false);
  let newFolderName = $state("");

  let filteredFolders = $derived(() => {
    const q = filterText.toLowerCase();
    const folders = ["", ...$allFolderPaths];
    return q ? folders.filter((f) => f.toLowerCase().includes(q) || f === "") : folders;
  });

  function displayName(folderPath: string): string {
    if (!folderPath) return "/ (root)";
    return folderPath;
  }

  function isCurrent(folderPath: string): boolean {
    if (paths.length === 0) return false;
    const firstFileDir = paths[0].includes("/")
      ? paths[0].substring(0, paths[0].lastIndexOf("/"))
      : "";
    return folderPath === firstFileDir;
  }

  function handleKeydown(e: KeyboardEvent) {
    if (!visible) return;
    if (e.key === "Escape") {
      onCancel();
    } else if (e.key === "Enter") {
      if (creatingFolder) {
        handleCreateFolder();
      } else {
        onConfirm(selectedFolder);
      }
    }
  }

  async function handleCreateFolder() {
    const name = newFolderName.trim().toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
    if (!name) return;
    const folderPath = selectedFolder ? `${selectedFolder}/${name}` : name;
    try {
      await api.createFolder(folderPath);
      selectedFolder = folderPath;
      creatingFolder = false;
      newFolderName = "";
    } catch (err) {
      console.error("Failed to create folder:", err);
    }
  }

  $effect(() => {
    if (visible) {
      selectedFolder = "";
      filterText = "";
      creatingFolder = false;
      newFolderName = "";
    }
  });
</script>

<svelte:window onkeydown={handleKeydown} />

{#if visible}
  <div class="overlay" onclick={onCancel}>
    <div class="dialog" onclick={(e) => e.stopPropagation()}>
      <h3>Move {paths.length > 1 ? `${paths.length} items` : "file"} to...</h3>

      <input
        class="filter-input"
        type="text"
        placeholder="Filter folders..."
        bind:value={filterText}
      />

      <div class="folder-list">
        {#each filteredFolders() as folder}
          <button
            class="folder-option"
            class:selected={selectedFolder === folder}
            class:current={isCurrent(folder)}
            onclick={() => { selectedFolder = folder; }}
            ondblclick={() => { onConfirm(folder); }}
          >
            <svg width="14" height="14" viewBox="0 0 14 12" fill="none">
              <path d="M1 2.5A1.5 1.5 0 012.5 1H5l1.5 2H11.5A1.5 1.5 0 0113 4.5v5A1.5 1.5 0 0111.5 11h-9A1.5 1.5 0 011 9.5z" stroke="currentColor" stroke-width="1.2"/>
            </svg>
            <span>{displayName(folder)}</span>
            {#if isCurrent(folder)}
              <span class="current-label">(current)</span>
            {/if}
          </button>
        {/each}
      </div>

      {#if creatingFolder}
        <div class="new-folder-row">
          <input
            class="new-folder-input"
            type="text"
            placeholder="Folder name..."
            bind:value={newFolderName}
            autofocus
          />
          <button class="btn btn-sm" onclick={handleCreateFolder}>Create</button>
          <button class="btn btn-sm btn-ghost" onclick={() => { creatingFolder = false; }}>Cancel</button>
        </div>
      {:else}
        <button class="new-folder-btn" onclick={() => { creatingFolder = true; }}>
          + New Folder
        </button>
      {/if}

      <div class="dialog-actions">
        <button class="btn btn-ghost" onclick={onCancel}>Cancel</button>
        <button class="btn btn-primary" onclick={() => onConfirm(selectedFolder)}>
          Move Here
        </button>
      </div>
    </div>
  </div>
{/if}

<style>
  .overlay {
    position: fixed;
    inset: 0;
    z-index: 300;
    background: rgba(0, 0, 0, 0.5);
    display: flex;
    align-items: center;
    justify-content: center;
  }
  .dialog {
    background: var(--bg-secondary);
    border: 1px solid var(--border-primary);
    border-radius: var(--radius-lg);
    padding: var(--space-4);
    width: 360px;
    max-height: 480px;
    display: flex;
    flex-direction: column;
    gap: var(--space-3);
    box-shadow: var(--shadow-popover);
  }
  h3 {
    margin: 0;
    font-size: var(--font-size-base);
    font-weight: var(--font-weight-semibold);
    color: var(--text-primary);
  }
  .filter-input, .new-folder-input {
    width: 100%;
    padding: var(--space-1) var(--space-2);
    background: var(--bg-primary);
    border: 1px solid var(--border-primary);
    border-radius: var(--radius-md);
    color: var(--text-primary);
    font-size: var(--font-size-sm);
    font-family: inherit;
    outline: none;
  }
  .filter-input:focus, .new-folder-input:focus {
    border-color: var(--accent);
  }
  .folder-list {
    flex: 1;
    overflow-y: auto;
    max-height: 240px;
    display: flex;
    flex-direction: column;
    gap: 1px;
  }
  .folder-option {
    display: flex;
    align-items: center;
    gap: var(--space-2);
    padding: var(--space-1) var(--space-2);
    border: none;
    background: none;
    color: var(--text-primary);
    font-size: var(--font-size-sm);
    text-align: left;
    border-radius: var(--radius-sm);
    cursor: pointer;
    font-family: inherit;
    transition: background var(--transition-fast);
  }
  .folder-option:hover {
    background: var(--accent-subtle);
  }
  .folder-option.selected {
    background: var(--accent-selection);
  }
  .folder-option.current {
    opacity: 0.6;
  }
  .current-label {
    color: var(--text-tertiary);
    font-size: var(--font-size-xs, 11px);
    margin-left: auto;
  }
  .new-folder-row {
    display: flex;
    gap: var(--space-2);
    align-items: center;
  }
  .new-folder-btn {
    color: var(--accent);
    font-size: var(--font-size-sm);
    font-family: inherit;
    padding: var(--space-1) var(--space-2);
    text-align: left;
    cursor: pointer;
    border-radius: var(--radius-sm);
    transition: background var(--transition-fast);
  }
  .new-folder-btn:hover {
    background: var(--accent-subtle);
  }
  .dialog-actions {
    display: flex;
    justify-content: flex-end;
    gap: var(--space-2);
  }
  .btn {
    padding: var(--space-1) var(--space-3);
    border-radius: var(--radius-md);
    font-size: var(--font-size-sm);
    font-family: inherit;
    cursor: pointer;
    transition: background var(--transition-fast);
  }
  .btn-primary {
    background: var(--accent);
    color: white;
    border: none;
  }
  .btn-primary:hover {
    filter: brightness(1.1);
  }
  .btn-ghost {
    background: none;
    color: var(--text-secondary);
    border: 1px solid var(--border-primary);
  }
  .btn-ghost:hover {
    background: var(--accent-subtle);
  }
  .btn-sm {
    padding: var(--space-1) var(--space-2);
    font-size: var(--font-size-xs, 11px);
  }
</style>
```

**Step 2: Wire MoveToFolderDialog in `Sidebar.svelte`**

Add state and imports:
```typescript
import MoveToFolderDialog from "./MoveToFolderDialog.svelte";

let moveToDialogVisible = $state(false);
let moveToTargetPaths = $state<string[]>([]);

async function handleMoveToConfirm(destination: string) {
  moveToDialogVisible = false;
  try {
    if (moveToTargetPaths.length === 1) {
      const filename = moveToTargetPaths[0].split("/").pop()!;
      const newPath = destination ? `${destination}/${filename}` : filename;
      await api.moveFile(moveToTargetPaths[0], newPath);
      closeTab(moveToTargetPaths[0]);
    } else {
      await api.moveFiles(moveToTargetPaths, destination);
      for (const p of moveToTargetPaths) closeTab(p);
    }
    clearSelection();
    await loadFiles();
    addToast(`Moved ${moveToTargetPaths.length} item(s)`, "success", 2000);
  } catch (err) {
    console.error("Failed to move:", err);
    addToast("Failed to move files", "error");
  }
}
```

Render at end of template:
```svelte
<MoveToFolderDialog
  visible={moveToDialogVisible}
  paths={moveToTargetPaths}
  onConfirm={handleMoveToConfirm}
  onCancel={() => { moveToDialogVisible = false; }}
/>
```

**Step 3: Commit**

```bash
git add src/lib/components/MoveToFolderDialog.svelte src/lib/components/Sidebar.svelte
git commit -m "feat: add Move to Folder dialog with keyboard nav and inline folder creation"
```

---

## Task 11: Polish & Integration Testing

**Files:**
- All modified files from above
- Modify: `src/lib/components/FolderTree.svelte` (minor style tweaks)

**Step 1: Add visual feedback for drag-over on root area**

In the `.tree-container` div in Sidebar, add drag-over styling:
```css
.tree-container.drag-over {
  background: var(--accent-subtle);
}
```

Track with state:
```typescript
let treeDropActive = $state(false);
```

**Step 2: Ensure `.gitkeep` files are hidden from the file list**

In `file_ops.rs` `list_all`, the walker already skips hidden files (names starting with `.`). Verify `.gitkeep` is also excluded. Since `.gitkeep` starts with `.`, it's already hidden. ✓ No change needed.

**Step 3: Edge case — drag file to its own folder is a no-op**

In `handleFileDrop`, add guard:
```typescript
async function handleFileDrop(sourcePaths: string[], destinationFolder: string) {
  // Filter out files already in the destination
  const toMove = sourcePaths.filter((p) => {
    const currentDir = p.includes("/") ? p.substring(0, p.lastIndexOf("/")) : "";
    return currentDir !== destinationFolder;
  });
  if (toMove.length === 0) return;
  // ... rest of handler using toMove instead of sourcePaths
}
```

**Step 4: Edge case — rename folder updates open tabs**

After folder rename, any open tabs whose paths start with the old folder path need updating:
```typescript
// In handleFolderDrop and handleRenameFolder, after loadFiles():
openTabs.update((tabs) =>
  tabs.map((t) => {
    if (t.path.startsWith(oldPath + "/") || t.path === oldPath) {
      const newTabPath = newPath + t.path.slice(oldPath.length);
      return { ...t, path: newTabPath };
    }
    return t;
  }),
);
```

**Step 5: Manual integration test checklist**

Run the app with `npm run tauri dev` and verify:

- [ ] Create a folder via header button
- [ ] Create a folder inside another folder via context menu
- [ ] Rename a folder via context menu
- [ ] Delete an empty folder via context menu
- [ ] Delete non-empty folder shows error/disabled
- [ ] Create a prompt inside a folder via context menu
- [ ] Duplicate a prompt creates a copy with new title
- [ ] Drag a file to a different folder moves it
- [ ] Drag a folder into another folder nests it
- [ ] Drag a folder to root un-nests it
- [ ] Drag a file within a folder reorders it (persists across reload)
- [ ] Cmd+Click selects multiple files
- [ ] Shift+Click range-selects files
- [ ] Right-click multi-selection shows bulk menu
- [ ] Bulk delete works with confirmation
- [ ] Bulk "Add Tag" adds tag to all selected
- [ ] "Move to..." dialog opens, shows folder tree
- [ ] "Move to..." dialog filter works
- [ ] "Move to..." inline "New Folder" creation works
- [ ] Sidebar search filters by file name
- [ ] Sidebar search with Escape clears
- [ ] Folder file counts display correctly
- [ ] Folder counts update after add/move/delete

**Step 6: Commit**

```bash
git add -A
git commit -m "feat: polish drag-drop edge cases and integrate folder management UX"
```
