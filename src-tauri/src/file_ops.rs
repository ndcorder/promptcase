use std::fs;
use std::path::{Path, PathBuf};

use chrono::Utc;
use git2::Repository;
use walkdir::WalkDir;

use std::collections::HashMap;

use crate::error::AppError;
use crate::frontmatter::{generate_id, parse_prompt_file, serialize_prompt_file};
use crate::git_ops::auto_commit;
use crate::types::{PromptEntry, PromptFile, PromptFrontmatter, RepoConfig, TagInfo};

/// Validate and resolve a file path within the repo root.
/// Rejects any path containing `..` or escaping the repo boundary.
pub fn safe_path(repo_root: &Path, file_path: &str) -> Result<PathBuf, AppError> {
    if Path::new(file_path).is_absolute() {
        return Err(AppError::Custom(format!(
            "Path traversal denied: {file_path}"
        )));
    }
    if file_path.contains("..") {
        return Err(AppError::Custom(format!(
            "Path traversal denied: {file_path}"
        )));
    }
    let full = repo_root.join(file_path);
    // Normalize via canonicalize when possible; for new files fall back to
    // checking that the joined path starts with repo_root.
    let canonical_root = repo_root
        .canonicalize()
        .unwrap_or_else(|_| repo_root.to_path_buf());
    let canonical_full = full
        .canonicalize()
        .unwrap_or_else(|_| canonical_root.join(file_path));
    if !canonical_full.starts_with(&canonical_root) {
        return Err(AppError::Custom(format!(
            "Path traversal denied: {file_path}"
        )));
    }
    Ok(full)
}

/// Walk the repo directory and return a sorted list of all `.md` prompt entries.
/// Skips hidden directories (names starting with `.`) and `node_modules`.
pub fn list_all(repo_root: &Path) -> Result<Vec<PromptEntry>, AppError> {
    let mut entries: Vec<PromptEntry> = Vec::new();

    let walker = WalkDir::new(repo_root).into_iter().filter_entry(|e| {
        // Always allow the root entry (depth 0); skip hidden dirs and node_modules below it.
        if e.depth() == 0 {
            return true;
        }
        let name = e.file_name().to_string_lossy();
        !name.starts_with('.') && name != "node_modules" && name != "_templates"
    });

    for entry in walker {
        let entry = entry.map_err(|e| AppError::Custom(format!("walkdir error: {e}")))?;
        if !entry.file_type().is_file() {
            continue;
        }
        let path = entry.path();
        if path.extension().and_then(|e| e.to_str()) != Some("md") {
            continue;
        }

        let content = match fs::read_to_string(path) {
            Ok(c) => c,
            Err(_) => continue, // skip unreadable files
        };

        let rel_path = path
            .strip_prefix(repo_root)
            .unwrap_or(path)
            .to_string_lossy()
            .replace('\\', "/");

        let parsed = parse_prompt_file(&rel_path, &content);
        entries.push(PromptEntry {
            path: rel_path,
            frontmatter: parsed.frontmatter,
        });
    }

    entries.sort_by(|a, b| a.path.cmp(&b.path));
    Ok(entries)
}

/// Read and parse a single prompt file.
pub fn read_file(repo_root: &Path, file_path: &str) -> Result<PromptFile, AppError> {
    let full = safe_path(repo_root, file_path)?;
    let content = fs::read_to_string(&full)?;
    Ok(parse_prompt_file(file_path, &content))
}

/// Read raw file content as a string.
pub fn read_raw(repo_root: &Path, file_path: &str) -> Result<String, AppError> {
    let full = safe_path(repo_root, file_path)?;
    let content = fs::read_to_string(&full)?;
    Ok(content)
}

/// Write a prompt file (serialized from frontmatter + body) to disk.
/// Does NOT auto-commit; the frontend is responsible for debounced commits
/// via the `commit_file` command.
pub fn write_file(
    repo_root: &Path,
    file_path: &str,
    frontmatter: &PromptFrontmatter,
    body: &str,
) -> Result<(), AppError> {
    let full = safe_path(repo_root, file_path)?;

    if let Some(parent) = full.parent() {
        fs::create_dir_all(parent)?;
    }

    let content = serialize_prompt_file(frontmatter, body)?;
    fs::write(&full, &content)?;

    Ok(())
}

/// Create a new prompt file from scratch (or from a template) and optionally auto-commit.
pub fn create_file(
    repo_root: &Path,
    file_path: &str,
    title: &str,
    prompt_type: &str,
    template: Option<&str>,
    repo: Option<&Repository>,
    config: &RepoConfig,
) -> Result<PromptFile, AppError> {
    let full = safe_path(repo_root, file_path)?;

    if let Some(parent) = full.parent() {
        fs::create_dir_all(parent)?;
    }

    let content = if let Some(tpl_name) = template {
        let tpl_rel = format!("_templates/{}.md", tpl_name);
        match safe_path(repo_root, &tpl_rel).and_then(|p| {
            fs::read_to_string(&p).map_err(AppError::Io)
        }) {
            Ok(tpl_content) => tpl_content,
            Err(_) => default_template(title, prompt_type),
        }
    } else {
        default_template(title, prompt_type)
    };

    fs::write(&full, &content)?;

    if config.auto_commit {
        if let Some(r) = repo {
            auto_commit(r, &[file_path], "Create", Some(title), &config.commit_prefix)?;
        }
    }

    Ok(parse_prompt_file(file_path, &content))
}

/// Delete a prompt file and optionally auto-commit.
pub fn delete_file(
    repo_root: &Path,
    file_path: &str,
    repo: Option<&Repository>,
    config: &RepoConfig,
) -> Result<(), AppError> {
    let full = safe_path(repo_root, file_path)?;

    // Read first to get title for commit message.
    let content = fs::read_to_string(&full)?;
    let parsed = parse_prompt_file(file_path, &content);

    fs::remove_file(&full)?;

    if config.auto_commit {
        if let Some(r) = repo {
            // For deletes we need to stage the removal via `index.remove_path`.
            let mut index = r.index()?;
            index.remove_path(Path::new(file_path))?;
            index.write()?;

            let tree_oid = index.write_tree()?;
            let tree = r.find_tree(tree_oid)?;

            let message = format!(
                "{} Delete \"{}\"",
                config.commit_prefix, parsed.frontmatter.title
            );
            let sig = r
                .signature()
                .unwrap_or_else(|_| {
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

/// Move/rename a prompt file and optionally auto-commit.
pub fn move_file(
    repo_root: &Path,
    from: &str,
    to: &str,
    repo: Option<&Repository>,
    config: &RepoConfig,
) -> Result<(), AppError> {
    let from_full = safe_path(repo_root, from)?;
    let to_full = safe_path(repo_root, to)?;

    if let Some(parent) = to_full.parent() {
        fs::create_dir_all(parent)?;
    }

    // Read content for the commit message title.
    let content = fs::read_to_string(&from_full)?;
    let parsed = parse_prompt_file(from, &content);

    fs::rename(&from_full, &to_full)?;

    if config.auto_commit {
        if let Some(r) = repo {
            // Stage the removal of the old path and addition of the new path.
            let mut index = r.index()?;
            index.remove_path(Path::new(from))?;
            index.add_path(Path::new(to))?;
            index.write()?;

            let tree_oid = index.write_tree()?;
            let tree = r.find_tree(tree_oid)?;

            let message = format!(
                "{} Move \"{}\"",
                config.commit_prefix, parsed.frontmatter.title
            );
            let sig = r
                .signature()
                .unwrap_or_else(|_| {
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

/// Generate default template content for a new prompt file.
fn default_template(title: &str, prompt_type: &str) -> String {
    let now = Utc::now().to_rfc3339_opts(chrono::SecondsFormat::Millis, true);
    let id = generate_id();
    format!(
        r#"---
id: "{id}"
title: "{title}"
type: {prompt_type}
tags: []
variables: []
created: {now}
modified: {now}
starred_versions: []
---

"#
    )
}

/// Aggregate all tags across every prompt file, returning `TagInfo` with counts.
pub fn list_tags(repo_root: &Path) -> Result<Vec<TagInfo>, AppError> {
    let entries = list_all(repo_root)?;
    let mut counts: HashMap<String, usize> = HashMap::new();
    for entry in &entries {
        for tag in &entry.frontmatter.tags {
            *counts.entry(tag.clone()).or_insert(0) += 1;
        }
    }
    let mut tags: Vec<TagInfo> = counts
        .into_iter()
        .map(|(name, count)| TagInfo { name, count })
        .collect();
    tags.sort_by(|a, b| a.name.cmp(&b.name));
    Ok(tags)
}

/// Rename a tag across all prompt files that contain it.
/// Performs a batch write and a single auto-commit.
pub fn rename_tag(
    repo_root: &Path,
    old_name: &str,
    new_name: &str,
    repo: Option<&Repository>,
    config: &RepoConfig,
) -> Result<usize, AppError> {
    if old_name == new_name {
        return Ok(0);
    }
    let entries = list_all(repo_root)?;
    let mut changed_paths: Vec<String> = Vec::new();

    for entry in &entries {
        if entry.frontmatter.tags.contains(&old_name.to_string()) {
            let file = read_file(repo_root, &entry.path)?;
            let mut fm = file.frontmatter.clone();
            fm.tags = fm
                .tags
                .into_iter()
                .map(|t| if t == old_name { new_name.to_string() } else { t })
                .collect();
            // Deduplicate in case new_name was already present
            fm.tags.sort();
            fm.tags.dedup();
            write_file(repo_root, &entry.path, &fm, &file.body)?;
            changed_paths.push(entry.path.clone());
        }
    }

    if config.auto_commit && !changed_paths.is_empty() {
        if let Some(r) = repo {
            let path_refs: Vec<&str> = changed_paths.iter().map(|s| s.as_str()).collect();
            auto_commit(
                r,
                &path_refs,
                &format!("Rename tag \"{}\" -> \"{}\"", old_name, new_name),
                None,
                &config.commit_prefix,
            )?;
        }
    }

    Ok(changed_paths.len())
}

/// Delete a tag from all prompt files that contain it.
/// Performs a batch write and a single auto-commit.
pub fn delete_tag(
    repo_root: &Path,
    tag_name: &str,
    repo: Option<&Repository>,
    config: &RepoConfig,
) -> Result<usize, AppError> {
    let entries = list_all(repo_root)?;
    let mut changed_paths: Vec<String> = Vec::new();

    for entry in &entries {
        if entry.frontmatter.tags.contains(&tag_name.to_string()) {
            let file = read_file(repo_root, &entry.path)?;
            let mut fm = file.frontmatter.clone();
            fm.tags.retain(|t| t != tag_name);
            write_file(repo_root, &entry.path, &fm, &file.body)?;
            changed_paths.push(entry.path.clone());
        }
    }

    if config.auto_commit && !changed_paths.is_empty() {
        if let Some(r) = repo {
            let path_refs: Vec<&str> = changed_paths.iter().map(|s| s.as_str()).collect();
            auto_commit(
                r,
                &path_refs,
                &format!("Delete tag \"{}\"", tag_name),
                None,
                &config.commit_prefix,
            )?;
        }
    }

    Ok(changed_paths.len())
}

/// Merge multiple source tags into a single target tag across all prompt files.
/// Performs a batch write and a single auto-commit.
pub fn merge_tags(
    repo_root: &Path,
    source_tags: &[String],
    target_tag: &str,
    repo: Option<&Repository>,
    config: &RepoConfig,
) -> Result<usize, AppError> {
    if source_tags.is_empty() {
        return Ok(0);
    }
    let entries = list_all(repo_root)?;
    let mut changed_paths: Vec<String> = Vec::new();

    for entry in &entries {
        let has_source = entry
            .frontmatter
            .tags
            .iter()
            .any(|t| source_tags.contains(t));
        if has_source {
            let file = read_file(repo_root, &entry.path)?;
            let mut fm = file.frontmatter.clone();
            // Replace any source tag with the target tag
            fm.tags = fm
                .tags
                .into_iter()
                .map(|t| {
                    if source_tags.contains(&t) {
                        target_tag.to_string()
                    } else {
                        t
                    }
                })
                .collect();
            // Deduplicate
            fm.tags.sort();
            fm.tags.dedup();
            write_file(repo_root, &entry.path, &fm, &file.body)?;
            changed_paths.push(entry.path.clone());
        }
    }

    if config.auto_commit && !changed_paths.is_empty() {
        if let Some(r) = repo {
            let path_refs: Vec<&str> = changed_paths.iter().map(|s| s.as_str()).collect();
            let source_list = source_tags.join(", ");
            auto_commit(
                r,
                &path_refs,
                &format!("Merge tags [{}] -> \"{}\"", source_list, target_tag),
                None,
                &config.commit_prefix,
            )?;
        }
    }

    Ok(changed_paths.len())
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::git_ops::init_repo;
    use tempfile::TempDir;

    fn test_config(auto_commit: bool) -> RepoConfig {
        RepoConfig {
            auto_commit,
            ..RepoConfig::default()
        }
    }

    #[test]
    fn test_safe_path_rejects_traversal() {
        let tmp = TempDir::new().unwrap();
        assert!(safe_path(tmp.path(), "../etc/passwd").is_err());
        assert!(safe_path(tmp.path(), "foo/../../bar").is_err());
        assert!(safe_path(tmp.path(), "..").is_err());
    }

    #[test]
    fn test_safe_path_allows_valid() {
        let tmp = TempDir::new().unwrap();
        // Create the file so canonicalize works
        let p = tmp.path().join("prompts/hello.md");
        fs::create_dir_all(p.parent().unwrap()).unwrap();
        fs::write(&p, "x").unwrap();

        let result = safe_path(tmp.path(), "prompts/hello.md");
        assert!(result.is_ok());
    }

    #[test]
    fn test_list_all_finds_md_skips_hidden() {
        let tmp = TempDir::new().unwrap();
        let root = tmp.path();

        // Visible .md file
        fs::create_dir_all(root.join("prompts")).unwrap();
        fs::write(
            root.join("prompts/hello.md"),
            "---\ntitle: Hello\n---\nBody",
        )
        .unwrap();

        // Hidden directory should be skipped
        fs::create_dir_all(root.join(".hidden")).unwrap();
        fs::write(root.join(".hidden/secret.md"), "---\ntitle: Secret\n---\n").unwrap();

        // node_modules should be skipped
        fs::create_dir_all(root.join("node_modules")).unwrap();
        fs::write(root.join("node_modules/pkg.md"), "---\ntitle: Pkg\n---\n").unwrap();

        // Non-md file should be skipped
        fs::write(root.join("prompts/notes.txt"), "not markdown").unwrap();

        let entries = list_all(root).unwrap();
        assert_eq!(entries.len(), 1);
        assert_eq!(entries[0].path, "prompts/hello.md");
        assert_eq!(entries[0].frontmatter.title, "Hello");
    }

    #[test]
    fn test_create_read_write_delete_cycle() {
        let tmp = TempDir::new().unwrap();
        let root = tmp.path();
        let config = test_config(false);

        // Create
        let created = create_file(root, "test.md", "My Prompt", "prompt", None, None, &config)
            .unwrap();
        assert_eq!(created.frontmatter.title, "My Prompt");
        assert_eq!(created.path, "test.md");

        // Read
        let read = read_file(root, "test.md").unwrap();
        assert_eq!(read.frontmatter.title, "My Prompt");

        // Read raw
        let raw = read_raw(root, "test.md").unwrap();
        assert!(raw.contains("My Prompt"));

        // Write (update)
        let mut fm = read.frontmatter.clone();
        fm.title = "Updated".to_string();
        write_file(root, "test.md", &fm, "New body\n").unwrap();

        let updated = read_file(root, "test.md").unwrap();
        assert_eq!(updated.frontmatter.title, "Updated");
        assert!(updated.body.contains("New body"));

        // Delete
        delete_file(root, "test.md", None, &config).unwrap();
        assert!(read_file(root, "test.md").is_err());
    }

    #[test]
    fn test_move_file() {
        let tmp = TempDir::new().unwrap();
        let root = tmp.path();
        let config = test_config(false);

        create_file(root, "a.md", "Movable", "prompt", None, None, &config).unwrap();
        move_file(root, "a.md", "sub/b.md", None, &config).unwrap();

        assert!(read_file(root, "a.md").is_err());
        let moved = read_file(root, "sub/b.md").unwrap();
        assert_eq!(moved.frontmatter.title, "Movable");
    }

    #[test]
    fn test_create_with_auto_commit() {
        let tmp = TempDir::new().unwrap();
        let root = tmp.path();
        let repo = init_repo(root).unwrap();
        let config = test_config(true);

        create_file(root, "hello.md", "Hello", "prompt", None, Some(&repo), &config).unwrap();

        // Should have a commit
        let log = crate::git_ops::git_log(&repo, None, 10).unwrap();
        assert_eq!(log.len(), 1);
        assert!(log[0].message.contains("Create"));
        assert!(log[0].message.contains("Hello"));
    }

    #[test]
    fn test_delete_with_auto_commit() {
        let tmp = TempDir::new().unwrap();
        let root = tmp.path();
        let repo = init_repo(root).unwrap();
        let config = test_config(true);

        create_file(root, "del.md", "Deletable", "prompt", None, Some(&repo), &config).unwrap();
        delete_file(root, "del.md", Some(&repo), &config).unwrap();

        let log = crate::git_ops::git_log(&repo, None, 10).unwrap();
        assert_eq!(log.len(), 2);
        assert!(log[0].message.contains("Delete"));
    }

    #[test]
    fn test_move_with_auto_commit() {
        let tmp = TempDir::new().unwrap();
        let root = tmp.path();
        let repo = init_repo(root).unwrap();
        let config = test_config(true);

        create_file(root, "src.md", "Source", "prompt", None, Some(&repo), &config).unwrap();
        move_file(root, "src.md", "dst.md", Some(&repo), &config).unwrap();

        let log = crate::git_ops::git_log(&repo, None, 10).unwrap();
        assert_eq!(log.len(), 2);
        assert!(log[0].message.contains("Move"));
    }

    #[test]
    fn test_create_with_template() {
        let tmp = TempDir::new().unwrap();
        let root = tmp.path();
        let config = test_config(false);

        // Create a template
        fs::create_dir_all(root.join("_templates")).unwrap();
        fs::write(
            root.join("_templates/code-review.md"),
            "---\ntitle: Code Review\ntype: prompt\ntags: [review]\nvariables: []\nstarred_versions: []\n---\nReview the following code:\n",
        )
        .unwrap();

        let created = create_file(
            root,
            "my-review.md",
            "My Review",
            "prompt",
            Some("code-review"),
            None,
            &config,
        )
        .unwrap();

        // Should use template content (title from template, not from argument)
        assert_eq!(created.frontmatter.title, "Code Review");
        assert!(created.body.contains("Review the following code"));
    }

    #[test]
    fn test_create_with_missing_template_falls_back() {
        let tmp = TempDir::new().unwrap();
        let root = tmp.path();
        let config = test_config(false);

        let created = create_file(
            root,
            "test.md",
            "Fallback",
            "prompt",
            Some("nonexistent"),
            None,
            &config,
        )
        .unwrap();

        // Should fall back to default template
        assert_eq!(created.frontmatter.title, "Fallback");
    }

    #[test]
    fn test_list_all_empty_dir() {
        let tmp = TempDir::new().unwrap();
        let entries = list_all(tmp.path()).unwrap();
        assert!(entries.is_empty());
    }

    #[test]
    fn test_list_all_with_nested_dirs() {
        let tmp = TempDir::new().unwrap();
        let root = tmp.path();

        // Files at various depths
        fs::write(root.join("top.md"), "---\ntitle: Top\n---\n").unwrap();
        fs::create_dir_all(root.join("a")).unwrap();
        fs::write(root.join("a/mid.md"), "---\ntitle: Mid\n---\n").unwrap();
        fs::create_dir_all(root.join("a/b/c")).unwrap();
        fs::write(root.join("a/b/c/deep.md"), "---\ntitle: Deep\n---\n").unwrap();

        let entries = list_all(root).unwrap();
        assert_eq!(entries.len(), 3);
        let paths: Vec<&str> = entries.iter().map(|e| e.path.as_str()).collect();
        assert!(paths.contains(&"top.md"));
        assert!(paths.contains(&"a/mid.md"));
        assert!(paths.contains(&"a/b/c/deep.md"));
    }

    #[test]
    fn test_read_nonexistent_file() {
        let tmp = TempDir::new().unwrap();
        let result = read_file(tmp.path(), "does_not_exist.md");
        assert!(result.is_err());
    }

    #[test]
    fn test_create_file_in_nested_dir() {
        let tmp = TempDir::new().unwrap();
        let root = tmp.path();
        let config = test_config(false);

        let created = create_file(root, "a/b/c/file.md", "Nested", "prompt", None, None, &config)
            .unwrap();
        assert_eq!(created.frontmatter.title, "Nested");
        assert!(root.join("a/b/c/file.md").exists());
    }

    #[test]
    fn test_write_preserves_existing_frontmatter_fields() {
        let tmp = TempDir::new().unwrap();
        let root = tmp.path();

        // Create file with tags
        let content = "---\nid: \"x\"\ntitle: Original\ntype: prompt\ntags:\n  - important\n  - review\nvariables: []\ncreated: \"2025-01-01\"\nmodified: \"2025-01-01\"\nstarred_versions: []\n---\nOld body\n";
        fs::write(root.join("tagged.md"), content).unwrap();

        let read = read_file(root, "tagged.md").unwrap();
        // Write with same frontmatter (preserving tags) but new body
        write_file(root, "tagged.md", &read.frontmatter, "New body\n").unwrap();

        let updated = read_file(root, "tagged.md").unwrap();
        assert_eq!(updated.frontmatter.title, "Original");
        assert_eq!(updated.frontmatter.tags, vec!["important", "review"]);
        assert!(updated.body.contains("New body"));
    }

    #[test]
    fn test_delete_nonexistent_file() {
        let tmp = TempDir::new().unwrap();
        let config = test_config(false);
        let result = delete_file(tmp.path(), "ghost.md", None, &config);
        assert!(result.is_err());
    }

    #[test]
    fn test_move_to_same_path() {
        let tmp = TempDir::new().unwrap();
        let root = tmp.path();
        let config = test_config(false);

        create_file(root, "same.md", "Same", "prompt", None, None, &config).unwrap();
        // Moving to the same path should succeed (rename to self is a no-op on most OS)
        let result = move_file(root, "same.md", "same.md", None, &config);
        assert!(result.is_ok());
        let read = read_file(root, "same.md").unwrap();
        assert_eq!(read.frontmatter.title, "Same");
    }

    #[test]
    fn test_safe_path_rejects_absolute_path() {
        let tmp = TempDir::new().unwrap();
        let result = safe_path(tmp.path(), "/etc/passwd");
        assert!(result.is_err());
        let result2 = safe_path(tmp.path(), "/tmp/foo");
        assert!(result2.is_err());
    }

    #[test]
    fn test_list_all_skips_non_md_files() {
        let tmp = TempDir::new().unwrap();
        let root = tmp.path();

        fs::write(root.join("good.md"), "---\ntitle: Good\n---\n").unwrap();
        fs::write(root.join("notes.txt"), "text file").unwrap();
        fs::write(root.join("config.yaml"), "key: value").unwrap();
        fs::write(root.join("data.json"), "{}").unwrap();

        let entries = list_all(root).unwrap();
        assert_eq!(entries.len(), 1);
        assert_eq!(entries[0].path, "good.md");
    }

    #[test]
    fn test_list_all_skips_templates() {
        let tmp = TempDir::new().unwrap();
        let root = tmp.path();

        // Visible .md file
        fs::write(root.join("hello.md"), "---\ntitle: Hello\n---\nBody").unwrap();

        // _templates/ directory should be skipped
        fs::create_dir_all(root.join("_templates")).unwrap();
        fs::write(
            root.join("_templates/code-review.md"),
            "---\ntitle: Code Review\n---\nTemplate body",
        )
        .unwrap();

        let entries = list_all(root).unwrap();
        assert_eq!(entries.len(), 1);
        assert_eq!(entries[0].path, "hello.md");
    }

    #[test]
    fn test_create_with_fragment_type() {
        let tmp = TempDir::new().unwrap();
        let root = tmp.path();
        let config = test_config(false);

        let created = create_file(root, "frag.md", "My Fragment", "fragment", None, None, &config)
            .unwrap();
        assert_eq!(created.frontmatter.title, "My Fragment");
        // Verify the raw content contains fragment type
        let raw = read_raw(root, "frag.md").unwrap();
        assert!(raw.contains("type: fragment"));
    }

    #[test]
    fn test_write_file_does_not_auto_commit() {
        let tmp = TempDir::new().unwrap();
        let root = tmp.path();
        let repo = init_repo(root).unwrap();
        let config = test_config(true);

        // Create a file (this auto-commits)
        create_file(root, "hello.md", "Hello", "prompt", None, Some(&repo), &config).unwrap();

        let log_before = crate::git_ops::git_log(&repo, None, 10).unwrap();
        assert_eq!(log_before.len(), 1);

        // Write to the file (should NOT auto-commit)
        let file = read_file(root, "hello.md").unwrap();
        let mut fm = file.frontmatter.clone();
        fm.title = "Updated Hello".to_string();
        write_file(root, "hello.md", &fm, "New body\n").unwrap();

        // Verify git_log still shows only 1 commit
        let log_after = crate::git_ops::git_log(&repo, None, 10).unwrap();
        assert_eq!(log_after.len(), 1);
        assert!(log_after[0].message.contains("Create"));
    }

    // --- Tag management tests ---

    fn create_tagged_file(root: &Path, path: &str, title: &str, tags: &[&str]) {
        let tags_yaml: String = tags
            .iter()
            .map(|t| format!("  - {}", t))
            .collect::<Vec<_>>()
            .join("\n");
        let content = format!(
            "---\ntitle: {}\ntags:\n{}\n---\nBody of {}\n",
            title, tags_yaml, title
        );
        let full_path = root.join(path);
        if let Some(parent) = full_path.parent() {
            fs::create_dir_all(parent).unwrap();
        }
        fs::write(full_path, content).unwrap();
    }

    #[test]
    fn test_list_tags_empty() {
        let tmp = TempDir::new().unwrap();
        let tags = list_tags(tmp.path()).unwrap();
        assert!(tags.is_empty());
    }

    #[test]
    fn test_list_tags_aggregates_counts() {
        let tmp = TempDir::new().unwrap();
        let root = tmp.path();
        create_tagged_file(root, "a.md", "A", &["rust", "cli"]);
        create_tagged_file(root, "b.md", "B", &["rust", "web"]);
        create_tagged_file(root, "c.md", "C", &["web"]);

        let tags = list_tags(root).unwrap();
        assert_eq!(tags.len(), 3);

        let rust_tag = tags.iter().find(|t| t.name == "rust").unwrap();
        assert_eq!(rust_tag.count, 2);
        let web_tag = tags.iter().find(|t| t.name == "web").unwrap();
        assert_eq!(web_tag.count, 2);
        let cli_tag = tags.iter().find(|t| t.name == "cli").unwrap();
        assert_eq!(cli_tag.count, 1);
    }

    #[test]
    fn test_list_tags_sorted_alphabetically() {
        let tmp = TempDir::new().unwrap();
        let root = tmp.path();
        create_tagged_file(root, "a.md", "A", &["zebra", "alpha", "middle"]);

        let tags = list_tags(root).unwrap();
        let names: Vec<&str> = tags.iter().map(|t| t.name.as_str()).collect();
        assert_eq!(names, vec!["alpha", "middle", "zebra"]);
    }

    #[test]
    fn test_rename_tag() {
        let tmp = TempDir::new().unwrap();
        let root = tmp.path();
        create_tagged_file(root, "a.md", "A", &["old-name", "keep"]);
        create_tagged_file(root, "b.md", "B", &["other"]);

        let config = test_config(false);
        let changed = rename_tag(root, "old-name", "new-name", None, &config).unwrap();
        assert_eq!(changed, 1);

        let file_a = read_file(root, "a.md").unwrap();
        assert!(file_a.frontmatter.tags.contains(&"new-name".to_string()));
        assert!(!file_a.frontmatter.tags.contains(&"old-name".to_string()));
        assert!(file_a.frontmatter.tags.contains(&"keep".to_string()));

        let file_b = read_file(root, "b.md").unwrap();
        assert_eq!(file_b.frontmatter.tags, vec!["other"]);
    }

    #[test]
    fn test_rename_tag_noop_same_name() {
        let tmp = TempDir::new().unwrap();
        let root = tmp.path();
        create_tagged_file(root, "a.md", "A", &["tag"]);

        let config = test_config(false);
        let changed = rename_tag(root, "tag", "tag", None, &config).unwrap();
        assert_eq!(changed, 0);
    }

    #[test]
    fn test_rename_tag_deduplicates() {
        let tmp = TempDir::new().unwrap();
        let root = tmp.path();
        // File has both "alpha" and "beta" -- renaming "alpha" -> "beta" should deduplicate
        create_tagged_file(root, "a.md", "A", &["alpha", "beta"]);

        let config = test_config(false);
        let changed = rename_tag(root, "alpha", "beta", None, &config).unwrap();
        assert_eq!(changed, 1);

        let file = read_file(root, "a.md").unwrap();
        assert_eq!(file.frontmatter.tags, vec!["beta"]);
    }

    #[test]
    fn test_delete_tag() {
        let tmp = TempDir::new().unwrap();
        let root = tmp.path();
        create_tagged_file(root, "a.md", "A", &["remove-me", "keep"]);
        create_tagged_file(root, "b.md", "B", &["keep"]);

        let config = test_config(false);
        let changed = delete_tag(root, "remove-me", None, &config).unwrap();
        assert_eq!(changed, 1);

        let file_a = read_file(root, "a.md").unwrap();
        assert!(!file_a.frontmatter.tags.contains(&"remove-me".to_string()));
        assert!(file_a.frontmatter.tags.contains(&"keep".to_string()));
    }

    #[test]
    fn test_delete_tag_nonexistent() {
        let tmp = TempDir::new().unwrap();
        let root = tmp.path();
        create_tagged_file(root, "a.md", "A", &["exists"]);

        let config = test_config(false);
        let changed = delete_tag(root, "nope", None, &config).unwrap();
        assert_eq!(changed, 0);
    }

    #[test]
    fn test_merge_tags() {
        let tmp = TempDir::new().unwrap();
        let root = tmp.path();
        create_tagged_file(root, "a.md", "A", &["src1", "keep"]);
        create_tagged_file(root, "b.md", "B", &["src2"]);
        create_tagged_file(root, "c.md", "C", &["unrelated"]);

        let config = test_config(false);
        let sources = vec!["src1".to_string(), "src2".to_string()];
        let changed = merge_tags(root, &sources, "merged", None, &config).unwrap();
        assert_eq!(changed, 2);

        let file_a = read_file(root, "a.md").unwrap();
        assert!(file_a.frontmatter.tags.contains(&"merged".to_string()));
        assert!(file_a.frontmatter.tags.contains(&"keep".to_string()));
        assert!(!file_a.frontmatter.tags.contains(&"src1".to_string()));

        let file_b = read_file(root, "b.md").unwrap();
        assert!(file_b.frontmatter.tags.contains(&"merged".to_string()));
        assert!(!file_b.frontmatter.tags.contains(&"src2".to_string()));

        let file_c = read_file(root, "c.md").unwrap();
        assert_eq!(file_c.frontmatter.tags, vec!["unrelated"]);
    }

    #[test]
    fn test_merge_tags_empty_sources() {
        let tmp = TempDir::new().unwrap();
        let root = tmp.path();
        create_tagged_file(root, "a.md", "A", &["tag"]);

        let config = test_config(false);
        let changed = merge_tags(root, &[], "target", None, &config).unwrap();
        assert_eq!(changed, 0);
    }

    #[test]
    fn test_rename_tag_with_auto_commit() {
        let tmp = TempDir::new().unwrap();
        let root = tmp.path();
        let repo = init_repo(root).unwrap();
        let config = test_config(true);

        create_file(root, "a.md", "A", "prompt", None, Some(&repo), &config).unwrap();
        // Add a tag manually
        let file = read_file(root, "a.md").unwrap();
        let mut fm = file.frontmatter.clone();
        fm.tags = vec!["old".to_string()];
        write_file(root, "a.md", &fm, &file.body).unwrap();

        let log_before = crate::git_ops::git_log(&repo, None, 20).unwrap();
        let count_before = log_before.len();

        let changed = rename_tag(root, "old", "new", Some(&repo), &config).unwrap();
        assert_eq!(changed, 1);

        let log_after = crate::git_ops::git_log(&repo, None, 20).unwrap();
        assert_eq!(log_after.len(), count_before + 1);
        assert!(log_after[0].message.contains("Rename tag"));
    }
}
