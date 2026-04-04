use std::collections::HashMap;
use std::io::Write as _;
use std::path::PathBuf;

use tauri::Manager;

use crate::error::AppError;
use crate::search::PromptSearch;
use crate::state::AppState;
use crate::types::{
    CommitEntry, DiffResult, LintResult, PromptEntry, PromptFile, RepoConfig, RepoStatus,
    ResolvedPrompt, SearchFilters, SearchResult, VariableDefinition,
};

// ---------------------------------------------------------------------------
// Setup
// ---------------------------------------------------------------------------

pub fn setup(app: &mut tauri::App) -> Result<(), Box<dyn std::error::Error>> {
    let repo_root = std::env::args()
        .nth(1)
        .or_else(|| std::env::var("PROMPTCASE_REPO").ok())
        .map(PathBuf::from)
        .unwrap_or_else(|| {
            dirs::home_dir()
                .unwrap_or_else(|| PathBuf::from("."))
                .join("prompts")
        });

    std::fs::create_dir_all(&repo_root)?;

    crate::config::ensure_repo_structure(&repo_root)?;
    let config = crate::config::load_config(&repo_root)?;
    let repo = crate::git_ops::init_repo(&repo_root)?;

    // Build initial search index
    let mut search = PromptSearch::new();
    if let Ok(entries) = crate::file_ops::list_all(&repo_root) {
        for entry in &entries {
            if let Ok(content) = crate::file_ops::read_raw(&repo_root, &entry.path) {
                search.add_document(entry, &content);
            }
        }
    }

    app.manage(AppState {
        repo_root,
        config,
        search: std::sync::Mutex::new(search),
        repo: std::sync::Mutex::new(repo),
    });

    Ok(())
}

// ---------------------------------------------------------------------------
// Commands
// ---------------------------------------------------------------------------

#[tauri::command]
pub fn list_files(state: tauri::State<'_, AppState>) -> Result<Vec<PromptEntry>, AppError> {
    crate::file_ops::list_all(&state.repo_root)
}

#[tauri::command]
pub fn read_file(state: tauri::State<'_, AppState>, path: String) -> Result<PromptFile, AppError> {
    crate::file_ops::read_file(&state.repo_root, &path)
}

#[tauri::command]
pub fn write_file(
    state: tauri::State<'_, AppState>,
    path: String,
    frontmatter: Option<serde_json::Value>,
    body: Option<String>,
) -> Result<serde_json::Value, AppError> {
    let existing = crate::file_ops::read_file(&state.repo_root, &path)?;
    let mut fm = existing.frontmatter.clone();

    if let Some(fm_update) = frontmatter {
        let mut fm_value = serde_json::to_value(&fm)
            .map_err(|e| AppError::Custom(format!("Failed to serialize frontmatter: {e}")))?;
        if let (Some(base), Some(update)) = (fm_value.as_object_mut(), fm_update.as_object()) {
            for (k, v) in update {
                base.insert(k.clone(), v.clone());
            }
        }
        fm = serde_json::from_value(fm_value)
            .map_err(|e| AppError::Custom(format!("Failed to deserialize frontmatter: {e}")))?;
    }

    let body = body.unwrap_or(existing.body);

    crate::file_ops::write_file(&state.repo_root, &path, &fm, &body)?;

    let entry = PromptEntry {
        path,
        frontmatter: fm,
    };
    state.search.lock().map_err(|_| AppError::Custom("Internal lock error".into()))?.add_document(&entry, &body);

    Ok(serde_json::json!({ "ok": true }))
}

#[tauri::command]
pub fn create_file(
    state: tauri::State<'_, AppState>,
    path: String,
    title: String,
    prompt_type: Option<String>,
    template: Option<String>,
) -> Result<PromptFile, AppError> {
    let pt = prompt_type.as_deref().unwrap_or("prompt");
    let tpl = template.as_deref();
    let file = {
        let repo = state.repo.lock().map_err(|_| AppError::Custom("Internal lock error".into()))?;
        crate::file_ops::create_file(
            &state.repo_root,
            &path,
            &title,
            pt,
            tpl,
            Some(&*repo),
            &state.config,
        )?
    };

    let entry = PromptEntry {
        path: file.path.clone(),
        frontmatter: file.frontmatter.clone(),
    };
    state.search.lock().map_err(|_| AppError::Custom("Internal lock error".into()))?.add_document(&entry, &file.body);

    Ok(file)
}

#[tauri::command]
pub fn delete_file(
    state: tauri::State<'_, AppState>,
    path: String,
) -> Result<serde_json::Value, AppError> {
    {
        let repo = state.repo.lock().map_err(|_| AppError::Custom("Internal lock error".into()))?;
        crate::file_ops::delete_file(&state.repo_root, &path, Some(&*repo), &state.config)?;
    }
    state.search.lock().map_err(|_| AppError::Custom("Internal lock error".into()))?.remove_document(&path);
    Ok(serde_json::json!({ "ok": true }))
}

#[tauri::command]
pub fn move_file(
    state: tauri::State<'_, AppState>,
    from: String,
    to: String,
) -> Result<serde_json::Value, AppError> {
    {
        let repo = state.repo.lock().map_err(|_| AppError::Custom("Internal lock error".into()))?;
        crate::file_ops::move_file(&state.repo_root, &from, &to, Some(&*repo), &state.config)?;
    }
    // repo lock released here

    let mut search = state.search.lock().map_err(|_| AppError::Custom("Internal lock error".into()))?;
    search.remove_document(&from);
    if let Ok(file) = crate::file_ops::read_file(&state.repo_root, &to) {
        let entry = PromptEntry {
            path: file.path,
            frontmatter: file.frontmatter,
        };
        search.add_document(&entry, &file.body);
    }

    Ok(serde_json::json!({ "ok": true }))
}

#[tauri::command]
pub fn git_log(
    state: tauri::State<'_, AppState>,
    path: Option<String>,
    limit: Option<usize>,
) -> Result<Vec<CommitEntry>, AppError> {
    let repo = state.repo.lock().map_err(|_| AppError::Custom("Internal lock error".into()))?;
    crate::git_ops::git_log(&*repo, path.as_deref(), limit.unwrap_or(50))
}

#[tauri::command]
pub fn git_diff(
    state: tauri::State<'_, AppState>,
    path: String,
    commit_a: String,
    commit_b: String,
) -> Result<DiffResult, AppError> {
    let repo = state.repo.lock().map_err(|_| AppError::Custom("Internal lock error".into()))?;
    crate::git_ops::git_diff(&*repo, &path, &commit_a, &commit_b)
}

#[tauri::command]
pub fn git_restore(
    state: tauri::State<'_, AppState>,
    path: String,
    commit: String,
) -> Result<Option<String>, AppError> {
    let repo = state.repo.lock().map_err(|_| AppError::Custom("Internal lock error".into()))?;
    crate::git_ops::git_restore(&*repo, &state.repo_root, &path, &commit, &state.config.commit_prefix)
}

#[tauri::command]
pub fn git_status(state: tauri::State<'_, AppState>) -> Result<RepoStatus, AppError> {
    let repo = state.repo.lock().map_err(|_| AppError::Custom("Internal lock error".into()))?;
    crate::git_ops::repo_status(&*repo, &state.repo_root)
}

#[tauri::command]
pub fn resolve_template(
    state: tauri::State<'_, AppState>,
    path: String,
    variables: Option<HashMap<String, String>>,
) -> Result<ResolvedPrompt, AppError> {
    let content = crate::file_ops::read_raw(&state.repo_root, &path)?;
    crate::template::resolve_template(&path, &content, &state.repo_root, variables.as_ref())
}

#[tauri::command]
pub fn lint_file(
    state: tauri::State<'_, AppState>,
    path: String,
) -> Result<Vec<LintResult>, AppError> {
    let content = crate::file_ops::read_raw(&state.repo_root, &path)?;
    crate::linter::lint_prompt(&path, &content, &state.repo_root, &state.config)
}

#[tauri::command]
pub fn lint_all(
    state: tauri::State<'_, AppState>,
) -> Result<HashMap<String, Vec<LintResult>>, AppError> {
    let entries = crate::file_ops::list_all(&state.repo_root)?;
    let files: Vec<(String, String)> = entries
        .iter()
        .filter_map(|e| {
            crate::file_ops::read_raw(&state.repo_root, &e.path)
                .ok()
                .map(|content| (e.path.clone(), content))
        })
        .collect();
    crate::linter::lint_all(&files, &state.repo_root, &state.config)
}

#[tauri::command]
pub fn get_variables(
    state: tauri::State<'_, AppState>,
    path: String,
) -> Result<Vec<VariableDefinition>, AppError> {
    let file = crate::file_ops::read_file(&state.repo_root, &path)?;
    Ok(file.frontmatter.variables)
}

#[tauri::command]
pub fn count_tokens(text: String, model: String) -> Result<usize, AppError> {
    Ok(crate::tokenizer::count_tokens(&text, &model))
}

#[tauri::command]
pub fn count_tokens_resolved(
    state: tauri::State<'_, AppState>,
    path: String,
    model: String,
    variables: Option<HashMap<String, String>>,
) -> Result<usize, AppError> {
    let content = crate::file_ops::read_raw(&state.repo_root, &path)?;
    let resolved =
        crate::template::resolve_template(&path, &content, &state.repo_root, variables.as_ref())?;
    Ok(crate::tokenizer::count_tokens(&resolved.text, &model))
}

#[tauri::command]
pub fn search_query(
    state: tauri::State<'_, AppState>,
    q: String,
    filters: Option<SearchFilters>,
) -> Result<Vec<SearchResult>, AppError> {
    let search = state.search.lock().map_err(|_| AppError::Custom("Internal lock error".into()))?;
    Ok(search.search(&q, filters.as_ref()))
}

#[tauri::command]
pub fn search_reindex(
    state: tauri::State<'_, AppState>,
) -> Result<serde_json::Value, AppError> {
    let entries = crate::file_ops::list_all(&state.repo_root)?;
    let mut search = state.search.lock().map_err(|_| AppError::Custom("Internal lock error".into()))?;
    search.clear();
    for entry in &entries {
        if let Ok(content) = crate::file_ops::read_raw(&state.repo_root, &entry.path) {
            search.add_document(entry, &content);
        }
    }
    Ok(serde_json::json!({ "ok": true }))
}

#[tauri::command]
pub fn get_config(state: tauri::State<'_, AppState>) -> Result<RepoConfig, AppError> {
    Ok(state.config.clone())
}

#[tauri::command]
pub fn update_config(
    state: tauri::State<'_, AppState>,
    updates: serde_json::Value,
) -> Result<RepoConfig, AppError> {
    let config = crate::config::load_config(&state.repo_root)?;
    let mut config_value = serde_json::to_value(&config)
        .map_err(|e| AppError::Custom(format!("Failed to serialize config: {e}")))?;
    if let (Some(base), Some(updates)) = (config_value.as_object_mut(), updates.as_object()) {
        for (k, v) in updates {
            base.insert(k.clone(), v.clone());
        }
    }
    let config: RepoConfig = serde_json::from_value(config_value)
        .map_err(|e| AppError::Custom(format!("Failed to deserialize config: {e}")))?;
    crate::config::save_config(&state.repo_root, &config)?;
    Ok(config)
}

#[tauri::command]
pub fn generate_commit_message(
    state: tauri::State<'_, AppState>,
    path: String,
) -> Result<String, AppError> {
    let repo = state
        .repo
        .lock()
        .map_err(|_| AppError::Custom("Internal lock error".into()))?;
    crate::git_ops::generate_commit_message(&*repo, &state.repo_root, &path)
}

#[tauri::command]
pub fn commit_file(
    state: tauri::State<'_, AppState>,
    path: String,
    message: String,
) -> Result<serde_json::Value, AppError> {
    let repo = state
        .repo
        .lock()
        .map_err(|_| AppError::Custom("Internal lock error".into()))?;
    let full_message = format!("{} {}", state.config.commit_prefix, message);
    crate::git_ops::commit_with_message(&*repo, &[path.as_str()], &full_message)?;
    Ok(serde_json::json!({ "ok": true }))
}

// ---------------------------------------------------------------------------
// Export commands
// ---------------------------------------------------------------------------

/// Return file content in the requested format: "raw", "body", or "resolved".
#[tauri::command]
pub fn export_file_clipboard(
    state: tauri::State<'_, AppState>,
    path: String,
    format: String,
) -> Result<String, AppError> {
    match format.as_str() {
        "raw" => crate::file_ops::read_raw(&state.repo_root, &path),
        "body" => {
            let file = crate::file_ops::read_file(&state.repo_root, &path)?;
            Ok(file.body)
        }
        "resolved" => {
            let content = crate::file_ops::read_raw(&state.repo_root, &path)?;
            let resolved =
                crate::template::resolve_template(&path, &content, &state.repo_root, None)?;
            Ok(resolved.text)
        }
        other => Err(AppError::Custom(format!("Unknown export format: {other}"))),
    }
}

/// Walk a folder and create a zip archive of all .md files.
/// If `output_path` is provided, writes the zip to that absolute path on disk.
/// Otherwise returns the raw bytes.
#[tauri::command]
pub fn export_folder_zip(
    state: tauri::State<'_, AppState>,
    folder: String,
    output_path: Option<String>,
) -> Result<Vec<u8>, AppError> {
    use walkdir::WalkDir;
    use zip::write::SimpleFileOptions;
    use zip::ZipWriter;

    let base = crate::file_ops::safe_path(&state.repo_root, &folder)?;
    if !base.is_dir() {
        return Err(AppError::Custom(format!("Not a directory: {folder}")));
    }

    let mut buf = Vec::new();
    {
        let mut zw = ZipWriter::new(std::io::Cursor::new(&mut buf));
        let options = SimpleFileOptions::default()
            .compression_method(zip::CompressionMethod::Deflated);

        let walker = WalkDir::new(&base).into_iter().filter_entry(|e| {
            if e.depth() == 0 {
                return true;
            }
            let name = e.file_name().to_string_lossy();
            !name.starts_with('.') && name != "node_modules" && name != "_templates"
        });

        for entry in walker {
            let entry = entry.map_err(|e| AppError::Custom(format!("walkdir: {e}")))?;
            if !entry.file_type().is_file() {
                continue;
            }
            let path = entry.path();
            if path.extension().and_then(|e| e.to_str()) != Some("md") {
                continue;
            }
            let rel = path
                .strip_prefix(&base)
                .unwrap_or(path)
                .to_string_lossy()
                .replace('\\', "/");
            let content = std::fs::read_to_string(path)?;
            zw.start_file(&rel, options)
                .map_err(|e| AppError::Custom(format!("zip start_file: {e}")))?;
            zw.write_all(content.as_bytes())?;
        }

        zw.finish().map_err(|e| AppError::Custom(format!("zip finish: {e}")))?;
    }

    if let Some(out) = output_path {
        std::fs::write(&out, &buf)?;
        Ok(vec![])
    } else {
        Ok(buf)
    }
}

// ---------------------------------------------------------------------------
// Import commands
// ---------------------------------------------------------------------------

/// Import .md files from absolute paths on disk. Each file gets a new ID and
/// is written to `destination` (a repo-relative folder path, e.g. "prompts").
/// Returns the list of created entries.
#[tauri::command]
pub fn import_files(
    state: tauri::State<'_, AppState>,
    paths: Vec<String>,
    destination: String,
) -> Result<Vec<PromptEntry>, AppError> {
    let mut created = Vec::new();

    for src in &paths {
        let src_path = std::path::Path::new(src);
        if !src_path.is_file() {
            return Err(AppError::Custom(format!("Not a file: {src}")));
        }
        let content = std::fs::read_to_string(src_path)?;
        let filename = src_path
            .file_name()
            .unwrap_or_default()
            .to_string_lossy();

        let dest_rel = if destination.is_empty() || destination == "/" {
            filename.to_string()
        } else {
            format!("{}/{}", destination.trim_matches('/'), filename)
        };

        // Parse, assign new ID, and re-serialize
        let parsed = crate::frontmatter::parse_prompt_file(&dest_rel, &content);
        let mut fm = parsed.frontmatter.clone();
        fm.id = crate::frontmatter::generate_id();

        let body = &parsed.body;
        crate::file_ops::write_file(&state.repo_root, &dest_rel, &fm, body)?;

        created.push(PromptEntry {
            path: dest_rel.clone(),
            frontmatter: fm,
        });
    }

    // Update search index
    {
        let mut search = state
            .search
            .lock()
            .map_err(|_| AppError::Custom("Internal lock error".into()))?;
        for entry in &created {
            if let Ok(content) = crate::file_ops::read_raw(&state.repo_root, &entry.path) {
                search.add_document(entry, &content);
            }
        }
    }

    Ok(created)
}

/// Create a new prompt from plain text. Returns the created entry.
#[tauri::command]
pub fn import_from_text(
    state: tauri::State<'_, AppState>,
    title: String,
    text: String,
    destination: String,
) -> Result<PromptFile, AppError> {
    let slug = title
        .to_lowercase()
        .replace(|c: char| !c.is_alphanumeric() && c != '-', "-")
        .trim_matches('-')
        .to_string();
    let filename = format!("{slug}.md");
    let dest_rel = if destination.is_empty() || destination == "/" {
        filename
    } else {
        format!("{}/{}", destination.trim_matches('/'), filename)
    };

    let config = &state.config;
    let repo = state
        .repo
        .lock()
        .map_err(|_| AppError::Custom("Internal lock error".into()))?;

    let file = crate::file_ops::create_file(
        &state.repo_root,
        &dest_rel,
        &title,
        "prompt",
        None,
        Some(&*repo),
        config,
    )?;

    // Now overwrite the body with the provided text
    crate::file_ops::write_file(&state.repo_root, &dest_rel, &file.frontmatter, &text)?;

    // Update search index
    {
        let mut search = state
            .search
            .lock()
            .map_err(|_| AppError::Custom("Internal lock error".into()))?;
        let entry = PromptEntry {
            path: dest_rel.clone(),
            frontmatter: file.frontmatter.clone(),
        };
        let content = crate::file_ops::read_raw(&state.repo_root, &dest_rel)?;
        search.add_document(&entry, &content);
    }

    let final_file = crate::file_ops::read_file(&state.repo_root, &dest_rel)?;
    Ok(final_file)
}
