use std::collections::HashMap;
use std::path::PathBuf;

use tauri::Manager;

use crate::error::AppError;
use crate::search::PromptSearch;
use crate::state::AppState;
use crate::types::{
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
pub fn list_tags(state: tauri::State<'_, AppState>) -> Result<Vec<TagInfo>, AppError> {
    crate::file_ops::list_tags(&state.repo_root)
}

#[tauri::command]
pub fn rename_tag(
    state: tauri::State<'_, AppState>,
    old_name: String,
    new_name: String,
) -> Result<usize, AppError> {
    let repo = state.repo.lock().unwrap();
    crate::file_ops::rename_tag(&state.repo_root, &old_name, &new_name, Some(&repo), &state.config)
}

#[tauri::command]
pub fn delete_tag(
    state: tauri::State<'_, AppState>,
    tag_name: String,
) -> Result<usize, AppError> {
    let repo = state.repo.lock().unwrap();
    crate::file_ops::delete_tag(&state.repo_root, &tag_name, Some(&repo), &state.config)
}

#[tauri::command]
pub fn merge_tags(
    state: tauri::State<'_, AppState>,
    source_tags: Vec<String>,
    target_tag: String,
) -> Result<usize, AppError> {
    let repo = state.repo.lock().unwrap();
    crate::file_ops::merge_tags(&state.repo_root, &source_tags, &target_tag, Some(&repo), &state.config)
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
