use std::collections::HashMap;
use std::io::Write as _;
use std::path::PathBuf;

use tauri::Manager;

use promptcase_core::error::AppError;
use promptcase_core::search::PromptSearch;
use crate::state::AppState;
use promptcase_core::types::{
    CommitEntry, DiffResult, LintResult, PromptEntry, PromptFile, RepoConfig, RepoStatus,
    ResolvedPrompt, SearchFilters, SearchResult, TagInfo, VariableDefinition,
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

    promptcase_core::config::ensure_repo_structure(&repo_root)?;
    let config = promptcase_core::config::load_config(&repo_root)?;
    let repo = promptcase_core::git_ops::init_repo(&repo_root)?;

    // Build initial search index
    let mut search = PromptSearch::new();
    if let Ok(entries) = promptcase_core::file_ops::list_all(&repo_root) {
        for entry in &entries {
            if let Ok(content) = promptcase_core::file_ops::read_raw(&repo_root, &entry.path) {
                search.add_document(entry, &content);
            }
        }
    }

    app.manage(AppState {
        repo_root: repo_root.clone(),
        config,
        search: std::sync::Mutex::new(search),
        repo: std::sync::Mutex::new(repo),
        prompt_cancelled: std::sync::Arc::new(std::sync::atomic::AtomicBool::new(false)),
        watcher: std::sync::Mutex::new(crate::watcher::WatcherState::new()),
    });

    // Start file watcher
    let state: tauri::State<'_, AppState> = app.state();
    let mut w = state.watcher.lock().unwrap();
    if let Err(e) = w.start(app.handle().clone(), repo_root) {
        eprintln!("Warning: file watcher failed to start: {e}");
    }

    Ok(())
}

// ---------------------------------------------------------------------------
// Commands
// ---------------------------------------------------------------------------

#[tauri::command]
pub fn list_files(state: tauri::State<'_, AppState>) -> Result<Vec<PromptEntry>, AppError> {
    promptcase_core::file_ops::list_all(&state.repo_root)
}

#[tauri::command]
pub fn list_folders(state: tauri::State<'_, AppState>) -> Result<Vec<String>, AppError> {
    promptcase_core::file_ops::list_folders(&state.repo_root)
}

#[tauri::command]
pub fn list_tags(state: tauri::State<'_, AppState>) -> Result<Vec<TagInfo>, AppError> {
    promptcase_core::file_ops::list_tags(&state.repo_root)
}

#[tauri::command]
pub fn rename_tag(
    state: tauri::State<'_, AppState>,
    old_name: String,
    new_name: String,
) -> Result<usize, AppError> {
    let repo = state.repo.lock().unwrap();
    promptcase_core::file_ops::rename_tag(&state.repo_root, &old_name, &new_name, Some(&repo), &state.config)
}

#[tauri::command]
pub fn delete_tag(
    state: tauri::State<'_, AppState>,
    tag_name: String,
) -> Result<usize, AppError> {
    let repo = state.repo.lock().unwrap();
    promptcase_core::file_ops::delete_tag(&state.repo_root, &tag_name, Some(&repo), &state.config)
}

#[tauri::command]
pub fn merge_tags(
    state: tauri::State<'_, AppState>,
    source_tags: Vec<String>,
    target_tag: String,
) -> Result<usize, AppError> {
    let repo = state.repo.lock().unwrap();
    promptcase_core::file_ops::merge_tags(&state.repo_root, &source_tags, &target_tag, Some(&repo), &state.config)
}

#[tauri::command]
pub fn read_file(state: tauri::State<'_, AppState>, path: String) -> Result<PromptFile, AppError> {
    promptcase_core::file_ops::read_file(&state.repo_root, &path)
}

#[tauri::command]
pub fn write_file(
    state: tauri::State<'_, AppState>,
    path: String,
    frontmatter: Option<serde_json::Value>,
    body: Option<String>,
) -> Result<serde_json::Value, AppError> {
    let existing = promptcase_core::file_ops::read_file(&state.repo_root, &path)?;
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

    promptcase_core::file_ops::write_file(&state.repo_root, &path, &fm, &body)?;

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
        promptcase_core::file_ops::create_file(
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
        promptcase_core::file_ops::delete_file(&state.repo_root, &path, Some(&*repo), &state.config)?;
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
        promptcase_core::file_ops::move_file(&state.repo_root, &from, &to, Some(&*repo), &state.config)?;
    }
    // repo lock released here

    let mut search = state.search.lock().map_err(|_| AppError::Custom("Internal lock error".into()))?;
    search.remove_document(&from);
    if let Ok(file) = promptcase_core::file_ops::read_file(&state.repo_root, &to) {
        let entry = PromptEntry {
            path: file.path,
            frontmatter: file.frontmatter,
        };
        search.add_document(&entry, &file.body);
    }

    Ok(serde_json::json!({ "ok": true }))
}

#[tauri::command]
pub fn create_folder(
    state: tauri::State<'_, AppState>,
    path: String,
) -> Result<serde_json::Value, AppError> {
    let repo = state.repo.lock().map_err(|_| AppError::Custom("Internal lock error".into()))?;
    promptcase_core::file_ops::create_folder(&state.repo_root, &path, Some(&*repo), &state.config)?;
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
        promptcase_core::file_ops::rename_folder(&state.repo_root, &from, &to, Some(&*repo), &state.config)?
    };

    // Update search index for all moved files
    let mut search = state.search.lock().map_err(|_| AppError::Custom("Internal lock error".into()))?;
    for (old, new) in &moved {
        search.remove_document(old);
        if let Ok(file) = promptcase_core::file_ops::read_file(&state.repo_root, new) {
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
    promptcase_core::file_ops::delete_folder(&state.repo_root, &path, Some(&*repo), &state.config)?;
    Ok(serde_json::json!({ "ok": true }))
}

#[tauri::command]
pub fn duplicate_file(
    state: tauri::State<'_, AppState>,
    path: String,
) -> Result<PromptFile, AppError> {
    let file = {
        let repo = state.repo.lock().map_err(|_| AppError::Custom("Internal lock error".into()))?;
        promptcase_core::file_ops::duplicate_file(&state.repo_root, &path, Some(&*repo), &state.config)?
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
        promptcase_core::file_ops::move_files(&state.repo_root, &paths, &destination, Some(&*repo), &state.config)?
    };

    let mut search = state.search.lock().map_err(|_| AppError::Custom("Internal lock error".into()))?;
    for (old, new) in &moved {
        search.remove_document(old);
        if let Ok(file) = promptcase_core::file_ops::read_file(&state.repo_root, new) {
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
pub fn git_log(
    state: tauri::State<'_, AppState>,
    path: Option<String>,
    limit: Option<usize>,
) -> Result<Vec<CommitEntry>, AppError> {
    let repo = state.repo.lock().map_err(|_| AppError::Custom("Internal lock error".into()))?;
    promptcase_core::git_ops::git_log(&*repo, path.as_deref(), limit.unwrap_or(50))
}

#[tauri::command]
pub fn git_diff(
    state: tauri::State<'_, AppState>,
    path: String,
    commit_a: String,
    commit_b: String,
) -> Result<DiffResult, AppError> {
    let repo = state.repo.lock().map_err(|_| AppError::Custom("Internal lock error".into()))?;
    promptcase_core::git_ops::git_diff(&*repo, &path, &commit_a, &commit_b)
}

#[tauri::command]
pub fn git_show_file(
    state: tauri::State<'_, AppState>,
    path: String,
    commit: String,
) -> Result<String, AppError> {
    let repo = state.repo.lock().map_err(|_| AppError::Custom("Internal lock error".into()))?;
    promptcase_core::git_ops::show_file_at_commit(&*repo, &path, &commit)
}

#[tauri::command]
pub fn git_restore(
    state: tauri::State<'_, AppState>,
    path: String,
    commit: String,
) -> Result<Option<String>, AppError> {
    let repo = state.repo.lock().map_err(|_| AppError::Custom("Internal lock error".into()))?;
    promptcase_core::git_ops::git_restore(&*repo, &state.repo_root, &path, &commit, &state.config.commit_prefix)
}

#[tauri::command]
pub fn git_status(state: tauri::State<'_, AppState>) -> Result<RepoStatus, AppError> {
    let repo = state.repo.lock().map_err(|_| AppError::Custom("Internal lock error".into()))?;
    promptcase_core::git_ops::repo_status(&*repo, &state.repo_root)
}

#[tauri::command]
pub fn resolve_template(
    state: tauri::State<'_, AppState>,
    path: String,
    variables: Option<HashMap<String, String>>,
) -> Result<ResolvedPrompt, AppError> {
    let content = promptcase_core::file_ops::read_raw(&state.repo_root, &path)?;
    promptcase_core::template::resolve_template(&path, &content, &state.repo_root, variables.as_ref())
}

#[tauri::command]
pub fn lint_file(
    state: tauri::State<'_, AppState>,
    path: String,
) -> Result<Vec<LintResult>, AppError> {
    let content = promptcase_core::file_ops::read_raw(&state.repo_root, &path)?;
    promptcase_core::linter::lint_prompt(&path, &content, &state.repo_root, &state.config)
}

#[tauri::command]
pub fn lint_all(
    state: tauri::State<'_, AppState>,
) -> Result<HashMap<String, Vec<LintResult>>, AppError> {
    let entries = promptcase_core::file_ops::list_all(&state.repo_root)?;
    let files: Vec<(String, String)> = entries
        .iter()
        .filter_map(|e| {
            promptcase_core::file_ops::read_raw(&state.repo_root, &e.path)
                .ok()
                .map(|content| (e.path.clone(), content))
        })
        .collect();
    promptcase_core::linter::lint_all(&files, &state.repo_root, &state.config)
}

#[tauri::command]
pub fn get_variables(
    state: tauri::State<'_, AppState>,
    path: String,
) -> Result<Vec<VariableDefinition>, AppError> {
    let file = promptcase_core::file_ops::read_file(&state.repo_root, &path)?;
    Ok(file.frontmatter.variables)
}

#[tauri::command]
pub fn count_tokens(text: String, model: String) -> Result<usize, AppError> {
    Ok(promptcase_core::tokenizer::count_tokens(&text, &model))
}

#[tauri::command]
pub fn count_tokens_resolved(
    state: tauri::State<'_, AppState>,
    path: String,
    model: String,
    variables: Option<HashMap<String, String>>,
) -> Result<usize, AppError> {
    let content = promptcase_core::file_ops::read_raw(&state.repo_root, &path)?;
    let resolved =
        promptcase_core::template::resolve_template(&path, &content, &state.repo_root, variables.as_ref())?;
    Ok(promptcase_core::tokenizer::count_tokens(&resolved.text, &model))
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
    let entries = promptcase_core::file_ops::list_all(&state.repo_root)?;
    let mut search = state.search.lock().map_err(|_| AppError::Custom("Internal lock error".into()))?;
    search.clear();
    for entry in &entries {
        if let Ok(content) = promptcase_core::file_ops::read_raw(&state.repo_root, &entry.path) {
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
    let config = promptcase_core::config::load_config(&state.repo_root)?;
    let mut config_value = serde_json::to_value(&config)
        .map_err(|e| AppError::Custom(format!("Failed to serialize config: {e}")))?;
    if let (Some(base), Some(updates)) = (config_value.as_object_mut(), updates.as_object()) {
        for (k, v) in updates {
            base.insert(k.clone(), v.clone());
        }
    }
    let config: RepoConfig = serde_json::from_value(config_value)
        .map_err(|e| AppError::Custom(format!("Failed to deserialize config: {e}")))?;
    promptcase_core::config::save_config(&state.repo_root, &config)?;
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
    promptcase_core::git_ops::generate_commit_message(&*repo, &state.repo_root, &path)
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
    promptcase_core::git_ops::commit_with_message(&*repo, &[path.as_str()], &full_message)?;
    Ok(serde_json::json!({ "ok": true }))
}

// ---------------------------------------------------------------------------
// File watcher
// ---------------------------------------------------------------------------

#[tauri::command]
pub fn start_watcher(app_handle: tauri::AppHandle, state: tauri::State<'_, AppState>) -> Result<serde_json::Value, AppError> {
    let mut w = state.watcher.lock().map_err(|_| AppError::Custom("Internal lock error".into()))?;
    w.start(app_handle, state.repo_root.clone()).map_err(|e| AppError::Custom(e))?;
    Ok(serde_json::json!({ "ok": true }))
}

#[tauri::command]
pub fn stop_watcher(state: tauri::State<'_, AppState>) -> Result<serde_json::Value, AppError> {
    let mut w = state.watcher.lock().map_err(|_| AppError::Custom("Internal lock error".into()))?;
    w.stop();
    Ok(serde_json::json!({ "ok": true }))
}

#[tauri::command]
pub fn mark_file_writing(state: tauri::State<'_, AppState>, path: String) -> Result<serde_json::Value, AppError> {
    let full_path = state.repo_root.join(&path);
    let w = state.watcher.lock().map_err(|_| AppError::Custom("Internal lock error".into()))?;
    w.mark_writing(full_path);
    Ok(serde_json::json!({ "ok": true }))
}

#[tauri::command]
pub fn unmark_file_writing(state: tauri::State<'_, AppState>, path: String) -> Result<serde_json::Value, AppError> {
    let full_path = state.repo_root.join(&path);
    let w = state.watcher.lock().map_err(|_| AppError::Custom("Internal lock error".into()))?;
    w.unmark_writing(full_path);
    Ok(serde_json::json!({ "ok": true }))
}

// ---------------------------------------------------------------------------
// Recovery
// ---------------------------------------------------------------------------

#[tauri::command]
pub fn save_recovery(
    state: tauri::State<'_, AppState>,
    path: String,
    content: String,
) -> Result<serde_json::Value, AppError> {
    crate::recovery::save_recovery_buffer(&state.repo_root, &path, &content);
    Ok(serde_json::json!({ "ok": true }))
}

#[tauri::command]
pub fn clear_recovery(
    state: tauri::State<'_, AppState>,
    path: String,
) -> Result<serde_json::Value, AppError> {
    crate::recovery::clear_recovery_buffer(&state.repo_root, &path);
    Ok(serde_json::json!({ "ok": true }))
}

#[tauri::command]
pub fn load_recovery(
    state: tauri::State<'_, AppState>,
) -> Result<Vec<crate::recovery::RecoveryBuffer>, AppError> {
    Ok(crate::recovery::load_recovery(&state.repo_root))
}

#[tauri::command]
pub fn clear_all_recovery(
    state: tauri::State<'_, AppState>,
) -> Result<serde_json::Value, AppError> {
    crate::recovery::clear_all_recovery(&state.repo_root);
    Ok(serde_json::json!({ "ok": true }))
}

// ---------------------------------------------------------------------------
// LLM / API key management
// ---------------------------------------------------------------------------

#[tauri::command]
pub fn get_api_key(provider: String) -> Result<Option<String>, AppError> {
    crate::llm::get_api_key(&provider)
}

#[tauri::command]
pub fn set_api_key(provider: String, key: String) -> Result<serde_json::Value, AppError> {
    crate::llm::set_api_key(&provider, &key)?;
    Ok(serde_json::json!({ "ok": true }))
}

#[tauri::command]
pub fn delete_api_key(provider: String) -> Result<serde_json::Value, AppError> {
    crate::llm::delete_api_key(&provider)?;
    Ok(serde_json::json!({ "ok": true }))
}

#[tauri::command(async)]
pub async fn run_prompt(
    app: tauri::AppHandle,
    state: tauri::State<'_, AppState>,
    request: promptcase_core::types::RunPromptRequest,
) -> Result<serde_json::Value, AppError> {
    // Reset cancellation flag
    state
        .prompt_cancelled
        .store(false, std::sync::atomic::Ordering::Relaxed);

    let cancelled = state.prompt_cancelled.clone();

    tauri::async_runtime::spawn(async move {
        crate::llm::run_prompt_stream(app, request, cancelled).await;
    });

    Ok(serde_json::json!({ "ok": true }))
}

#[tauri::command]
pub fn cancel_prompt(state: tauri::State<'_, AppState>) -> Result<serde_json::Value, AppError> {
    state
        .prompt_cancelled
        .store(true, std::sync::atomic::Ordering::Relaxed);
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
        "raw" => promptcase_core::file_ops::read_raw(&state.repo_root, &path),
        "body" => {
            let file = promptcase_core::file_ops::read_file(&state.repo_root, &path)?;
            Ok(file.body)
        }
        "resolved" => {
            let content = promptcase_core::file_ops::read_raw(&state.repo_root, &path)?;
            let resolved =
                promptcase_core::template::resolve_template(&path, &content, &state.repo_root, None)?;
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

    let base = promptcase_core::file_ops::safe_path(&state.repo_root, &folder)?;
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
        let parsed = promptcase_core::frontmatter::parse_prompt_file(&dest_rel, &content);
        let mut fm = parsed.frontmatter.clone();
        fm.id = promptcase_core::frontmatter::generate_id();

        let body = &parsed.body;
        promptcase_core::file_ops::write_file(&state.repo_root, &dest_rel, &fm, body)?;

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
            if let Ok(content) = promptcase_core::file_ops::read_raw(&state.repo_root, &entry.path) {
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

    let file = promptcase_core::file_ops::create_file(
        &state.repo_root,
        &dest_rel,
        &title,
        "prompt",
        None,
        Some(&*repo),
        config,
    )?;

    // Now overwrite the body with the provided text
    promptcase_core::file_ops::write_file(&state.repo_root, &dest_rel, &file.frontmatter, &text)?;

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
        let content = promptcase_core::file_ops::read_raw(&state.repo_root, &dest_rel)?;
        search.add_document(&entry, &content);
    }

    let final_file = promptcase_core::file_ops::read_file(&state.repo_root, &dest_rel)?;
    Ok(final_file)
}

// ---------------------------------------------------------------------------
// Onboarding
// ---------------------------------------------------------------------------

#[tauri::command]
pub fn install_samples(
    state: tauri::State<'_, AppState>,
) -> Result<String, AppError> {
    use promptcase_core::samples::all_samples;

    let samples = all_samples();
    let mut first_path = String::new();

    for sample in &samples {
        let full = state.repo_root.join(sample.path);
        if let Some(parent) = full.parent() {
            std::fs::create_dir_all(parent)?;
        }
        // Don't overwrite existing files
        if !full.exists() {
            std::fs::write(&full, sample.content)?;
        }
        if first_path.is_empty() && !sample.path.starts_with("_templates/") {
            first_path = sample.path.to_string();
        }
    }

    // Mark onboarding completed
    promptcase_core::config::save_config(
        &state.repo_root,
        &{
            let mut c = promptcase_core::config::load_config(&state.repo_root)?;
            c.onboarding_completed = true;
            c
        },
    )?;

    // Rebuild search index so new files are discoverable
    let entries = promptcase_core::file_ops::list_all(&state.repo_root)?;
    let mut search = state.search.lock().map_err(|_| AppError::Custom("Internal lock error".into()))?;
    search.clear();
    for entry in &entries {
        if let Ok(content) = promptcase_core::file_ops::read_raw(&state.repo_root, &entry.path) {
            search.add_document(entry, &content);
        }
    }

    Ok(first_path)
}
