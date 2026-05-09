//! Scan a directory tree for prompts scattered across codebases.
//!
//! Two categories:
//! - **File-level**: the whole file is a prompt (high confidence 0.9+)
//! - **Code-level**: extract prompts from source code via regex (medium confidence 0.5–0.8)

use std::path::Path;

use regex::Regex;
use serde::{Deserialize, Serialize};
use walkdir::WalkDir;

use crate::error::AppError;

/// A prompt discovered by the scanner.
#[derive(Serialize, Deserialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct ScannedPrompt {
    /// Absolute or repo-relative path where the prompt was found.
    pub source_path: String,
    /// Category tag: "claude-md", "cursorrules", "copilot", "code-python", etc.
    pub source_type: String,
    /// Human-readable title derived from filename or first content line.
    pub title: String,
    /// The prompt text itself.
    pub content: String,
    /// 0.0–1.0 — file-level patterns score 0.9+, code-level 0.5–0.8.
    pub confidence: f32,
}

// ---------------------------------------------------------------------------
// Skip directories
// ---------------------------------------------------------------------------

const SKIP_DIRS: &[&str] = &[
    "node_modules",
    ".git",
    "target",
    "__pycache__",
    ".venv",
    "venv",
    "dist",
    "build",
    ".next",
];

/// Max bytes to read from any single file.
const MAX_FILE_BYTES: u64 = 100_000;

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/// Walk `path` and return every prompt-like artifact found.
pub fn scan_directory(path: &Path) -> Result<Vec<ScannedPrompt>, AppError> {
    let mut results = Vec::new();

    let walker = WalkDir::new(path)
        .follow_links(false)
        .into_iter()
        .filter_entry(|e| {
            if e.file_type().is_dir() {
                let name = e.file_name().to_string_lossy();
                !SKIP_DIRS.contains(&name.as_ref())
            } else {
                true
            }
        });

    for entry in walker {
        let entry = match entry {
            Ok(e) => e,
            Err(_) => continue,
        };
        if !entry.file_type().is_file() {
            continue;
        }

        let file_path = entry.path();

        // Skip files larger than MAX_FILE_BYTES
        if let Ok(meta) = std::fs::metadata(file_path) {
            if meta.len() > MAX_FILE_BYTES {
                continue;
            }
        }

        // Try file-level pattern first
        if let Some(prompt) = try_file_level(file_path) {
            results.push(prompt);
            continue;
        }

        // Try code-level extraction
        let mut code_results = try_code_level(file_path);
        results.append(&mut code_results);
    }

    // Sort by confidence descending, then by path for stability
    results.sort_by(|a, b| {
        b.confidence
            .partial_cmp(&a.confidence)
            .unwrap_or(std::cmp::Ordering::Equal)
            .then_with(|| a.source_path.cmp(&b.source_path))
    });

    Ok(results)
}

// ---------------------------------------------------------------------------
// File-level matching
// ---------------------------------------------------------------------------

/// Check whether the entire file is a known prompt artifact.
fn try_file_level(path: &Path) -> Option<ScannedPrompt> {
    let name = path.file_name()?.to_string_lossy();
    let name_lower = name.to_lowercase();
    let ext = path.extension().map(|e| e.to_string_lossy().to_lowercase());

    // Build a (source_type, confidence) if the file matches any known pattern.
    let classification = classify_file_level(path, &name_lower, ext.as_deref());
    let (source_type, confidence) = classification?;

    let content = std::fs::read_to_string(path).ok()?;
    if content.trim().is_empty() {
        return None;
    }

    let title = derive_title(&name, &content);

    Some(ScannedPrompt {
        source_path: path.to_string_lossy().into_owned(),
        source_type: source_type.to_string(),
        title,
        content,
        confidence,
    })
}

fn classify_file_level<'a>(
    path: &Path,
    name_lower: &str,
    ext: Option<&str>,
) -> Option<(&'a str, f32)> {
    // Exact filenames
    match name_lower {
        "claude.md" => return Some(("claude-md", 0.95)),
        "agents.md" => return Some(("agents-md", 0.90)),
        ".cursorrules" => return Some(("cursorrules", 0.95)),
        ".windsurfrules" => return Some(("windsurfrules", 0.95)),
        _ => {}
    }

    // Path-based patterns
    let path_str = path.to_string_lossy();
    let path_unix = path_str.replace('\\', "/");

    // .claude/agents/*.md
    if path_unix.contains("/.claude/agents/") && ext == Some("md") {
        return Some(("claude-agent", 0.95));
    }

    // .cursor/rules/*.md or .cursor/rules/*.mdc
    if path_unix.contains("/.cursor/rules/") && matches!(ext, Some("md") | Some("mdc")) {
        return Some(("cursor-rules", 0.95));
    }

    // .github/copilot-instructions.md
    if name_lower == "copilot-instructions.md" && path_unix.contains("/.github/") {
        return Some(("copilot", 0.95));
    }

    // *.prompt or *.prompt.md
    if name_lower.ends_with(".prompt") || name_lower.ends_with(".prompt.md") {
        return Some(("prompt-file", 0.95));
    }

    // **/prompts/*.md or **/prompts/*.txt
    if matches!(ext, Some("md") | Some("txt")) {
        if let Some(parent) = path.parent() {
            let parent_name = parent
                .file_name()
                .map(|n| n.to_string_lossy().to_lowercase());
            if parent_name.as_deref() == Some("prompts") {
                return Some(("prompt-file", 0.90));
            }
        }
    }

    None
}

// ---------------------------------------------------------------------------
// Code-level extraction
// ---------------------------------------------------------------------------

/// Try to pull system-prompt-like strings out of source code.
fn try_code_level(path: &Path) -> Vec<ScannedPrompt> {
    let ext = match path.extension().and_then(|e| e.to_str()) {
        Some(e) => e.to_lowercase(),
        None => return Vec::new(),
    };

    match ext.as_str() {
        "py" => extract_python(path),
        "ts" | "js" | "tsx" | "jsx" => extract_js_ts(path),
        "yaml" | "yml" => extract_yaml(path),
        _ => Vec::new(),
    }
}

fn extract_python(path: &Path) -> Vec<ScannedPrompt> {
    let content = match std::fs::read_to_string(path) {
        Ok(c) => c,
        Err(_) => return Vec::new(),
    };

    let path_str = path.to_string_lossy().into_owned();
    let mut results = Vec::new();

    // Triple-quoted system_prompt
    let re_triple = Regex::new(
        r#"system_prompt\s*=\s*"{3}([\s\S]*?)"{3}|system_prompt\s*=\s*'{3}([\s\S]*?)'{3}"#,
    )
    .unwrap();
    for cap in re_triple.captures_iter(&content) {
        let text = cap.get(1).or_else(|| cap.get(2)).map(|m| m.as_str());
        if let Some(t) = text {
            if !t.trim().is_empty() {
                results.push(ScannedPrompt {
                    source_path: path_str.clone(),
                    source_type: "code-python".into(),
                    title: derive_code_title(path, results.len()),
                    content: t.trim().to_string(),
                    confidence: 0.7,
                });
            }
        }
    }

    // Single-line system_prompt = "..."
    let re_single =
        Regex::new(r#"system_prompt\s*=\s*"([^"]{10,})""#).unwrap();
    for cap in re_single.captures_iter(&content) {
        if let Some(m) = cap.get(1) {
            let t = m.as_str();
            // Avoid duplicates from triple-quote matches
            if !results.iter().any(|r| r.content == t) {
                results.push(ScannedPrompt {
                    source_path: path_str.clone(),
                    source_type: "code-python".into(),
                    title: derive_code_title(path, results.len()),
                    content: t.to_string(),
                    confidence: 0.6,
                });
            }
        }
    }

    // Message-array pattern: {"role": "system", "content": "..."}
    append_message_array_matches(&content, &path_str, "code-python", &mut results);

    results
}

fn extract_js_ts(path: &Path) -> Vec<ScannedPrompt> {
    let content = match std::fs::read_to_string(path) {
        Ok(c) => c,
        Err(_) => return Vec::new(),
    };

    let ext = path
        .extension()
        .unwrap_or_default()
        .to_string_lossy()
        .to_lowercase();
    let source_type = format!("code-{}", if ext == "ts" || ext == "tsx" { "typescript" } else { "javascript" });
    let path_str = path.to_string_lossy().into_owned();
    let mut results = Vec::new();

    // Template literal: system_prompt = `...`
    let re_template =
        Regex::new(r#"system_prompt\s*=\s*`([^`]{10,})`"#).unwrap();
    for cap in re_template.captures_iter(&content) {
        if let Some(m) = cap.get(1) {
            results.push(ScannedPrompt {
                source_path: path_str.clone(),
                source_type: source_type.clone(),
                title: derive_code_title(path, results.len()),
                content: m.as_str().trim().to_string(),
                confidence: 0.7,
            });
        }
    }

    // String literal: system_prompt = "..."
    let re_string =
        Regex::new(r#"system_prompt\s*=\s*["']([^"']{10,})["']"#).unwrap();
    for cap in re_string.captures_iter(&content) {
        if let Some(m) = cap.get(1) {
            let t = m.as_str();
            if !results.iter().any(|r| r.content == t) {
                results.push(ScannedPrompt {
                    source_path: path_str.clone(),
                    source_type: source_type.clone(),
                    title: derive_code_title(path, results.len()),
                    content: t.to_string(),
                    confidence: 0.6,
                });
            }
        }
    }

    // Message-array pattern
    append_message_array_matches(&content, &path_str, &source_type, &mut results);

    results
}

fn extract_yaml(path: &Path) -> Vec<ScannedPrompt> {
    let content = match std::fs::read_to_string(path) {
        Ok(c) => c,
        Err(_) => return Vec::new(),
    };

    let path_str = path.to_string_lossy().into_owned();
    let mut results = Vec::new();

    // Match `system_prompt:` or `prompt:` followed by a value
    // Handles both inline and block-scalar (|, >) forms
    let re = Regex::new(
        r"(?m)^\s*(?:system_prompt|prompt)\s*:\s*[|>]?-?\s*\n((?:\s+.+\n?)+)",
    )
    .unwrap();
    for cap in re.captures_iter(&content) {
        if let Some(m) = cap.get(1) {
            let text = dedent_yaml_block(m.as_str());
            if text.len() >= 10 {
                results.push(ScannedPrompt {
                    source_path: path_str.clone(),
                    source_type: "code-yaml".into(),
                    title: derive_code_title(path, results.len()),
                    content: text,
                    confidence: 0.7,
                });
            }
        }
    }

    // Inline: system_prompt: "..." or prompt: "..."
    let re_inline = Regex::new(
        r#"(?m)^\s*(?:system_prompt|prompt)\s*:\s*["']([^"']{10,})["']"#,
    )
    .unwrap();
    for cap in re_inline.captures_iter(&content) {
        if let Some(m) = cap.get(1) {
            results.push(ScannedPrompt {
                source_path: path_str.clone(),
                source_type: "code-yaml".into(),
                title: derive_code_title(path, results.len()),
                content: m.as_str().trim().to_string(),
                confidence: 0.65,
            });
        }
    }

    results
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/// Shared regex for message-array patterns across Python/JS/TS.
fn append_message_array_matches(
    content: &str,
    path_str: &str,
    source_type: &str,
    results: &mut Vec<ScannedPrompt>,
) {
    let re = Regex::new(
        r#"["']role["']\s*:\s*["']system["']\s*,\s*["']content["']\s*:\s*["']([^"']{10,})["']"#,
    )
    .unwrap();
    for cap in re.captures_iter(content) {
        if let Some(m) = cap.get(1) {
            let t = m.as_str();
            if !results.iter().any(|r| r.content == t) {
                results.push(ScannedPrompt {
                    source_path: path_str.to_string(),
                    source_type: source_type.to_string(),
                    title: format!("System prompt from {}", Path::new(path_str).file_name().unwrap_or_default().to_string_lossy()),
                    content: t.to_string(),
                    confidence: 0.6,
                });
            }
        }
    }
}

/// Derive a title from a file’s name and content.
fn derive_title(filename: &str, content: &str) -> String {
    // Use the first markdown heading if present
    for line in content.lines().take(5) {
        let trimmed = line.trim();
        if let Some(heading) = trimmed.strip_prefix("# ") {
            let h = heading.trim();
            if !h.is_empty() {
                return h.to_string();
            }
        }
    }
    // Fall back to filename without extension
    let p = Path::new(filename);
    let stem = p.file_stem().unwrap_or(p.as_ref());
    stem.to_string_lossy()
        .replace(['-', '_'], " ")
        .trim()
        .to_string()
}

/// Derive a title for code-extracted prompts.
fn derive_code_title(path: &Path, index: usize) -> String {
    let fname = path
        .file_name()
        .unwrap_or_default()
        .to_string_lossy();
    if index == 0 {
        format!("System prompt from {fname}")
    } else {
        format!("System prompt #{} from {fname}", index + 1)
    }
}

/// Remove common leading whitespace from a YAML block scalar.
fn dedent_yaml_block(text: &str) -> String {
    let lines: Vec<&str> = text.lines().collect();
    let min_indent = lines
        .iter()
        .filter(|l| !l.trim().is_empty())
        .map(|l| l.len() - l.trim_start().len())
        .min()
        .unwrap_or(0);
    lines
        .iter()
        .map(|l| {
            if l.len() >= min_indent {
                &l[min_indent..]
            } else {
                l.trim()
            }
        })
        .collect::<Vec<_>>()
        .join("\n")
        .trim()
        .to_string()
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

#[cfg(test)]
mod tests {
    use super::*;
    use std::fs;
    use tempfile::TempDir;

    #[test]
    fn test_classify_claude_md() {
        let dir = TempDir::new().unwrap();
        let p = dir.path().join("CLAUDE.md");
        fs::write(&p, "# My Instructions\nDo stuff.").unwrap();
        let result = try_file_level(&p).unwrap();
        assert_eq!(result.source_type, "claude-md");
        assert!(result.confidence >= 0.9);
        assert_eq!(result.title, "My Instructions");
    }

    #[test]
    fn test_classify_cursorrules() {
        let dir = TempDir::new().unwrap();
        let p = dir.path().join(".cursorrules");
        fs::write(&p, "Always use TypeScript.").unwrap();
        let result = try_file_level(&p).unwrap();
        assert_eq!(result.source_type, "cursorrules");
        assert!(result.confidence >= 0.9);
    }

    #[test]
    fn test_classify_copilot() {
        let dir = TempDir::new().unwrap();
        let github = dir.path().join(".github");
        fs::create_dir_all(&github).unwrap();
        let p = github.join("copilot-instructions.md");
        fs::write(&p, "Follow our coding standards.").unwrap();
        let result = try_file_level(&p).unwrap();
        assert_eq!(result.source_type, "copilot");
    }

    #[test]
    fn test_classify_cursor_rules_dir() {
        let dir = TempDir::new().unwrap();
        let rules = dir.path().join(".cursor").join("rules");
        fs::create_dir_all(&rules).unwrap();
        let p = rules.join("my-rule.mdc");
        fs::write(&p, "Use semicolons.").unwrap();
        let result = try_file_level(&p).unwrap();
        assert_eq!(result.source_type, "cursor-rules");
    }

    #[test]
    fn test_classify_prompt_file() {
        let dir = TempDir::new().unwrap();
        let p = dir.path().join("summarize.prompt");
        fs::write(&p, "Summarize the following text.").unwrap();
        let result = try_file_level(&p).unwrap();
        assert_eq!(result.source_type, "prompt-file");
    }

    #[test]
    fn test_classify_prompt_md() {
        let dir = TempDir::new().unwrap();
        let p = dir.path().join("extract.prompt.md");
        fs::write(&p, "Extract key entities.").unwrap();
        let result = try_file_level(&p).unwrap();
        assert_eq!(result.source_type, "prompt-file");
    }

    #[test]
    fn test_classify_prompts_dir() {
        let dir = TempDir::new().unwrap();
        let prompts = dir.path().join("prompts");
        fs::create_dir_all(&prompts).unwrap();
        let p = prompts.join("greet.md");
        fs::write(&p, "Greet the user warmly.").unwrap();
        let result = try_file_level(&p).unwrap();
        assert_eq!(result.source_type, "prompt-file");
        assert!(result.confidence >= 0.9);
    }

    #[test]
    fn test_classify_windsurfrules() {
        let dir = TempDir::new().unwrap();
        let p = dir.path().join(".windsurfrules");
        fs::write(&p, "Prefer functional style.").unwrap();
        let result = try_file_level(&p).unwrap();
        assert_eq!(result.source_type, "windsurfrules");
    }

    #[test]
    fn test_classify_agents_md() {
        let dir = TempDir::new().unwrap();
        let p = dir.path().join("AGENTS.md");
        fs::write(&p, "Agent definitions here.").unwrap();
        let result = try_file_level(&p).unwrap();
        assert_eq!(result.source_type, "agents-md");
    }

    #[test]
    fn test_classify_claude_agent() {
        let dir = TempDir::new().unwrap();
        let agents = dir.path().join(".claude").join("agents");
        fs::create_dir_all(&agents).unwrap();
        let p = agents.join("reviewer.md");
        fs::write(&p, "You are a code reviewer.").unwrap();
        let result = try_file_level(&p).unwrap();
        assert_eq!(result.source_type, "claude-agent");
    }

    #[test]
    fn test_empty_file_skipped() {
        let dir = TempDir::new().unwrap();
        let p = dir.path().join("CLAUDE.md");
        fs::write(&p, "   ").unwrap();
        assert!(try_file_level(&p).is_none());
    }

    #[test]
    fn test_extract_python_triple_quote() {
        let dir = TempDir::new().unwrap();
        let p = dir.path().join("app.py");
        fs::write(
            &p,
            r#"
system_prompt = """You are a helpful assistant.
Be concise and accurate."""
"#,
        )
        .unwrap();
        let results = extract_python(&p);
        assert_eq!(results.len(), 1);
        assert!(results[0].content.contains("helpful assistant"));
        assert_eq!(results[0].source_type, "code-python");
    }

    #[test]
    fn test_extract_python_single_line() {
        let dir = TempDir::new().unwrap();
        let p = dir.path().join("bot.py");
        fs::write(
            &p,
            r#"system_prompt = "You are a translation bot that translates English to French.""#,
        )
        .unwrap();
        let results = extract_python(&p);
        assert_eq!(results.len(), 1);
        assert!(results[0].content.contains("translation bot"));
    }

    #[test]
    fn test_extract_js_template_literal() {
        let dir = TempDir::new().unwrap();
        let p = dir.path().join("chat.ts");
        fs::write(
            &p,
            "const system_prompt = `You are an expert code reviewer.\nBe thorough.`;",
        )
        .unwrap();
        let results = extract_js_ts(&p);
        assert_eq!(results.len(), 1);
        assert!(results[0].content.contains("code reviewer"));
        assert_eq!(results[0].source_type, "code-typescript");
    }

    #[test]
    fn test_extract_message_array() {
        let dir = TempDir::new().unwrap();
        let p = dir.path().join("api.js");
        fs::write(
            &p,
            r#"const messages = [{"role": "system", "content": "You are a friendly chatbot assistant."}]"#,
        )
        .unwrap();
        let results = extract_js_ts(&p);
        assert_eq!(results.len(), 1);
        assert!(results[0].content.contains("friendly chatbot"));
    }

    #[test]
    fn test_extract_yaml_block() {
        let dir = TempDir::new().unwrap();
        let p = dir.path().join("config.yaml");
        fs::write(
            &p,
            "system_prompt: |\n  You are an expert data analyst.\n  Focus on accuracy and clarity.\n",
        )
        .unwrap();
        let results = extract_yaml(&p);
        assert_eq!(results.len(), 1);
        assert!(results[0].content.contains("data analyst"));
    }

    #[test]
    fn test_extract_yaml_inline() {
        let dir = TempDir::new().unwrap();
        let p = dir.path().join("config.yml");
        fs::write(
            &p,
            r#"prompt: "You are a creative writing assistant that helps with stories."
"#,
        )
        .unwrap();
        let results = extract_yaml(&p);
        assert_eq!(results.len(), 1);
        assert!(results[0].content.contains("creative writing"));
    }

    #[test]
    fn test_scan_directory_skips_node_modules() {
        let dir = TempDir::new().unwrap();
        let nm = dir.path().join("node_modules").join("some-pkg");
        fs::create_dir_all(&nm).unwrap();
        fs::write(nm.join("CLAUDE.md"), "# Hidden").unwrap();

        // A real prompt at root level
        fs::write(dir.path().join("CLAUDE.md"), "# Root").unwrap();

        let results = scan_directory(dir.path()).unwrap();
        assert_eq!(results.len(), 1);
        assert!(results[0].title.contains("Root"));
    }

    #[test]
    fn test_scan_directory_mixed() {
        let dir = TempDir::new().unwrap();
        fs::write(dir.path().join(".cursorrules"), "Use Rust.").unwrap();
        fs::write(
            dir.path().join("app.py"),
            r#"system_prompt = """You are a helpful AI assistant."""
"#,
        )
        .unwrap();

        let results = scan_directory(dir.path()).unwrap();
        assert_eq!(results.len(), 2);
        // File-level should come first (higher confidence)
        assert_eq!(results[0].source_type, "cursorrules");
        assert_eq!(results[1].source_type, "code-python");
    }

    #[test]
    fn test_derive_title_heading() {
        assert_eq!(derive_title("foo.md", "# My Great Prompt\nstuff"), "My Great Prompt");
    }

    #[test]
    fn test_derive_title_fallback() {
        assert_eq!(derive_title("my-cool-prompt.md", "No heading here."), "my cool prompt");
    }
}
