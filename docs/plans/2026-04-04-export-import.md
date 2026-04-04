# Export/Import Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Export prompts as clipboard text or zip archives, and import prompts from external files or plain text.

**Architecture:** Rust backend handles file reading, zip creation, and import parsing. Frontend adds copy/export actions to context menus and an import flow with Tauri file dialogs.

**Tech Stack:** Rust (zip crate, walkdir), Tauri v2 (dialog plugin), Svelte 5, TypeScript

---

## Task 1: Backend — Export commands

**Files:**
- Modify: `src-tauri/src/commands.rs` (add `export_file_clipboard` command)
- Modify: `src-tauri/src/main.rs` (register new command)

**Step 1: Add `export_file_clipboard` command to `commands.rs`**

Add at the end of the file, before the closing (after `commit_file`):

```rust
#[tauri::command]
pub fn export_file_clipboard(
    state: tauri::State<'_, AppState>,
    path: String,
    format: String,
    variables: Option<HashMap<String, String>>,
) -> Result<String, AppError> {
    match format.as_str() {
        "raw" => {
            // Full file with frontmatter
            crate::file_ops::read_raw(&state.repo_root, &path)
        }
        "body" => {
            // Just the prompt body (no frontmatter)
            let file = crate::file_ops::read_file(&state.repo_root, &path)?;
            Ok(file.body)
        }
        "resolved" => {
            // Resolved text with variables substituted and includes expanded
            let content = crate::file_ops::read_raw(&state.repo_root, &path)?;
            let resolved = crate::template::resolve_template(
                &path,
                &content,
                &state.repo_root,
                variables.as_ref(),
            )?;
            Ok(resolved.text)
        }
        _ => Err(AppError::Custom(format!(
            "Unknown export format: \"{}\". Expected \"raw\", \"body\", or \"resolved\".",
            format
        ))),
    }
}
```

**Step 2: Register in `main.rs`**

Add `commands::export_file_clipboard` to the `generate_handler!` macro (after `commands::commit_file`):

```rust
commands::export_file_clipboard,
```

**Tests:** Run `cargo test` in `src-tauri/` to confirm compilation and that existing tests still pass.

**Commit message:** `Add export_file_clipboard backend command with raw/body/resolved formats`

---

## Task 2: Backend — Zip export

**Files:**
- Modify: `src-tauri/Cargo.toml` (add `zip` dependency)
- Modify: `src-tauri/src/commands.rs` (add `export_folder_zip` command)
- Modify: `src-tauri/src/main.rs` (register new command)

**Step 1: Add `zip` crate to `Cargo.toml`**

Add to the `[dependencies]` section:

```toml
zip = { version = "2", default-features = false, features = ["deflate"] }
```

**Step 2: Add `export_folder_zip` command to `commands.rs`**

Add after the `export_file_clipboard` command:

```rust
#[tauri::command]
pub fn export_folder_zip(
    state: tauri::State<'_, AppState>,
    folder_path: String,
    output_path: String,
) -> Result<String, AppError> {
    use std::io::Write;
    use walkdir::WalkDir;
    use zip::write::SimpleFileOptions;
    use zip::ZipWriter;

    let repo_root = &state.repo_root;

    // Resolve the source folder within the repo
    let source_dir = if folder_path.is_empty() || folder_path == "/" {
        repo_root.clone()
    } else {
        crate::file_ops::safe_path(repo_root, &folder_path)?
    };

    if !source_dir.is_dir() {
        return Err(AppError::Custom(format!(
            "Not a directory: {}",
            folder_path
        )));
    }

    let out_file = std::fs::File::create(&output_path)?;
    let mut zip = ZipWriter::new(out_file);
    let options = SimpleFileOptions::default()
        .compression_method(zip::CompressionMethod::Deflated);

    let walker = WalkDir::new(&source_dir).into_iter().filter_entry(|e| {
        if e.depth() == 0 {
            return true;
        }
        let name = e.file_name().to_string_lossy();
        !name.starts_with('.') && name != "node_modules" && name != "_templates"
    });

    let mut count = 0usize;

    for entry in walker {
        let entry = entry.map_err(|e| AppError::Custom(format!("walkdir error: {e}")))?;
        if !entry.file_type().is_file() {
            continue;
        }
        let path = entry.path();
        if path.extension().and_then(|e| e.to_str()) != Some("md") {
            continue;
        }

        // Compute path relative to source_dir for the zip entry name
        let rel_path = path
            .strip_prefix(&source_dir)
            .unwrap_or(path)
            .to_string_lossy()
            .replace('\\', "/");

        let content = std::fs::read_to_string(path)?;
        zip.start_file(&rel_path, options)
            .map_err(|e| AppError::Custom(format!("zip error: {e}")))?;
        zip.write_all(content.as_bytes())?;
        count += 1;
    }

    zip.finish().map_err(|e| AppError::Custom(format!("zip finish error: {e}")))?;

    if count == 0 {
        // Clean up the empty zip
        let _ = std::fs::remove_file(&output_path);
        return Err(AppError::Custom(
            "No .md files found in the selected folder".into(),
        ));
    }

    Ok(output_path)
}
```

**Step 3: Make `safe_path` public**

In `src-tauri/src/file_ops.rs`, `safe_path` is already `pub fn safe_path(...)` — verify it is accessible from `commands.rs`. It is: the function is `pub` and imported via `crate::file_ops::safe_path`. No change needed.

**Step 4: Register in `main.rs`**

Add `commands::export_folder_zip` to the `generate_handler!` macro:

```rust
commands::export_folder_zip,
```

**Tests:** Run `cargo test` in `src-tauri/` to confirm compilation. Optionally add a unit test in `file_ops.rs`:

```rust
#[cfg(test)]
mod export_tests {
    use super::*;
    use tempfile::TempDir;

    #[test]
    fn test_safe_path_rejects_traversal() {
        let tmp = TempDir::new().unwrap();
        assert!(safe_path(tmp.path(), "../etc/passwd").is_err());
        assert!(safe_path(tmp.path(), "/absolute/path").is_err());
    }
}
```

**Commit message:** `Add zip export command with deflate compression`

---

## Task 3: Backend — Import commands

**Files:**
- Modify: `src-tauri/src/file_ops.rs` (add `import_external_file` and `import_from_text` helper functions)
- Modify: `src-tauri/src/commands.rs` (add `import_files` and `import_from_text` commands)
- Modify: `src-tauri/src/main.rs` (register 2 new commands)

**Step 1: Add import helpers to `file_ops.rs`**

Add before the `#[cfg(test)]` block at the end of the file:

```rust
/// Import an external `.md` file into the repo.
/// If it has valid frontmatter, preserve it but generate a new ID.
/// Returns the created PromptFile.
pub fn import_external_file(
    repo_root: &Path,
    external_path: &Path,
    destination: &str,
    repo: Option<&Repository>,
    config: &RepoConfig,
) -> Result<PromptFile, AppError> {
    let content = fs::read_to_string(external_path)?;

    let filename = external_path
        .file_name()
        .map(|f| f.to_string_lossy().to_string())
        .unwrap_or_else(|| "imported.md".to_string());

    // Ensure it ends with .md
    let filename = if filename.ends_with(".md") {
        filename
    } else {
        format!("{}.md", filename)
    };

    let rel_path = if destination.is_empty() || destination == "/" {
        filename.clone()
    } else {
        format!("{}/{}", destination.trim_end_matches('/'), filename)
    };

    // Deduplicate: if file already exists, add a suffix
    let final_rel_path = deduplicate_path(repo_root, &rel_path);
    let full = safe_path(repo_root, &final_rel_path)?;

    if let Some(parent) = full.parent() {
        fs::create_dir_all(parent)?;
    }

    // Try parsing the file — if it has frontmatter, rewrite the ID
    let mut parsed = parse_prompt_file(&final_rel_path, &content);
    parsed.frontmatter.id = generate_id();
    parsed.frontmatter.folder = derive_folder_from_path(&final_rel_path);
    let now = Utc::now().format("%Y-%m-%dT%H:%M:%SZ").to_string();
    parsed.frontmatter.modified = now;

    let output = serialize_prompt_file(&parsed.frontmatter, &parsed.body)?;
    fs::write(&full, &output)?;

    if config.auto_commit {
        if let Some(r) = repo {
            auto_commit(
                r,
                &[&final_rel_path],
                "Import",
                Some(&parsed.frontmatter.title),
                &config.commit_prefix,
            )?;
        }
    }

    Ok(PromptFile {
        path: final_rel_path,
        raw: output,
        frontmatter: parsed.frontmatter,
        body: parsed.body,
    })
}

/// Create a new prompt from plain text (no frontmatter).
/// Generates full frontmatter with the given title.
pub fn import_from_text(
    repo_root: &Path,
    text: &str,
    title: &str,
    destination: &str,
    repo: Option<&Repository>,
    config: &RepoConfig,
) -> Result<PromptFile, AppError> {
    let slug = title
        .to_lowercase()
        .replace(|c: char| !c.is_alphanumeric() && c != '-', "-")
        .replace("--", "-")
        .trim_matches('-')
        .to_string();

    let filename = if slug.is_empty() {
        "imported.md".to_string()
    } else {
        format!("{}.md", slug)
    };

    let rel_path = if destination.is_empty() || destination == "/" {
        filename.clone()
    } else {
        format!("{}/{}", destination.trim_end_matches('/'), filename)
    };

    let final_rel_path = deduplicate_path(repo_root, &rel_path);
    let full = safe_path(repo_root, &final_rel_path)?;

    if let Some(parent) = full.parent() {
        fs::create_dir_all(parent)?;
    }

    let now = Utc::now().format("%Y-%m-%dT%H:%M:%SZ").to_string();
    let fm = PromptFrontmatter {
        id: generate_id(),
        title: title.to_string(),
        prompt_type: crate::types::PromptType::Prompt,
        tags: Vec::new(),
        folder: derive_folder_from_path(&final_rel_path),
        model_targets: None,
        variables: Vec::new(),
        includes: Vec::new(),
        created: now.clone(),
        modified: now,
        starred_versions: Vec::new(),
    };

    let output = serialize_prompt_file(&fm, text)?;
    fs::write(&full, &output)?;

    if config.auto_commit {
        if let Some(r) = repo {
            auto_commit(
                r,
                &[&final_rel_path],
                "Import",
                Some(title),
                &config.commit_prefix,
            )?;
        }
    }

    Ok(PromptFile {
        path: final_rel_path,
        raw: output,
        frontmatter: fm,
        body: text.to_string(),
    })
}

/// Given a relative path, return a deduplicated version if it already exists.
/// Appends `-1`, `-2`, etc. before the extension.
fn deduplicate_path(repo_root: &Path, rel_path: &str) -> String {
    let full = repo_root.join(rel_path);
    if !full.exists() {
        return rel_path.to_string();
    }

    let stem = rel_path.strip_suffix(".md").unwrap_or(rel_path);
    let mut counter = 1u32;
    loop {
        let candidate = format!("{}-{}.md", stem, counter);
        if !repo_root.join(&candidate).exists() {
            return candidate;
        }
        counter += 1;
        if counter > 1000 {
            // Safety valve
            return format!("{}-{}.md", stem, generate_id());
        }
    }
}

/// Derive folder from a relative file path (e.g. "recipes/hello.md" -> "/recipes").
fn derive_folder_from_path(file_path: &str) -> String {
    let normalized = file_path.replace('\\', "/");
    let parts: Vec<&str> = normalized.split('/').collect();
    if parts.len() <= 1 {
        "/".to_string()
    } else {
        let parent = parts[..parts.len() - 1].join("/");
        format!("/{}", parent)
    }
}
```

**Step 2: Add import commands to `commands.rs`**

Add after `export_folder_zip`:

```rust
#[tauri::command]
pub fn import_files(
    state: tauri::State<'_, AppState>,
    paths: Vec<String>,
    destination: String,
) -> Result<Vec<PromptFile>, AppError> {
    let mut imported: Vec<PromptFile> = Vec::new();

    for external_path_str in &paths {
        let external_path = std::path::PathBuf::from(external_path_str);
        if !external_path.exists() {
            return Err(AppError::Custom(format!(
                "File not found: {}",
                external_path_str
            )));
        }

        let file = {
            let repo = state
                .repo
                .lock()
                .map_err(|_| AppError::Custom("Internal lock error".into()))?;
            crate::file_ops::import_external_file(
                &state.repo_root,
                &external_path,
                &destination,
                Some(&*repo),
                &state.config,
            )?
        };

        // Update search index
        let entry = crate::types::PromptEntry {
            path: file.path.clone(),
            frontmatter: file.frontmatter.clone(),
        };
        state
            .search
            .lock()
            .map_err(|_| AppError::Custom("Internal lock error".into()))?
            .add_document(&entry, &file.body);

        imported.push(file);
    }

    Ok(imported)
}

#[tauri::command]
pub fn import_from_text(
    state: tauri::State<'_, AppState>,
    text: String,
    title: String,
    destination: String,
) -> Result<PromptFile, AppError> {
    let file = {
        let repo = state
            .repo
            .lock()
            .map_err(|_| AppError::Custom("Internal lock error".into()))?;
        crate::file_ops::import_from_text(
            &state.repo_root,
            &text,
            &title,
            &destination,
            Some(&*repo),
            &state.config,
        )?
    };

    let entry = crate::types::PromptEntry {
        path: file.path.clone(),
        frontmatter: file.frontmatter.clone(),
    };
    state
        .search
        .lock()
        .map_err(|_| AppError::Custom("Internal lock error".into()))?
        .add_document(&entry, &file.body);

    Ok(file)
}
```

**Step 3: Register in `main.rs`**

Add both to the `generate_handler!` macro:

```rust
commands::import_files,
commands::import_from_text,
```

**Tests:** Add a test in `file_ops.rs` inside the existing `#[cfg(test)]` module (or create one):

```rust
#[test]
fn test_deduplicate_path() {
    let tmp = TempDir::new().unwrap();
    // First call — no file exists
    assert_eq!(deduplicate_path(tmp.path(), "hello.md"), "hello.md");

    // Create the file, then dedup should return hello-1.md
    fs::write(tmp.path().join("hello.md"), "test").unwrap();
    assert_eq!(deduplicate_path(tmp.path(), "hello.md"), "hello-1.md");

    // Create that too
    fs::write(tmp.path().join("hello-1.md"), "test").unwrap();
    assert_eq!(deduplicate_path(tmp.path(), "hello.md"), "hello-2.md");
}

#[test]
fn test_import_from_text_creates_file() {
    let tmp = TempDir::new().unwrap();
    crate::config::ensure_repo_structure(tmp.path()).unwrap();
    let config = RepoConfig::default();

    let file = import_from_text(
        tmp.path(),
        "Hello world prompt body",
        "My Test Prompt",
        "",
        None,
        &config,
    )
    .unwrap();

    assert_eq!(file.frontmatter.title, "My Test Prompt");
    assert_eq!(file.body, "Hello world prompt body");
    assert!(file.path.ends_with(".md"));
    assert!(tmp.path().join(&file.path).exists());
}

#[test]
fn test_derive_folder_from_path() {
    assert_eq!(derive_folder_from_path("hello.md"), "/");
    assert_eq!(derive_folder_from_path("recipes/hello.md"), "/recipes");
    assert_eq!(
        derive_folder_from_path("a/b/hello.md"),
        "/a/b"
    );
}
```

**Commit message:** `Add import_files and import_from_text backend commands`

---

## Task 4: Frontend — IPC bindings

**Files:**
- Modify: `src/lib/ipc.ts` (add 4 new methods)

**Step 1: Add export/import methods to `ipc.ts`**

Add after the `commitFile` entry (line 107, before the closing `};`):

```typescript
  // Export/Import
  exportFileClipboard: (path: string, format: "raw" | "body" | "resolved", variables?: Record<string, string>) =>
    call<string>("export_file_clipboard", { path, format, variables }),
  exportFolderZip: (folderPath: string, outputPath: string) =>
    call<string>("export_folder_zip", { folder_path: folderPath, output_path: outputPath }),
  importFiles: (paths: string[], destination: string) =>
    call<PromptFile[]>("import_files", { paths, destination }),
  importFromText: (text: string, title: string, destination: string) =>
    call<PromptFile>("import_from_text", { text, title, destination }),
```

No new types needed — `PromptFile` is already imported.

**Tests:** Run `npm run check` (svelte-check / tsc) from the project root to confirm TypeScript compiles.

**Commit message:** `Add export/import IPC bindings`

---

## Task 5: Frontend — Export UI

**Files:**
- Modify: `src/lib/components/FileContextMenu.svelte` (add Copy submenu)
- Modify: `src/lib/components/FolderContextMenu.svelte` (add Export as Zip)
- Modify: `src/lib/components/Sidebar.svelte` (wire new context menu callbacks)

**Step 1: Add copy actions to `FileContextMenu.svelte`**

Replace the entire `FileContextMenu.svelte` with expanded props and menu items:

```svelte
<script lang="ts">
  interface Props {
    x: number;
    y: number;
    bulkCount: number;
    onRename: () => void;
    onDuplicate: () => void;
    onDelete: () => void;
    onMoveTo: () => void;
    onAddTag: () => void;
    onCopyRaw: () => void;
    onCopyBody: () => void;
    onCopyResolved: () => void;
    onClose: () => void;
  }

  let {
    x, y, bulkCount,
    onRename, onDuplicate, onDelete, onMoveTo, onAddTag,
    onCopyRaw, onCopyBody, onCopyResolved,
    onClose,
  }: Props = $props();

  function handleAction(fn: () => void) {
    fn();
    onClose();
  }
</script>

<svelte:window onclick={onClose} />

<div class="context-menu" style="left: {x}px; top: {y}px" onclick={(e) => e.stopPropagation()}>
  {#if bulkCount <= 1}
    <button class="menu-item" onclick={() => handleAction(onCopyRaw)}>Copy Raw</button>
    <button class="menu-item" onclick={() => handleAction(onCopyBody)}>Copy Body</button>
    <button class="menu-item" onclick={() => handleAction(onCopyResolved)}>Copy Resolved</button>
    <div class="separator"></div>
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

Keep all existing `<style>` unchanged.

**Step 2: Add export zip action to `FolderContextMenu.svelte`**

Add a new prop and menu item. Updated props interface:

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
    onExportZip: () => void;
    onClose: () => void;
  }

  let { x, y, isEmpty, onNewPromptHere, onNewFolderInside, onRename, onDelete, onExportZip, onClose }: Props = $props();

  function handleAction(fn: () => void) {
    fn();
    onClose();
  }
</script>
```

Add the export button in the template, after "New Folder Inside" and before the separator:

```svelte
  <button class="menu-item" onclick={() => handleAction(onNewPromptHere)}>New Prompt Here</button>
  <button class="menu-item" onclick={() => handleAction(onNewFolderInside)}>New Folder Inside</button>
  <div class="separator"></div>
  <button class="menu-item" onclick={() => handleAction(onExportZip)}>Export as Zip</button>
  <div class="separator"></div>
  <button class="menu-item" onclick={() => handleAction(onRename)}>Rename</button>
```

**Step 3: Wire handlers in `Sidebar.svelte`**

Add copy/export handler functions (import the clipboard API):

```typescript
async function handleCopyToClipboard(path: string, format: "raw" | "body" | "resolved") {
  try {
    const text = await api.exportFileClipboard(path, format);
    await navigator.clipboard.writeText(text);
    addToast(`Copied ${format} to clipboard`, "success", 2000);
  } catch (err) {
    console.error("Copy failed:", err);
    addToast("Failed to copy to clipboard", "error");
  }
}

async function handleExportFolderZip(folderPath: string) {
  try {
    const { save } = await import("@tauri-apps/plugin-dialog");
    const outputPath = await save({
      defaultPath: `${folderPath.split("/").pop() || "prompts"}.zip`,
      filters: [{ name: "ZIP Archive", extensions: ["zip"] }],
    });
    if (!outputPath) return; // user cancelled

    await api.exportFolderZip(folderPath, outputPath);
    addToast("Folder exported as zip", "success");
  } catch (err) {
    console.error("Export failed:", err);
    addToast("Failed to export folder", "error");
  }
}
```

Pass the new callbacks to `FileContextMenu`:

```svelte
<FileContextMenu
  ...existing props...
  onCopyRaw={() => handleCopyToClipboard(contextMenu!.path, "raw")}
  onCopyBody={() => handleCopyToClipboard(contextMenu!.path, "body")}
  onCopyResolved={() => handleCopyToClipboard(contextMenu!.path, "resolved")}
/>
```

Pass the new callback to `FolderContextMenu`:

```svelte
<FolderContextMenu
  ...existing props...
  onExportZip={() => handleExportFolderZip(folderContextMenu!.path)}
/>
```

**Step 4: Add dialog plugin**

The Tauri `save` dialog requires the `dialog` plugin. Install:

```bash
cd src-tauri && cargo add tauri-plugin-dialog
```

Register in `main.rs` builder (before `.invoke_handler`):

```rust
.plugin(tauri_plugin_dialog::init())
```

And add the npm package for the frontend API:

```bash
npm install @tauri-apps/plugin-dialog
```

Also add `"dialog:default"` to `src-tauri/capabilities/default.json` permissions array if not already present.

**Tests:** Manual testing — right-click a file, verify Copy Raw/Body/Resolved appear. Right-click a folder, verify Export as Zip appears and opens a save dialog.

**Commit message:** `Add export UI: clipboard copy in file menu, zip export in folder menu`

---

## Task 6: Frontend — Import UI

**Files:**
- Modify: `src/lib/components/Sidebar.svelte` (add Import button, import handler, paste-to-import)
- Modify: `src/lib/stores/files.ts` (may need to export `currentFolder` or equivalent)

**Step 1: Add import handler function to `Sidebar.svelte`**

Add alongside the other handler functions:

```typescript
async function handleImport() {
  try {
    const { open } = await import("@tauri-apps/plugin-dialog");
    const selected = await open({
      multiple: true,
      filters: [{ name: "Markdown", extensions: ["md", "txt"] }],
      title: "Import prompts",
    });
    if (!selected || (Array.isArray(selected) && selected.length === 0)) return;

    const paths = Array.isArray(selected) ? selected : [selected];
    // Determine destination: current folder context or root
    const destination = ""; // root — or derive from currently selected path

    const imported = await api.importFiles(
      paths.map((p) => (typeof p === "string" ? p : p.path)),
      destination,
    );

    await loadFiles();

    if (imported.length > 0) {
      openFile(imported[0].path);
    }

    addToast(
      imported.length === 1
        ? `Imported "${imported[0].frontmatter.title}"`
        : `Imported ${imported.length} prompts`,
      "success",
    );
  } catch (err) {
    console.error("Import failed:", err);
    addToast("Failed to import files", "error");
  }
}
```

**Step 2: Add Import button to the sidebar header**

In the sidebar header area (near the existing New Prompt and New Folder buttons), add an Import button. Find the action buttons section and add:

```svelte
<button class="action-btn" onclick={handleImport} title="Import prompts">
  <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
    <path d="M7 1v8M4 6l3 3 3-3" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
    <path d="M1 10v2h12v-2" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
  </svg>
</button>
```

This renders a download/import arrow icon.

**Step 3: Add paste-to-import**

Add a paste event listener in `Sidebar.svelte` for importing from clipboard. Inside the `<script>` block:

```typescript
async function handlePaste(e: ClipboardEvent) {
  // Only handle paste when no file is active (empty state) or sidebar is focused
  const text = e.clipboardData?.getData("text/plain");
  if (!text || text.trim().length === 0) return;

  // Only intercept if the paste target is in the sidebar (not the editor)
  const target = e.target as HTMLElement;
  if (target.closest(".editor-container, .cm-editor, textarea, input")) return;

  e.preventDefault();

  // Prompt for a title
  dialogMode = "import-paste";
  dialogTitle = "Import from Clipboard";
  dialogDefault = "Imported Prompt";
  deleteTargetPath = text; // temporarily store the pasted text
  dialogVisible = true;
}
```

In the `handleDialogConfirm` function, add a branch for the `"import-paste"` mode:

```typescript
} else if (dialogMode === "import-paste") {
  const pastedText = deleteTargetPath; // we stored the text here
  const file = await api.importFromText(pastedText, name, "");
  await loadFiles();
  openFile(file.path);
  addToast(`Created "${name}" from clipboard`, "success");
}
```

Add the paste listener in the template:

```svelte
<svelte:window onclick={onClose} onpaste={handlePaste} />
```

Or if `<svelte:window>` already exists, add `onpaste={handlePaste}` to it.

**Step 4: Add dialog permissions**

Ensure `src-tauri/capabilities/default.json` includes:

```json
"dialog:default",
"dialog:allow-open",
"dialog:allow-save"
```

**Tests:** Manual testing:
1. Click Import button in sidebar header, verify file dialog opens, pick `.md` files, verify they appear in the file tree
2. Copy text to clipboard, paste in sidebar area (not editor), verify dialog appears asking for title, confirm creates a new prompt
3. Verify toast notifications appear for all operations

**Commit message:** `Add import UI: file dialog import, paste-to-import, sidebar button`
