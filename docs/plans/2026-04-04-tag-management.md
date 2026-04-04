# Tag Management Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add global tag operations (rename, delete, merge) with a dedicated tag management UI.

**Architecture:** Rust backend commands iterate over all prompt files to apply tag transformations with single-commit atomicity. Frontend TagManager modal provides table view of all tags with inline actions.

**Tech Stack:** Rust (serde_yaml, git2), Tauri v2 commands, Svelte 5, TypeScript

---

## Task 1: Backend — Tag query and types

**Files:**
- Modify: `src-tauri/src/types.rs` (add `TagInfo` struct)
- Modify: `src-tauri/src/file_ops.rs` (add `list_tags` function)
- Modify: `src-tauri/src/commands.rs` (add `list_tags` command, update imports)
- Modify: `src-tauri/src/main.rs` (register `list_tags` in handler)

**Step 1: Add `TagInfo` to `types.rs`**

Add after the `RepoStatus` struct (line 252):

```rust
#[derive(Serialize, Deserialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct TagInfo {
    pub name: String,
    pub count: usize,
}
```

**Step 2: Add `list_tags` to `file_ops.rs`**

Add at the end of the file, before any `#[cfg(test)]` block:

```rust
/// Scan all prompt files and return tag usage info: name + file count.
pub fn list_tags(repo_root: &Path) -> Result<Vec<TagInfo>, AppError> {
    let entries = list_all(repo_root)?;
    let mut tag_counts: std::collections::HashMap<String, usize> = std::collections::HashMap::new();

    for entry in &entries {
        for tag in &entry.frontmatter.tags {
            *tag_counts.entry(tag.clone()).or_insert(0) += 1;
        }
    }

    let mut tags: Vec<TagInfo> = tag_counts
        .into_iter()
        .map(|(name, count)| TagInfo { name, count })
        .collect();
    tags.sort_by(|a, b| a.name.to_lowercase().cmp(&b.name.to_lowercase()));
    Ok(tags)
}
```

Also add to the `use` import at the top of `file_ops.rs`:
```rust
use crate::types::{PromptEntry, PromptFile, PromptFrontmatter, RepoConfig, TagInfo};
```

**Step 3: Add `list_tags` command to `commands.rs`**

Add the import of `TagInfo` to the `use crate::types` block:
```rust
use crate::types::{
    CommitEntry, DiffResult, LintResult, PromptEntry, PromptFile, RepoConfig, RepoStatus,
    ResolvedPrompt, SearchFilters, SearchResult, TagInfo, VariableDefinition,
};
```

Add the command:
```rust
#[tauri::command]
pub fn list_tags(state: tauri::State<'_, AppState>) -> Result<Vec<TagInfo>, AppError> {
    crate::file_ops::list_tags(&state.repo_root)
}
```

**Step 4: Register in `main.rs`**

Add `commands::list_tags` to the `generate_handler!` macro.

**Tests:** Run `cargo test` in `src-tauri/` to confirm compilation and that existing tests still pass.

**Commit message:** `Add list_tags backend command with TagInfo type`

---

## Task 2: Backend — Tag mutation commands

**Files:**
- Modify: `src-tauri/src/file_ops.rs` (add `rename_tag`, `delete_tag`, `merge_tags`)
- Modify: `src-tauri/src/commands.rs` (add 3 commands)
- Modify: `src-tauri/src/main.rs` (register 3 new commands)

**Step 1: Add `rename_tag` to `file_ops.rs`**

Add after the `list_tags` function:

```rust
/// Rename a tag across all files. Returns the number of files modified.
pub fn rename_tag(
    repo_root: &Path,
    old_tag: &str,
    new_tag: &str,
    repo: Option<&Repository>,
    config: &RepoConfig,
) -> Result<usize, AppError> {
    if old_tag.is_empty() || new_tag.is_empty() {
        return Err(AppError::Custom("Tag names cannot be empty".into()));
    }
    if old_tag == new_tag {
        return Ok(0);
    }

    let entries = list_all(repo_root)?;
    let mut modified_paths: Vec<String> = Vec::new();

    for entry in &entries {
        if !entry.frontmatter.tags.contains(&old_tag.to_string()) {
            continue;
        }

        let file = read_file(repo_root, &entry.path)?;
        let mut fm = file.frontmatter.clone();

        // Replace old_tag with new_tag, deduplicate
        fm.tags = fm.tags.into_iter().map(|t| {
            if t == old_tag { new_tag.to_string() } else { t }
        }).collect();
        fm.tags.dedup();

        write_file(repo_root, &entry.path, &fm, &file.body)?;
        modified_paths.push(entry.path.clone());
    }

    if !modified_paths.is_empty() && config.auto_commit {
        if let Some(r) = repo {
            let path_refs: Vec<&str> = modified_paths.iter().map(|s| s.as_str()).collect();
            auto_commit(
                r,
                &path_refs,
                "Rename tag",
                Some(&format!("\"{}\" → \"{}\"", old_tag, new_tag)),
                &config.commit_prefix,
            )?;
        }
    }

    Ok(modified_paths.len())
}
```

**Step 2: Add `delete_tag` to `file_ops.rs`**

```rust
/// Remove a tag from all files. Returns the number of files modified.
pub fn delete_tag(
    repo_root: &Path,
    tag: &str,
    repo: Option<&Repository>,
    config: &RepoConfig,
) -> Result<usize, AppError> {
    if tag.is_empty() {
        return Err(AppError::Custom("Tag name cannot be empty".into()));
    }

    let entries = list_all(repo_root)?;
    let mut modified_paths: Vec<String> = Vec::new();

    for entry in &entries {
        if !entry.frontmatter.tags.contains(&tag.to_string()) {
            continue;
        }

        let file = read_file(repo_root, &entry.path)?;
        let mut fm = file.frontmatter.clone();
        fm.tags.retain(|t| t != tag);

        write_file(repo_root, &entry.path, &fm, &file.body)?;
        modified_paths.push(entry.path.clone());
    }

    if !modified_paths.is_empty() && config.auto_commit {
        if let Some(r) = repo {
            let path_refs: Vec<&str> = modified_paths.iter().map(|s| s.as_str()).collect();
            auto_commit(
                r,
                &path_refs,
                "Delete tag",
                Some(&format!("\"{}\"", tag)),
                &config.commit_prefix,
            )?;
        }
    }

    Ok(modified_paths.len())
}
```

**Step 3: Add `merge_tags` to `file_ops.rs`**

```rust
/// Merge multiple source tags into a single target tag. Returns the number of files modified.
pub fn merge_tags(
    repo_root: &Path,
    source_tags: &[String],
    target_tag: &str,
    repo: Option<&Repository>,
    config: &RepoConfig,
) -> Result<usize, AppError> {
    if source_tags.is_empty() {
        return Err(AppError::Custom("No source tags provided".into()));
    }
    if target_tag.is_empty() {
        return Err(AppError::Custom("Target tag cannot be empty".into()));
    }

    let entries = list_all(repo_root)?;
    let mut modified_paths: Vec<String> = Vec::new();

    for entry in &entries {
        let has_source = entry.frontmatter.tags.iter().any(|t| source_tags.contains(t));
        if !has_source {
            continue;
        }

        let file = read_file(repo_root, &entry.path)?;
        let mut fm = file.frontmatter.clone();

        // Replace all source tags with target, then deduplicate
        fm.tags = fm.tags.into_iter().map(|t| {
            if source_tags.contains(&t) { target_tag.to_string() } else { t }
        }).collect();

        // Deduplicate while preserving order
        let mut seen = std::collections::HashSet::new();
        fm.tags.retain(|t| seen.insert(t.clone()));

        write_file(repo_root, &entry.path, &fm, &file.body)?;
        modified_paths.push(entry.path.clone());
    }

    if !modified_paths.is_empty() && config.auto_commit {
        if let Some(r) = repo {
            let path_refs: Vec<&str> = modified_paths.iter().map(|s| s.as_str()).collect();
            let source_list = source_tags.join("\", \"");
            auto_commit(
                r,
                &path_refs,
                "Merge tags",
                Some(&format!("\"{}\" → \"{}\"", source_list, target_tag)),
                &config.commit_prefix,
            )?;
        }
    }

    Ok(modified_paths.len())
}
```

**Step 4: Add Tauri commands to `commands.rs`**

```rust
#[tauri::command]
pub fn rename_tag(
    state: tauri::State<'_, AppState>,
    old_tag: String,
    new_tag: String,
) -> Result<usize, AppError> {
    let count = {
        let repo = state.repo.lock().map_err(|_| AppError::Custom("Internal lock error".into()))?;
        crate::file_ops::rename_tag(&state.repo_root, &old_tag, &new_tag, Some(&*repo), &state.config)?
    };

    // Rebuild search index since tags changed across multiple files
    let entries = crate::file_ops::list_all(&state.repo_root)?;
    let mut search = state.search.lock().map_err(|_| AppError::Custom("Internal lock error".into()))?;
    search.clear();
    for entry in &entries {
        if let Ok(content) = crate::file_ops::read_raw(&state.repo_root, &entry.path) {
            search.add_document(entry, &content);
        }
    }

    Ok(count)
}

#[tauri::command]
pub fn delete_tag(
    state: tauri::State<'_, AppState>,
    tag: String,
) -> Result<usize, AppError> {
    let count = {
        let repo = state.repo.lock().map_err(|_| AppError::Custom("Internal lock error".into()))?;
        crate::file_ops::delete_tag(&state.repo_root, &tag, Some(&*repo), &state.config)?
    };

    let entries = crate::file_ops::list_all(&state.repo_root)?;
    let mut search = state.search.lock().map_err(|_| AppError::Custom("Internal lock error".into()))?;
    search.clear();
    for entry in &entries {
        if let Ok(content) = crate::file_ops::read_raw(&state.repo_root, &entry.path) {
            search.add_document(entry, &content);
        }
    }

    Ok(count)
}

#[tauri::command]
pub fn merge_tags(
    state: tauri::State<'_, AppState>,
    source_tags: Vec<String>,
    target_tag: String,
) -> Result<usize, AppError> {
    let count = {
        let repo = state.repo.lock().map_err(|_| AppError::Custom("Internal lock error".into()))?;
        crate::file_ops::merge_tags(&state.repo_root, &source_tags, &target_tag, Some(&*repo), &state.config)?
    };

    let entries = crate::file_ops::list_all(&state.repo_root)?;
    let mut search = state.search.lock().map_err(|_| AppError::Custom("Internal lock error".into()))?;
    search.clear();
    for entry in &entries {
        if let Ok(content) = crate::file_ops::read_raw(&state.repo_root, &entry.path) {
            search.add_document(entry, &content);
        }
    }

    Ok(count)
}
```

**Step 5: Register in `main.rs`**

Add `commands::rename_tag`, `commands::delete_tag`, `commands::merge_tags` to the `generate_handler!` macro.

**Step 6: Tests in `file_ops.rs`**

Add within the existing `#[cfg(test)]` module (if absent, create one):

```rust
#[cfg(test)]
mod tag_tests {
    use super::*;
    use tempfile::TempDir;

    fn setup_tag_repo() -> (TempDir, std::path::PathBuf) {
        let tmp = TempDir::new().unwrap();
        let root = tmp.path().to_path_buf();

        let file1 = "---\nid: aaa11111\ntitle: File One\ntype: prompt\ntags:\n  - rust\n  - backend\ncreated: \"2024-01-01T00:00:00.000Z\"\nmodified: \"2024-01-01T00:00:00.000Z\"\n---\nBody one\n";
        let file2 = "---\nid: bbb22222\ntitle: File Two\ntype: prompt\ntags:\n  - rust\n  - frontend\ncreated: \"2024-01-01T00:00:00.000Z\"\nmodified: \"2024-01-01T00:00:00.000Z\"\n---\nBody two\n";
        let file3 = "---\nid: ccc33333\ntitle: File Three\ntype: prompt\ntags:\n  - python\ncreated: \"2024-01-01T00:00:00.000Z\"\nmodified: \"2024-01-01T00:00:00.000Z\"\n---\nBody three\n";

        std::fs::write(root.join("file1.md"), file1).unwrap();
        std::fs::write(root.join("file2.md"), file2).unwrap();
        std::fs::write(root.join("file3.md"), file3).unwrap();

        (tmp, root)
    }

    fn no_commit_config() -> RepoConfig {
        let mut config = RepoConfig::default();
        config.auto_commit = false;
        config
    }

    #[test]
    fn test_list_tags() {
        let (_tmp, root) = setup_tag_repo();
        let tags = list_tags(&root).unwrap();

        assert_eq!(tags.len(), 4);
        // Tags should be sorted alphabetically
        let names: Vec<&str> = tags.iter().map(|t| t.name.as_str()).collect();
        assert!(names.contains(&"rust"));
        assert!(names.contains(&"backend"));
        assert!(names.contains(&"frontend"));
        assert!(names.contains(&"python"));

        let rust_tag = tags.iter().find(|t| t.name == "rust").unwrap();
        assert_eq!(rust_tag.count, 2);

        let python_tag = tags.iter().find(|t| t.name == "python").unwrap();
        assert_eq!(python_tag.count, 1);
    }

    #[test]
    fn test_rename_tag() {
        let (_tmp, root) = setup_tag_repo();
        let config = no_commit_config();

        let count = rename_tag(&root, "rust", "rustlang", None, &config).unwrap();
        assert_eq!(count, 2);

        let file1 = read_file(&root, "file1.md").unwrap();
        assert!(file1.frontmatter.tags.contains(&"rustlang".to_string()));
        assert!(!file1.frontmatter.tags.contains(&"rust".to_string()));

        let file3 = read_file(&root, "file3.md").unwrap();
        assert!(!file3.frontmatter.tags.contains(&"rustlang".to_string()));
    }

    #[test]
    fn test_rename_tag_noop_same_name() {
        let (_tmp, root) = setup_tag_repo();
        let config = no_commit_config();

        let count = rename_tag(&root, "rust", "rust", None, &config).unwrap();
        assert_eq!(count, 0);
    }

    #[test]
    fn test_delete_tag() {
        let (_tmp, root) = setup_tag_repo();
        let config = no_commit_config();

        let count = delete_tag(&root, "rust", None, &config).unwrap();
        assert_eq!(count, 2);

        let file1 = read_file(&root, "file1.md").unwrap();
        assert!(!file1.frontmatter.tags.contains(&"rust".to_string()));
        assert!(file1.frontmatter.tags.contains(&"backend".to_string()));

        // File 3 had no "rust" tag, should be unchanged
        let tags = list_tags(&root).unwrap();
        assert_eq!(tags.len(), 3); // backend, frontend, python
    }

    #[test]
    fn test_merge_tags() {
        let (_tmp, root) = setup_tag_repo();
        let config = no_commit_config();

        let sources = vec!["backend".to_string(), "frontend".to_string()];
        let count = merge_tags(&root, &sources, "dev", None, &config).unwrap();
        assert_eq!(count, 2);

        let file1 = read_file(&root, "file1.md").unwrap();
        assert!(file1.frontmatter.tags.contains(&"dev".to_string()));
        assert!(!file1.frontmatter.tags.contains(&"backend".to_string()));
        assert!(file1.frontmatter.tags.contains(&"rust".to_string()));

        let file2 = read_file(&root, "file2.md").unwrap();
        assert!(file2.frontmatter.tags.contains(&"dev".to_string()));
        assert!(!file2.frontmatter.tags.contains(&"frontend".to_string()));
    }

    #[test]
    fn test_merge_tags_deduplicates() {
        let (_tmp, root) = setup_tag_repo();
        let config = no_commit_config();

        // file1 has both "rust" and "backend"; merge both into "rust"
        let sources = vec!["rust".to_string(), "backend".to_string()];
        let count = merge_tags(&root, &sources, "rust", None, &config).unwrap();
        assert_eq!(count, 2); // file1 and file2 both have at least one source

        let file1 = read_file(&root, "file1.md").unwrap();
        // Should have "rust" exactly once
        assert_eq!(file1.frontmatter.tags.iter().filter(|t| *t == "rust").count(), 1);
        assert!(!file1.frontmatter.tags.contains(&"backend".to_string()));
    }

    #[test]
    fn test_delete_tag_empty_name_errors() {
        let (_tmp, root) = setup_tag_repo();
        let config = no_commit_config();
        assert!(delete_tag(&root, "", None, &config).is_err());
    }

    #[test]
    fn test_rename_tag_empty_name_errors() {
        let (_tmp, root) = setup_tag_repo();
        let config = no_commit_config();
        assert!(rename_tag(&root, "", "new", None, &config).is_err());
        assert!(rename_tag(&root, "old", "", None, &config).is_err());
    }
}
```

**Commit message:** `Add rename_tag, delete_tag, merge_tags backend commands with tests`

---

## Task 3: Frontend — IPC and store

**Files:**
- Modify: `src/lib/types.ts` (add `TagInfo` interface)
- Modify: `src/lib/ipc.ts` (add 4 IPC methods)
- Create: `src/lib/stores/tags.ts` (tag store with loading/refresh)

**Step 1: Add `TagInfo` to `types.ts`**

Add after the `RepoStatus` interface (line 112):

```typescript
export interface TagInfo {
  name: string;
  count: number;
}
```

**Step 2: Add IPC methods to `ipc.ts`**

Add the `TagInfo` import:
```typescript
import type {
  PromptEntry,
  PromptFile,
  CommitEntry,
  DiffResult,
  ResolvedPrompt,
  LintResult,
  SearchResult,
  RepoStatus,
  RepoConfig,
  TagInfo,
  VariableDefinition,
} from "./types";
```

Add to the `api` object (after the `reindex` method):

```typescript
  // Tag management
  listTags: () => call<TagInfo[]>("list_tags"),
  renameTag: (oldTag: string, newTag: string) =>
    call<number>("rename_tag", { old_tag: oldTag, new_tag: newTag }),
  deleteTag: (tag: string) =>
    call<number>("delete_tag", { tag }),
  mergeTags: (sourceTags: string[], targetTag: string) =>
    call<number>("merge_tags", { source_tags: sourceTags, target_tag: targetTag }),
```

**Step 3: Create `src/lib/stores/tags.ts`**

```typescript
import { writable } from "svelte/store";
import type { TagInfo } from "../types";
import { api } from "../ipc";

export const tagInfos = writable<TagInfo[]>([]);
export const tagsLoading = writable<boolean>(false);

export async function loadTags(): Promise<void> {
  tagsLoading.set(true);
  try {
    const tags = await api.listTags();
    tagInfos.set(tags);
  } catch (err) {
    console.error("Failed to load tags:", err);
  } finally {
    tagsLoading.set(false);
  }
}

export async function renameTag(oldTag: string, newTag: string): Promise<number> {
  const count = await api.renameTag(oldTag, newTag);
  await loadTags();
  return count;
}

export async function deleteTag(tag: string): Promise<number> {
  const count = await api.deleteTag(tag);
  await loadTags();
  return count;
}

export async function mergeTags(sourceTags: string[], targetTag: string): Promise<number> {
  const count = await api.mergeTags(sourceTags, targetTag);
  await loadTags();
  return count;
}
```

**Commit message:** `Add tag management IPC layer and tag store`

---

## Task 4: Frontend — TagManager modal

**Files:**
- Create: `src/lib/components/TagManager.svelte`

This is the main UI. It follows the same overlay/dialog pattern as `ConfirmDialog.svelte` and `SettingsModal.svelte`.

**Full component:**

```svelte
<script lang="ts">
  import { tagInfos, tagsLoading, loadTags, renameTag, deleteTag, mergeTags } from "../stores/tags";
  import { loadFiles } from "../stores/files";
  import { addToast } from "../stores/toast";

  interface Props {
    visible: boolean;
    onClose: () => void;
  }

  let { visible, onClose }: Props = $props();
  let search = $state("");
  let editingTag = $state<string | null>(null);
  let editValue = $state("");
  let mergeSelection = $state<Set<string>>(new Set());
  let mergeTarget = $state("");
  let showMergePanel = $state(false);
  let confirmDelete = $state<string | null>(null);
  let editInput: HTMLInputElement | undefined = $state();

  let filteredTags = $derived.by(() => {
    const q = search.toLowerCase();
    const tags = $tagInfos;
    if (!q) return tags;
    return tags.filter((t) => t.name.toLowerCase().includes(q));
  });

  $effect(() => {
    if (visible) {
      loadTags();
      search = "";
      editingTag = null;
      mergeSelection = new Set();
      showMergePanel = false;
      confirmDelete = null;
    }
  });

  $effect(() => {
    if (editingTag && editInput) {
      editInput.focus();
    }
  });

  async function handleRename(oldTag: string) {
    const newTag = editValue.trim();
    if (!newTag || newTag === oldTag) {
      editingTag = null;
      return;
    }
    try {
      const count = await renameTag(oldTag, newTag);
      await loadFiles();
      addToast(`Renamed "${oldTag}" → "${newTag}" in ${count} file${count !== 1 ? "s" : ""}`, "success");
    } catch (err) {
      addToast(`Failed to rename tag: ${err}`, "error");
    }
    editingTag = null;
  }

  async function handleDelete(tag: string) {
    try {
      const count = await deleteTag(tag);
      await loadFiles();
      addToast(`Deleted "${tag}" from ${count} file${count !== 1 ? "s" : ""}`, "success");
    } catch (err) {
      addToast(`Failed to delete tag: ${err}`, "error");
    }
    confirmDelete = null;
  }

  function toggleMergeSelect(tag: string) {
    mergeSelection = new Set(mergeSelection);
    if (mergeSelection.has(tag)) {
      mergeSelection.delete(tag);
    } else {
      mergeSelection.add(tag);
    }
  }

  async function handleMerge() {
    const sources = [...mergeSelection];
    const target = mergeTarget.trim();
    if (sources.length < 2 || !target) return;
    try {
      const count = await mergeTags(sources, target);
      await loadFiles();
      addToast(`Merged ${sources.length} tags → "${target}" in ${count} file${count !== 1 ? "s" : ""}`, "success");
      mergeSelection = new Set();
      mergeTarget = "";
      showMergePanel = false;
    } catch (err) {
      addToast(`Failed to merge tags: ${err}`, "error");
    }
  }

  function startEdit(tag: string) {
    editingTag = tag;
    editValue = tag;
  }

  function handleEditKeydown(e: KeyboardEvent, tag: string) {
    if (e.key === "Enter") {
      e.preventDefault();
      handleRename(tag);
    } else if (e.key === "Escape") {
      editingTag = null;
    }
  }

  function handleKeydown(e: KeyboardEvent) {
    if (e.key === "Escape") {
      if (editingTag) {
        editingTag = null;
      } else if (confirmDelete) {
        confirmDelete = null;
      } else if (showMergePanel) {
        showMergePanel = false;
      } else {
        onClose();
      }
    }
  }
</script>

{#if visible}
  <div class="overlay" onclick={(e) => { if (e.target === e.currentTarget) onClose(); }} onkeydown={handleKeydown} role="dialog" aria-modal="true" aria-label="Tag Manager" tabindex="-1">
    <div class="modal">
      <div class="modal-header">
        <h2>Tag Manager</h2>
        <div class="header-actions">
          <button
            class="btn merge-toggle"
            class:active={showMergePanel}
            onclick={() => { showMergePanel = !showMergePanel; mergeSelection = new Set(); }}
          >
            {showMergePanel ? "Cancel Merge" : "Merge Tags"}
          </button>
          <button class="btn close" onclick={onClose}>
            <svg width="14" height="14" viewBox="0 0 14 14">
              <path d="M2 2l10 10M12 2L2 12" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>
            </svg>
          </button>
        </div>
      </div>

      <div class="search-bar">
        <svg class="search-icon" width="13" height="13" viewBox="0 0 16 16">
          <circle cx="6.5" cy="6.5" r="4.5" fill="none" stroke="currentColor" stroke-width="1.3"/>
          <path d="M10 10l4 4" stroke="currentColor" stroke-width="1.3" stroke-linecap="round"/>
        </svg>
        <input
          type="text"
          placeholder="Filter tags..."
          bind:value={search}
        />
      </div>

      {#if showMergePanel && mergeSelection.size >= 2}
        <div class="merge-panel">
          <span class="merge-label">{mergeSelection.size} tags selected.</span>
          <input
            type="text"
            class="merge-input"
            placeholder="Target tag name..."
            bind:value={mergeTarget}
          />
          <button class="btn primary" disabled={!mergeTarget.trim()} onclick={handleMerge}>
            Merge
          </button>
        </div>
      {:else if showMergePanel}
        <div class="merge-panel">
          <span class="merge-hint">Select at least 2 tags to merge.</span>
        </div>
      {/if}

      <div class="tag-list">
        {#if $tagsLoading}
          <div class="empty-state">Loading tags...</div>
        {:else if filteredTags.length === 0}
          <div class="empty-state">{search ? "No tags match your filter." : "No tags found."}</div>
        {:else}
          <table>
            <thead>
              <tr>
                {#if showMergePanel}<th class="col-check"></th>{/if}
                <th class="col-name">Tag</th>
                <th class="col-count">Files</th>
                <th class="col-actions">Actions</th>
              </tr>
            </thead>
            <tbody>
              {#each filteredTags as tag (tag.name)}
                <tr class:selected={mergeSelection.has(tag.name)}>
                  {#if showMergePanel}
                    <td class="col-check">
                      <input
                        type="checkbox"
                        checked={mergeSelection.has(tag.name)}
                        onchange={() => toggleMergeSelect(tag.name)}
                      />
                    </td>
                  {/if}
                  <td class="col-name">
                    {#if editingTag === tag.name}
                      <input
                        type="text"
                        class="edit-input"
                        bind:this={editInput}
                        bind:value={editValue}
                        onkeydown={(e) => handleEditKeydown(e, tag.name)}
                        onblur={() => handleRename(tag.name)}
                      />
                    {:else}
                      <span class="tag-name">{tag.name}</span>
                    {/if}
                  </td>
                  <td class="col-count">
                    <span class="count-badge">{tag.count}</span>
                  </td>
                  <td class="col-actions">
                    {#if !showMergePanel}
                      <button class="action-btn" title="Rename" onclick={() => startEdit(tag.name)}>
                        <svg width="12" height="12" viewBox="0 0 12 12">
                          <path d="M8.5 1.5l2 2L4 10H2v-2l6.5-6.5z" fill="none" stroke="currentColor" stroke-width="1.1" stroke-linejoin="round"/>
                        </svg>
                      </button>
                      <button class="action-btn delete" title="Delete" onclick={() => { confirmDelete = tag.name; }}>
                        <svg width="12" height="12" viewBox="0 0 12 12">
                          <path d="M3 3l6 6M9 3l-6 6" stroke="currentColor" stroke-width="1.2" stroke-linecap="round"/>
                        </svg>
                      </button>
                    {/if}
                  </td>
                </tr>
              {/each}
            </tbody>
          </table>
        {/if}
      </div>

      <div class="modal-footer">
        <span class="tag-count">{$tagInfos.length} tag{$tagInfos.length !== 1 ? "s" : ""} total</span>
      </div>
    </div>
  </div>
{/if}

<!-- Delete confirmation overlay -->
{#if confirmDelete}
  {@const tag = $tagInfos.find((t) => t.name === confirmDelete)}
  <div class="overlay confirm-overlay" onclick={(e) => { if (e.target === e.currentTarget) confirmDelete = null; }} onkeydown={(e) => { if (e.key === "Escape") confirmDelete = null; }} role="dialog" aria-modal="true" aria-label="Confirm delete" tabindex="-1">
    <div class="confirm-dialog">
      <h3>Delete tag "{confirmDelete}"?</h3>
      <p>This will remove the tag from {tag?.count ?? 0} file{(tag?.count ?? 0) !== 1 ? "s" : ""}. The files themselves will not be deleted.</p>
      <div class="actions">
        <button class="btn cancel" onclick={() => { confirmDelete = null; }}>Cancel</button>
        <button class="btn danger" onclick={() => { if (confirmDelete) handleDelete(confirmDelete); }}>Delete</button>
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
    padding-top: 8vh;
    z-index: 100;
  }
  .confirm-overlay {
    z-index: 110;
  }
  .modal {
    width: 560px;
    max-height: 80vh;
    background: var(--bg-tertiary);
    border: 1px solid var(--border-primary);
    border-radius: var(--radius-lg);
    box-shadow: var(--shadow-xl);
    display: flex;
    flex-direction: column;
    align-self: flex-start;
  }
  .modal-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: var(--space-4) var(--space-5);
    border-bottom: 1px solid var(--border-primary);
  }
  .modal-header h2 {
    margin: 0;
    font-size: var(--font-size-lg);
    font-weight: var(--font-weight-semibold);
    color: var(--text-primary);
  }
  .header-actions {
    display: flex;
    gap: var(--space-2);
    align-items: center;
  }
  .search-bar {
    position: relative;
    padding: var(--space-3) var(--space-5);
    border-bottom: 1px solid var(--border-primary);
  }
  .search-bar .search-icon {
    position: absolute;
    left: calc(var(--space-5) + var(--space-2));
    top: 50%;
    transform: translateY(-50%);
    color: var(--text-muted);
    pointer-events: none;
  }
  .search-bar input {
    width: 100%;
    padding: var(--space-1) var(--space-2) var(--space-1) calc(var(--space-5) + 4px);
    background: var(--bg-secondary);
    border: 1px solid var(--border-primary);
    border-radius: var(--radius-md);
    color: var(--text-primary);
    font-size: var(--font-size-base);
  }
  .search-bar input:focus {
    outline: none;
    border-color: var(--color-accent);
  }
  .merge-panel {
    display: flex;
    align-items: center;
    gap: var(--space-2);
    padding: var(--space-2) var(--space-5);
    background: rgba(255, 255, 255, 0.03);
    border-bottom: 1px solid var(--border-primary);
  }
  .merge-label, .merge-hint {
    font-size: var(--font-size-sm);
    color: var(--text-secondary);
    white-space: nowrap;
  }
  .merge-input {
    flex: 1;
    padding: var(--space-1) var(--space-2);
    background: var(--bg-secondary);
    border: 1px solid var(--border-primary);
    border-radius: var(--radius-md);
    color: var(--text-primary);
    font-size: var(--font-size-sm);
  }
  .merge-input:focus {
    outline: none;
    border-color: var(--color-accent);
  }
  .tag-list {
    flex: 1;
    overflow-y: auto;
    padding: 0;
  }
  table {
    width: 100%;
    border-collapse: collapse;
  }
  thead {
    position: sticky;
    top: 0;
    background: var(--bg-tertiary);
    z-index: 1;
  }
  th {
    text-align: left;
    padding: var(--space-1) var(--space-3);
    font-size: var(--font-size-xs);
    font-weight: var(--font-weight-medium);
    color: var(--text-muted);
    text-transform: uppercase;
    letter-spacing: 0.05em;
    border-bottom: 1px solid var(--border-primary);
  }
  td {
    padding: var(--space-2) var(--space-3);
    border-bottom: 1px solid rgba(255, 255, 255, 0.04);
    font-size: var(--font-size-base);
  }
  tr:hover {
    background: rgba(255, 255, 255, 0.03);
  }
  tr.selected {
    background: rgba(var(--color-accent-rgb, 99, 102, 241), 0.1);
  }
  .col-check {
    width: 32px;
    text-align: center;
  }
  .col-name {
    min-width: 120px;
  }
  .col-count {
    width: 64px;
    text-align: center;
  }
  .col-actions {
    width: 80px;
    text-align: right;
  }
  .tag-name {
    color: var(--text-primary);
  }
  .count-badge {
    display: inline-block;
    padding: 0 var(--space-2);
    background: rgba(255, 255, 255, 0.08);
    border-radius: var(--radius-sm);
    font-size: var(--font-size-sm);
    color: var(--text-secondary);
  }
  .edit-input {
    width: 100%;
    padding: var(--space-1) var(--space-2);
    background: var(--bg-secondary);
    border: 1px solid var(--color-accent);
    border-radius: var(--radius-sm);
    color: var(--text-primary);
    font-size: var(--font-size-base);
  }
  .edit-input:focus {
    outline: none;
  }
  .action-btn {
    background: none;
    border: none;
    padding: var(--space-1);
    color: var(--text-muted);
    border-radius: var(--radius-sm);
    cursor: pointer;
    transition: all var(--transition-fast);
  }
  .action-btn:hover {
    color: var(--text-primary);
    background: rgba(255, 255, 255, 0.08);
  }
  .action-btn.delete:hover {
    color: var(--color-error);
    background: rgba(255, 80, 80, 0.1);
  }
  .btn {
    padding: var(--space-1) var(--space-3);
    border-radius: var(--radius-md);
    font-size: var(--font-size-sm);
    font-weight: var(--font-weight-medium);
    cursor: pointer;
    transition: all var(--transition-fast);
    border: none;
  }
  .btn.primary {
    background: var(--color-accent);
    color: white;
  }
  .btn.primary:hover:not(:disabled) {
    opacity: 0.9;
  }
  .btn.primary:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }
  .btn.merge-toggle {
    background: rgba(255, 255, 255, 0.08);
    color: var(--text-secondary);
  }
  .btn.merge-toggle:hover {
    background: rgba(255, 255, 255, 0.12);
    color: var(--text-primary);
  }
  .btn.merge-toggle.active {
    background: var(--color-accent);
    color: white;
  }
  .btn.close {
    background: none;
    color: var(--text-muted);
    padding: var(--space-1);
  }
  .btn.close:hover {
    color: var(--text-primary);
  }
  .modal-footer {
    padding: var(--space-2) var(--space-5);
    border-top: 1px solid var(--border-primary);
  }
  .tag-count {
    font-size: var(--font-size-xs);
    color: var(--text-muted);
  }
  .empty-state {
    padding: var(--space-8) var(--space-5);
    text-align: center;
    color: var(--text-muted);
    font-size: var(--font-size-base);
  }
  /* Confirm dialog (nested) */
  .confirm-dialog {
    width: 400px;
    background: var(--bg-tertiary);
    border: 1px solid var(--border-primary);
    border-radius: var(--radius-lg);
    padding: var(--space-5);
    box-shadow: var(--shadow-xl);
    align-self: flex-start;
    margin-top: 15vh;
  }
  .confirm-dialog h3 {
    margin: 0 0 var(--space-2);
    font-size: var(--font-size-lg);
    font-weight: var(--font-weight-semibold);
    color: var(--text-primary);
  }
  .confirm-dialog p {
    margin: 0 0 var(--space-4);
    font-size: var(--font-size-md);
    color: var(--text-secondary);
  }
  .actions {
    display: flex;
    justify-content: flex-end;
    gap: var(--space-2);
  }
  .btn.cancel {
    background: rgba(255, 255, 255, 0.08);
    color: var(--text-secondary);
  }
  .btn.cancel:hover {
    background: rgba(255, 255, 255, 0.12);
    color: var(--text-primary);
  }
  .btn.danger {
    background: var(--color-error);
    color: white;
  }
  .btn.danger:hover {
    background: #ff6961;
  }
</style>
```

**Commit message:** `Add TagManager modal component with rename, delete, and merge UI`

---

## Task 5: Frontend — Integration

**Files:**
- Modify: `src/lib/components/Sidebar.svelte` (add "Manage Tags" button, import TagManager)
- Modify: `src/lib/components/CommandPalette.svelte` (add "Manage Tags" command)
- Modify: `src/App.svelte` (add TagManager state if needed by top-level)

**Step 1: Add "Manage Tags" button to `Sidebar.svelte`**

Add the import at the top of the `<script>`:
```typescript
import TagManager from "./TagManager.svelte";
```

Add state:
```typescript
let showTagManager = $state(false);
```

Add a small "Manage" button next to the `<TagFilter />` line. Replace:
```svelte
<TagFilter />
```
with:
```svelte
<div class="tag-section">
  <div class="tag-section-header">
    <span class="section-label">Tags</span>
    <button class="manage-tags-btn" title="Manage tags" onclick={() => { showTagManager = true; }}>
      <svg width="12" height="12" viewBox="0 0 12 12">
        <circle cx="2" cy="6" r="1" fill="currentColor"/>
        <circle cx="6" cy="6" r="1" fill="currentColor"/>
        <circle cx="10" cy="6" r="1" fill="currentColor"/>
      </svg>
    </button>
  </div>
  <TagFilter />
</div>

<TagManager visible={showTagManager} onClose={() => { showTagManager = false; }} />
```

Add styles for the tag section header:
```css
.tag-section {
  padding: 0;
}
.tag-section-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: var(--space-1) var(--space-3) 0;
}
.section-label {
  font-size: var(--font-size-xs);
  font-weight: var(--font-weight-medium);
  color: var(--text-muted);
  text-transform: uppercase;
  letter-spacing: 0.05em;
}
.manage-tags-btn {
  background: none;
  border: none;
  padding: var(--space-1);
  color: var(--text-muted);
  border-radius: var(--radius-sm);
  cursor: pointer;
  transition: all var(--transition-fast);
}
.manage-tags-btn:hover {
  color: var(--text-primary);
  background: rgba(255, 255, 255, 0.08);
}
```

**Step 2: Add command to `CommandPalette.svelte`**

The command palette needs a way to open the TagManager. Since the commands array is local to CommandPalette, the simplest approach is to use an event or a shared store. Add a writable store to coordinate:

In the `commands` array inside `CommandPalette.svelte`, add:
```typescript
{ id: "tags", label: "Manage Tags", action: () => { onClose(); dispatch("open-tag-manager"); } },
```

However, the current pattern does not use a dispatch. The cleaner approach: add a new `Props` callback.

Add to the `Props` interface:
```typescript
interface Props {
  visible: boolean;
  onClose: () => void;
  onOpenTagManager?: () => void;
}
```

Destructure:
```typescript
let { visible, onClose, onOpenTagManager }: Props = $props();
```

Add command:
```typescript
{ id: "tags", label: "Manage Tags", action: () => { onClose(); onOpenTagManager?.(); } },
```

Then in `App.svelte` (or wherever `CommandPalette` is rendered), pass the callback that sets `showTagManager = true` on the Sidebar or a shared store.

**Alternative (simpler):** Use a writable store `showTagManager` exported from `src/lib/stores/tags.ts`:

Add to `src/lib/stores/tags.ts`:
```typescript
export const showTagManager = writable<boolean>(false);
```

Then in `CommandPalette.svelte`:
```typescript
import { showTagManager } from "../stores/tags";
```

And add the command:
```typescript
{ id: "tags", label: "Manage Tags", action: () => { showTagManager.set(true); onClose(); } },
```

In `Sidebar.svelte`, subscribe to `showTagManager` instead of local state:
```typescript
import { showTagManager } from "../stores/tags";
```

And use `$showTagManager` in the template:
```svelte
<TagManager visible={$showTagManager} onClose={() => { showTagManager.set(false); }} />
```

**Step 3: Load tags on app startup**

In `App.svelte` (or wherever `loadFiles()` is called on mount), add a call to `loadTags()` alongside it:

```typescript
import { loadTags } from "./lib/stores/tags";
```

In the `onMount` or `$effect` that calls `loadFiles()`:
```typescript
await Promise.all([loadFiles(), loadTags()]);
```

**Step 4: Refresh file list after tag operations**

This is already handled in the TagManager component -- each operation calls `await loadFiles()` after the tag mutation completes, which refreshes `promptEntries` and the derived `allTags` store.

**Commit message:** `Wire TagManager to sidebar, command palette, and app startup`
