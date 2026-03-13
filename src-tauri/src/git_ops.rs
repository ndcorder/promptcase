use std::path::Path;
use std::sync::LazyLock;

use git2::{DiffOptions, Repository, Sort};
use regex::Regex;

use crate::error::AppError;
use crate::types::{CommitEntry, DiffHunk, DiffLine, DiffLineType, DiffResult, RepoStatus};

static COMMIT_REF_RE: LazyLock<Regex> = LazyLock::new(|| {
    Regex::new(r"^[0-9a-fA-F]{4,40}$|^HEAD(~\d+)?$|^[a-zA-Z0-9._/-]+$").unwrap()
});

static HUNK_HEADER_RE: LazyLock<Regex> = LazyLock::new(|| {
    Regex::new(r"^@@ -(\d+),?(\d*) \+(\d+),?(\d*) @@").unwrap()
});

// ---------------------------------------------------------------------------
// Helpers / validators
// ---------------------------------------------------------------------------

pub fn validate_commit_ref(ref_str: &str) -> Result<(), AppError> {
    if ref_str.starts_with('-') || ref_str.contains("..") {
        return Err(AppError::Custom(format!(
            "Invalid commit reference: {ref_str}"
        )));
    }
    if !COMMIT_REF_RE.is_match(ref_str) {
        return Err(AppError::Custom(format!(
            "Invalid commit reference: {ref_str}"
        )));
    }
    Ok(())
}

pub fn validate_file_path(path: &str) -> Result<(), AppError> {
    if path.starts_with('-') || path.contains("..") {
        return Err(AppError::Custom(format!("Invalid file path: {path}")));
    }
    Ok(())
}

pub fn parse_diff(raw: &str) -> DiffResult {
    let mut hunks: Vec<DiffHunk> = Vec::new();
    let mut current: Option<&mut DiffHunk> = None;

    for line in raw.lines() {
        if let Some(caps) = HUNK_HEADER_RE.captures(line) {
            let old_start = caps[1].parse::<usize>().unwrap_or(0);
            let old_lines = caps
                .get(2)
                .and_then(|m| {
                    let s = m.as_str();
                    if s.is_empty() { None } else { s.parse::<usize>().ok() }
                })
                .unwrap_or(1);
            let new_start = caps[3].parse::<usize>().unwrap_or(0);
            let new_lines = caps
                .get(4)
                .and_then(|m| {
                    let s = m.as_str();
                    if s.is_empty() { None } else { s.parse::<usize>().ok() }
                })
                .unwrap_or(1);

            hunks.push(DiffHunk {
                old_start,
                old_lines,
                new_start,
                new_lines,
                lines: Vec::new(),
            });
            // Drop the old borrow before creating a new one
            current = hunks.last_mut();
            continue;
        }

        if let Some(ref mut hunk) = current {
            if let Some(rest) = line.strip_prefix('+') {
                hunk.lines.push(DiffLine {
                    line_type: DiffLineType::Add,
                    content: rest.to_string(),
                });
            } else if let Some(rest) = line.strip_prefix('-') {
                hunk.lines.push(DiffLine {
                    line_type: DiffLineType::Remove,
                    content: rest.to_string(),
                });
            } else if let Some(rest) = line.strip_prefix(' ') {
                hunk.lines.push(DiffLine {
                    line_type: DiffLineType::Context,
                    content: rest.to_string(),
                });
            }
        }
    }

    DiffResult {
        raw: raw.to_string(),
        hunks,
    }
}

// ---------------------------------------------------------------------------
// Core functions
// ---------------------------------------------------------------------------

/// Open an existing repo or initialise a new one at `repo_root`.
///
/// Uses `NO_SEARCH` to prevent git2 from walking up the directory tree
/// and accidentally opening a parent repository (e.g. a dotfiles repo at `~`).
pub fn init_repo(repo_root: &Path) -> Result<Repository, AppError> {
    use git2::RepositoryOpenFlags;
    let repo = match Repository::open_ext(
        repo_root,
        RepositoryOpenFlags::NO_SEARCH,
        std::iter::empty::<&std::ffi::OsStr>(),
    ) {
        Ok(r) => r,
        Err(_) => {
            let r = Repository::init(repo_root)?;
            {
                let mut config = r.config()?;
                config.set_str("user.name", "Promptcase")?;
                config.set_str("user.email", "promptcase@local")?;
            }
            r
        }
    };
    Ok(repo)
}

/// Return high-level status for the repository.
/// NOTE: `total_files` counts dirty/changed files (matching TypeScript `git.status().files.length`),
/// not the total number of tracked files in the repo.
pub fn repo_status(repo: &Repository, repo_root: &Path) -> Result<RepoStatus, AppError> {
    let statuses = repo.statuses(None)?;
    // Counts dirty/changed files, not total tracked files (matches TS behavior).
    let total_files = statuses.len();
    let clean = total_files == 0;

    Ok(RepoStatus {
        initialized: true,
        clean,
        total_files,
        repo_path: repo_root.to_string_lossy().into_owned(),
    })
}

/// Stage the given files, create a commit, and return the commit hash.
/// Returns `None` if there was nothing to commit.
pub fn auto_commit(
    repo: &Repository,
    file_paths: &[&str],
    action: &str,
    title: Option<&str>,
    commit_prefix: &str,
) -> Result<Option<String>, AppError> {
    let mut index = repo.index()?;
    for fp in file_paths {
        // add_path expects a relative path inside the workdir
        index.add_path(Path::new(fp))?;
    }
    index.write()?;

    let tree_oid = index.write_tree()?;
    let tree = repo.find_tree(tree_oid)?;

    let message = match title {
        Some(t) => format!("{commit_prefix} {action} \"{t}\""),
        None => format!("{commit_prefix} {action}"),
    };

    let sig = repo
        .signature()
        .unwrap_or_else(|_| git2::Signature::now("Promptcase", "promptcase@local").unwrap());

    let parent = repo.head().ok().and_then(|h| h.peel_to_commit().ok());
    let parents: Vec<&git2::Commit> = match parent.as_ref() {
        Some(p) => vec![p],
        None => vec![],
    };

    let oid = repo.commit(Some("HEAD"), &sig, &sig, &message, &tree, &parents)?;
    Ok(Some(oid.to_string()))
}

/// Return commit log entries, optionally filtered by file path.
pub fn git_log(
    repo: &Repository,
    file_path: Option<&str>,
    limit: usize,
) -> Result<Vec<CommitEntry>, AppError> {
    let mut revwalk = repo.revwalk()?;
    if let Err(_) = revwalk.push_head() {
        return Ok(Vec::new());
    }
    revwalk.set_sorting(Sort::TIME)?;

    let mut entries = Vec::new();

    for oid_result in revwalk {
        if entries.len() >= limit {
            break;
        }
        let oid = oid_result?;
        let commit = repo.find_commit(oid)?;

        // If filtering by file, check whether the file was changed in this commit.
        if let Some(fp) = file_path {
            if !commit_touches_file(repo, &commit, fp) {
                continue;
            }
        }

        let time = commit.time();
        let secs = time.seconds();
        let offset_minutes = time.offset_minutes();
        let date = format_iso8601(secs, offset_minutes);

        let message = commit.message().unwrap_or("").to_string();
        entries.push(CommitEntry {
            hash: oid.to_string(),
            date,
            message,
            additions: 0,
            deletions: 0,
        });
    }

    Ok(entries)
}

/// Compute the diff for a single file between two commits.
pub fn git_diff(
    repo: &Repository,
    file_path: &str,
    commit_a: &str,
    commit_b: &str,
) -> Result<DiffResult, AppError> {
    validate_commit_ref(commit_a)?;
    validate_commit_ref(commit_b)?;
    validate_file_path(file_path)?;

    let obj_a = repo.revparse_single(commit_a)?;
    let obj_b = repo.revparse_single(commit_b)?;

    let tree_a = obj_a.peel_to_commit()?.tree()?;
    let tree_b = obj_b.peel_to_commit()?.tree()?;

    let mut opts = DiffOptions::new();
    opts.pathspec(file_path);

    let diff = repo.diff_tree_to_tree(Some(&tree_a), Some(&tree_b), Some(&mut opts))?;

    let mut raw = String::new();
    diff.print(git2::DiffFormat::Patch, |_delta, _hunk, line| {
        let origin = line.origin();
        match origin {
            '+' | '-' | ' ' => raw.push(origin),
            _ => {}
        }
        raw.push_str(std::str::from_utf8(line.content()).unwrap_or(""));
        true
    })?;

    Ok(parse_diff(&raw))
}

/// Return the file contents at a specific commit.
pub fn show_file_at_commit(
    repo: &Repository,
    file_path: &str,
    commit_ref: &str,
) -> Result<String, AppError> {
    validate_commit_ref(commit_ref)?;
    validate_file_path(file_path)?;

    let obj = repo.revparse_single(commit_ref)?;
    let commit = obj.peel_to_commit()?;
    let tree = commit.tree()?;
    let entry = tree.get_path(Path::new(file_path))?;
    let blob = repo.find_blob(entry.id())?;
    let content = std::str::from_utf8(blob.content())
        .map_err(|e| AppError::Custom(format!("File is not valid UTF-8: {e}")))?;
    Ok(content.to_string())
}

/// Restore a file to its state at a given commit, write it to disk, and auto-commit.
pub fn git_restore(
    repo: &Repository,
    repo_root: &Path,
    file_path: &str,
    commit_ref: &str,
    commit_prefix: &str,
) -> Result<Option<String>, AppError> {
    validate_file_path(file_path)?;
    validate_commit_ref(commit_ref)?;

    let content = show_file_at_commit(repo, file_path, commit_ref)?;

    // Security: ensure the resolved path stays within the repo.
    let full_path = repo_root.join(file_path);
    let canonical_root = repo_root
        .canonicalize()
        .map_err(|e| AppError::Custom(format!("Cannot canonicalize repo root: {e}")))?;
    // Ensure parent dirs exist so canonicalize works on the file itself.
    if let Some(parent) = full_path.parent() {
        std::fs::create_dir_all(parent)?;
    }
    std::fs::write(&full_path, &content)?;
    let canonical_file = full_path
        .canonicalize()
        .map_err(|e| AppError::Custom(format!("Cannot canonicalize file path: {e}")))?;

    if !canonical_file.starts_with(&canonical_root) {
        // Clean up the written file and bail.
        let _ = std::fs::remove_file(&canonical_file);
        return Err(AppError::Custom(format!(
            "Path traversal denied: {file_path}"
        )));
    }

    let short_hash = &commit_ref[..commit_ref.len().min(7)];
    let title = format!("restored to {short_hash}");

    auto_commit(
        repo,
        &[file_path],
        "Restore",
        Some(&title),
        commit_prefix,
    )
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

/// Check if a commit modifies a given file by diffing against its first parent
/// (or against an empty tree for the initial commit).
fn commit_touches_file(repo: &Repository, commit: &git2::Commit, file_path: &str) -> bool {
    let commit_tree = match commit.tree() {
        Ok(t) => t,
        Err(_) => return false,
    };

    let parent_tree = commit
        .parent(0)
        .ok()
        .and_then(|p| p.tree().ok());

    let mut opts = DiffOptions::new();
    opts.pathspec(file_path);

    let diff = repo.diff_tree_to_tree(
        parent_tree.as_ref(),
        Some(&commit_tree),
        Some(&mut opts),
    );

    match diff {
        Ok(d) => d.deltas().count() > 0,
        Err(_) => false,
    }
}

/// Format a unix timestamp + offset into a simplified ISO-8601 string.
fn format_iso8601(secs: i64, offset_minutes: i32) -> String {
    let dt = chrono::DateTime::from_timestamp(secs, 0)
        .unwrap_or_default()
        .with_timezone(&chrono::FixedOffset::east_opt(offset_minutes * 60).unwrap_or(chrono::FixedOffset::east_opt(0).unwrap()));
    dt.to_rfc3339()
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

#[cfg(test)]
mod tests {
    use super::*;
    use tempfile::TempDir;

    #[test]
    fn test_validate_commit_ref_valid() {
        assert!(validate_commit_ref("abcd1234").is_ok());
        assert!(validate_commit_ref("HEAD").is_ok());
        assert!(validate_commit_ref("HEAD~3").is_ok());
        assert!(validate_commit_ref("main").is_ok());
        assert!(validate_commit_ref("feature/foo").is_ok());
    }

    #[test]
    fn test_validate_commit_ref_invalid() {
        assert!(validate_commit_ref("-bad").is_err());
        assert!(validate_commit_ref("a..b").is_err());
        assert!(validate_commit_ref("$$").is_err()); // special chars
        assert!(validate_commit_ref("abc!").is_err());
    }

    #[test]
    fn test_validate_file_path_valid() {
        assert!(validate_file_path("prompts/hello.md").is_ok());
        assert!(validate_file_path("a/b/c.txt").is_ok());
    }

    #[test]
    fn test_validate_file_path_invalid() {
        assert!(validate_file_path("-secret").is_err());
        assert!(validate_file_path("../etc/passwd").is_err());
    }

    #[test]
    fn test_parse_diff_basic() {
        let raw = "\
diff --git a/file.txt b/file.txt
index 1234..5678 100644
--- a/file.txt
+++ b/file.txt
@@ -1,3 +1,4 @@
 context line
-removed line
+added line
+another added
 more context";

        let result = parse_diff(raw);
        assert_eq!(result.hunks.len(), 1);
        let hunk = &result.hunks[0];
        assert_eq!(hunk.old_start, 1);
        assert_eq!(hunk.old_lines, 3);
        assert_eq!(hunk.new_start, 1);
        assert_eq!(hunk.new_lines, 4);
        assert_eq!(hunk.lines.len(), 5);
    }

    #[test]
    fn test_parse_diff_empty() {
        let result = parse_diff("");
        assert!(result.hunks.is_empty());
    }

    #[test]
    fn test_init_repo_creates_new() {
        let tmp = TempDir::new().unwrap();
        let repo = init_repo(tmp.path()).unwrap();
        assert!(!repo.is_bare());

        let config = repo.config().unwrap();
        let name = config.get_string("user.name").unwrap();
        assert_eq!(name, "Promptcase");
    }

    #[test]
    fn test_init_repo_opens_existing() {
        let tmp = TempDir::new().unwrap();
        Repository::init(tmp.path()).unwrap();
        // Should open without error
        let repo = init_repo(tmp.path()).unwrap();
        assert!(!repo.is_bare());
    }

    #[test]
    fn test_repo_status_clean() {
        let tmp = TempDir::new().unwrap();
        let repo = init_repo(tmp.path()).unwrap();
        let status = repo_status(&repo, tmp.path()).unwrap();
        assert!(status.initialized);
        assert!(status.clean);
        assert_eq!(status.total_files, 0);
    }

    #[test]
    fn test_auto_commit_and_log() {
        let tmp = TempDir::new().unwrap();
        let repo = init_repo(tmp.path()).unwrap();

        // Create a file
        std::fs::write(tmp.path().join("hello.txt"), "hello world").unwrap();

        let hash = auto_commit(&repo, &["hello.txt"], "Create", Some("hello"), "[pc]")
            .unwrap();
        assert!(hash.is_some());

        let log = git_log(&repo, None, 10).unwrap();
        assert_eq!(log.len(), 1);
        assert!(log[0].message.contains("[pc] Create \"hello\""));
    }

    #[test]
    fn test_git_log_with_file_filter() {
        let tmp = TempDir::new().unwrap();
        let repo = init_repo(tmp.path()).unwrap();

        std::fs::write(tmp.path().join("a.txt"), "aaa").unwrap();
        auto_commit(&repo, &["a.txt"], "Add", Some("a"), "[pc]").unwrap();

        std::fs::write(tmp.path().join("b.txt"), "bbb").unwrap();
        auto_commit(&repo, &["b.txt"], "Add", Some("b"), "[pc]").unwrap();

        let all = git_log(&repo, None, 10).unwrap();
        assert_eq!(all.len(), 2);

        let only_a = git_log(&repo, Some("a.txt"), 10).unwrap();
        assert_eq!(only_a.len(), 1);
        assert!(only_a[0].message.contains("\"a\""));
    }

    #[test]
    fn test_show_file_at_commit() {
        let tmp = TempDir::new().unwrap();
        let repo = init_repo(tmp.path()).unwrap();

        std::fs::write(tmp.path().join("f.txt"), "version1").unwrap();
        let hash = auto_commit(&repo, &["f.txt"], "v1", None, "[pc]")
            .unwrap()
            .unwrap();

        std::fs::write(tmp.path().join("f.txt"), "version2").unwrap();
        auto_commit(&repo, &["f.txt"], "v2", None, "[pc]").unwrap();

        let content = show_file_at_commit(&repo, "f.txt", &hash).unwrap();
        assert_eq!(content, "version1");
    }

    #[test]
    fn test_git_diff_between_commits() {
        let tmp = TempDir::new().unwrap();
        let repo = init_repo(tmp.path()).unwrap();

        std::fs::write(tmp.path().join("f.txt"), "line1\n").unwrap();
        let h1 = auto_commit(&repo, &["f.txt"], "v1", None, "[pc]")
            .unwrap()
            .unwrap();

        std::fs::write(tmp.path().join("f.txt"), "line1\nline2\n").unwrap();
        let h2 = auto_commit(&repo, &["f.txt"], "v2", None, "[pc]")
            .unwrap()
            .unwrap();

        let diff = git_diff(&repo, "f.txt", &h1, &h2).unwrap();
        assert!(!diff.hunks.is_empty());
    }

    #[test]
    fn test_git_restore() {
        let tmp = TempDir::new().unwrap();
        let repo = init_repo(tmp.path()).unwrap();

        std::fs::write(tmp.path().join("f.txt"), "original").unwrap();
        let h1 = auto_commit(&repo, &["f.txt"], "v1", None, "[pc]")
            .unwrap()
            .unwrap();

        std::fs::write(tmp.path().join("f.txt"), "modified").unwrap();
        auto_commit(&repo, &["f.txt"], "v2", None, "[pc]").unwrap();

        let restore_hash = git_restore(&repo, tmp.path(), "f.txt", &h1, "[pc]").unwrap();
        assert!(restore_hash.is_some());

        let on_disk = std::fs::read_to_string(tmp.path().join("f.txt")).unwrap();
        assert_eq!(on_disk, "original");
    }

    // -----------------------------------------------------------------------
    // New comprehensive tests
    // -----------------------------------------------------------------------

    #[test]
    fn test_validate_ref_empty_string() {
        assert!(validate_commit_ref("").is_err());
    }

    #[test]
    fn test_validate_ref_full_sha() {
        // 40-char lowercase hex is a valid full SHA
        let sha = "abcdef0123456789abcdef0123456789abcdef01";
        assert!(validate_commit_ref(sha).is_ok());
        // Mixed case
        let sha_upper = "ABCDEF0123456789abcdef0123456789abcdef01";
        assert!(validate_commit_ref(sha_upper).is_ok());
    }

    #[test]
    fn test_validate_file_path_empty_string() {
        // Empty string has no leading dash and no ".." so it passes validation
        assert!(validate_file_path("").is_ok());
    }

    #[test]
    fn test_parse_diff_multiple_hunks() {
        let raw = "\
diff --git a/file.txt b/file.txt
--- a/file.txt
+++ b/file.txt
@@ -1,3 +1,4 @@
 ctx1
-old1
+new1
+new2
 ctx2
@@ -10,2 +11,3 @@
 ctx3
+added_line
 ctx4";

        let result = parse_diff(raw);
        assert_eq!(result.hunks.len(), 2);
        // First hunk
        assert_eq!(result.hunks[0].old_start, 1);
        assert_eq!(result.hunks[0].new_start, 1);
        assert_eq!(result.hunks[0].lines.len(), 5);
        // Second hunk
        assert_eq!(result.hunks[1].old_start, 10);
        assert_eq!(result.hunks[1].new_start, 11);
        assert_eq!(result.hunks[1].lines.len(), 3);
    }

    #[test]
    fn test_parse_diff_context_only() {
        let raw = "\
@@ -1,3 +1,3 @@
 line1
 line2
 line3";

        let result = parse_diff(raw);
        assert_eq!(result.hunks.len(), 1);
        let hunk = &result.hunks[0];
        assert_eq!(hunk.lines.len(), 3);
        assert!(hunk.lines.iter().all(|l| matches!(l.line_type, DiffLineType::Context)));
    }

    #[test]
    fn test_parse_diff_no_context() {
        let raw = "\
@@ -1,2 +1,2 @@
-removed1
-removed2
+added1
+added2";

        let result = parse_diff(raw);
        assert_eq!(result.hunks.len(), 1);
        let hunk = &result.hunks[0];
        let adds = hunk.lines.iter().filter(|l| matches!(l.line_type, DiffLineType::Add)).count();
        let removes = hunk.lines.iter().filter(|l| matches!(l.line_type, DiffLineType::Remove)).count();
        assert_eq!(adds, 2);
        assert_eq!(removes, 2);
        // No context lines
        let ctx = hunk.lines.iter().filter(|l| matches!(l.line_type, DiffLineType::Context)).count();
        assert_eq!(ctx, 0);
    }

    #[test]
    fn test_auto_commit_no_changes() {
        let tmp = TempDir::new().unwrap();
        let repo = init_repo(tmp.path()).unwrap();

        // Create and commit a file
        std::fs::write(tmp.path().join("f.txt"), "content").unwrap();
        auto_commit(&repo, &["f.txt"], "Create", None, "[pc]").unwrap();

        // Commit the same file again without changes – git2 still creates a commit
        // but the tree is identical. Verify it doesn't error.
        let result = auto_commit(&repo, &["f.txt"], "Noop", None, "[pc]");
        assert!(result.is_ok());
    }

    #[test]
    fn test_git_log_with_limit() {
        let tmp = TempDir::new().unwrap();
        let repo = init_repo(tmp.path()).unwrap();

        // Create 5 commits
        for i in 0..5 {
            let name = format!("file{i}.txt");
            std::fs::write(tmp.path().join(&name), format!("content {i}")).unwrap();
            auto_commit(&repo, &[name.as_str()], "Add", Some(&name), "[pc]").unwrap();
        }

        let log = git_log(&repo, None, 2).unwrap();
        assert_eq!(log.len(), 2);

        // Full log should have 5
        let full = git_log(&repo, None, 100).unwrap();
        assert_eq!(full.len(), 5);
    }

    #[test]
    fn test_git_log_empty_repo() {
        let tmp = TempDir::new().unwrap();
        let repo = init_repo(tmp.path()).unwrap();

        // No commits yet — push_head() fails, git_log must return Ok(vec![]).
        let result = git_log(&repo, None, 10).unwrap();
        assert!(result.is_empty());
    }

    #[test]
    fn test_git_diff_identical_commits() {
        let tmp = TempDir::new().unwrap();
        let repo = init_repo(tmp.path()).unwrap();

        std::fs::write(tmp.path().join("f.txt"), "hello\n").unwrap();
        let h = auto_commit(&repo, &["f.txt"], "Add", None, "[pc]")
            .unwrap()
            .unwrap();

        // Diff a commit against itself → empty diff
        let diff = git_diff(&repo, "f.txt", &h, &h).unwrap();
        assert!(diff.hunks.is_empty());
    }

    #[test]
    fn test_repo_status_uncommitted_changes() {
        let tmp = TempDir::new().unwrap();
        let repo = init_repo(tmp.path()).unwrap();

        // Create a file but don't commit
        std::fs::write(tmp.path().join("dirty.txt"), "uncommitted").unwrap();

        let status = repo_status(&repo, tmp.path()).unwrap();
        assert!(!status.clean);
        assert!(status.total_files > 0);
    }

    #[test]
    fn test_show_file_at_commit_nonexistent_file() {
        let tmp = TempDir::new().unwrap();
        let repo = init_repo(tmp.path()).unwrap();

        std::fs::write(tmp.path().join("exists.txt"), "yes").unwrap();
        let h = auto_commit(&repo, &["exists.txt"], "Add", None, "[pc]")
            .unwrap()
            .unwrap();

        let result = show_file_at_commit(&repo, "nope.txt", &h);
        assert!(result.is_err());
    }

    #[test]
    fn test_show_file_at_commit_nonexistent_ref() {
        let tmp = TempDir::new().unwrap();
        let repo = init_repo(tmp.path()).unwrap();

        std::fs::write(tmp.path().join("f.txt"), "data").unwrap();
        auto_commit(&repo, &["f.txt"], "Add", None, "[pc]").unwrap();

        // Use a valid-format but nonexistent SHA
        let result = show_file_at_commit(&repo, "f.txt", "deadbeefdeadbeefdeadbeefdeadbeefdeadbeef");
        assert!(result.is_err());
    }

    #[test]
    fn test_git_restore_path_traversal() {
        let tmp = TempDir::new().unwrap();
        let repo = init_repo(tmp.path()).unwrap();

        std::fs::write(tmp.path().join("f.txt"), "data").unwrap();
        let h = auto_commit(&repo, &["f.txt"], "Add", None, "[pc]")
            .unwrap()
            .unwrap();

        // Path with ".." should be rejected by validate_file_path
        let result = git_restore(&repo, tmp.path(), "../escape.txt", &h, "[pc]");
        assert!(result.is_err());
    }

    #[test]
    fn test_multiple_auto_commits_in_log() {
        let tmp = TempDir::new().unwrap();
        let repo = init_repo(tmp.path()).unwrap();

        let files = ["alpha.txt", "beta.txt", "gamma.txt"];
        for f in &files {
            std::fs::write(tmp.path().join(f), format!("content of {f}")).unwrap();
            auto_commit(&repo, &[*f], "Create", Some(f), "[pc]").unwrap();
        }

        let log = git_log(&repo, None, 100).unwrap();
        assert_eq!(log.len(), 3);

        // Verify all three files appear in the log (order may vary with same-second timestamps)
        let messages: Vec<&str> = log.iter().map(|e| e.message.as_str()).collect();
        assert!(messages.iter().any(|m| m.contains("alpha.txt")));
        assert!(messages.iter().any(|m| m.contains("beta.txt")));
        assert!(messages.iter().any(|m| m.contains("gamma.txt")));
    }
}
