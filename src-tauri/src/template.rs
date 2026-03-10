use std::collections::{HashMap, HashSet};
use std::path::{Path, PathBuf};
use std::sync::LazyLock;

use regex::Regex;

use crate::error::AppError;

static INCLUDE_RE: LazyLock<Regex> = LazyLock::new(|| {
    Regex::new(r"\{\{include:([^}]+)\}\}").unwrap()
});

static VARIABLE_RE: LazyLock<Regex> = LazyLock::new(|| {
    Regex::new(r"\{\{([^}:]+)\}\}").unwrap()
});
use crate::frontmatter::parse_prompt_file;
use crate::types::{ResolvedPrompt, VariableDefinition};

struct ResolveContext {
    repo_root: PathBuf,
    visited_paths: HashSet<String>,
    all_variables: Vec<VariableDefinition>,
    included_fragments: Vec<String>,
    depth: usize,
    max_depth: usize,
}

/// Resolve a prompt template: process `{{include:path}}` directives recursively
/// and substitute `{{variable}}` placeholders.
pub fn resolve_template(
    file_path: &str,
    content: &str,
    repo_root: &Path,
    variables: Option<&HashMap<String, String>>,
) -> Result<ResolvedPrompt, AppError> {
    let parsed = parse_prompt_file(file_path, content);

    let mut ctx = ResolveContext {
        repo_root: repo_root.to_path_buf(),
        visited_paths: HashSet::new(),
        all_variables: parsed.frontmatter.variables.clone(),
        included_fragments: Vec::new(),
        depth: 0,
        max_depth: 10,
    };

    let with_includes = resolve_includes(&parsed.body, &mut ctx)?;

    let provided = variables.cloned().unwrap_or_default();
    let (text, unresolved) = substitute_variables(&with_includes, &provided, &ctx.all_variables);

    Ok(ResolvedPrompt {
        text: text.trim().to_string(),
        variables: provided,
        unresolved_variables: unresolved,
        included_fragments: ctx.included_fragments,
    })
}

/// Recursively resolve `{{include:path}}` directives in the text.
fn resolve_includes(text: &str, ctx: &mut ResolveContext) -> Result<String, AppError> {
    if ctx.depth >= ctx.max_depth {
        return Err(AppError::Custom(format!(
            "Include depth exceeded maximum of {}",
            ctx.max_depth
        )));
    }

    // Collect matches first to avoid borrow issues
    let matches: Vec<(String, String)> = INCLUDE_RE
        .captures_iter(text)
        .map(|cap| (cap[0].to_string(), cap[1].trim().to_string()))
        .collect();

    if matches.is_empty() {
        return Ok(text.to_string());
    }

    let mut result = text.to_string();

    for (full_match, fragment_path) in matches {
        if ctx.visited_paths.contains(&fragment_path) {
            let chain: Vec<&str> = ctx.visited_paths.iter().map(|s| s.as_str()).collect();
            return Err(AppError::Custom(format!(
                "Circular include detected: {} (chain: {} -> {})",
                fragment_path,
                chain.join(" -> "),
                fragment_path
            )));
        }

        ctx.included_fragments.push(fragment_path.clone());

        // Read and parse the fragment file
        let full_path = ctx.repo_root.join(format!("{}.md", fragment_path));
        let fragment_content = std::fs::read_to_string(&full_path).map_err(|e| {
            AppError::Custom(format!(
                "Failed to read fragment '{}': {}",
                full_path.display(),
                e
            ))
        })?;
        let parsed = parse_prompt_file(
            &format!("{}.md", fragment_path),
            &fragment_content,
        );

        // Collect fragment's variable definitions
        ctx.all_variables.extend(parsed.frontmatter.variables);

        // Create child visited set (clone + add current path)
        let mut child_visited = ctx.visited_paths.clone();
        child_visited.insert(fragment_path.clone());

        let parent_visited = std::mem::replace(&mut ctx.visited_paths, child_visited);
        let parent_depth = ctx.depth;
        ctx.depth += 1;

        let resolved_fragment = resolve_includes(&parsed.body, ctx);

        // Restore parent state
        ctx.visited_paths = parent_visited;
        ctx.depth = parent_depth;

        let resolved_fragment = resolved_fragment?;
        result = result.replacen(&full_match, resolved_fragment.trim(), 1);
    }

    Ok(result)
}

/// Substitute `{{variable}}` placeholders with provided values or defaults.
/// Returns the result text and a list of unresolved variable names.
fn substitute_variables(
    text: &str,
    variables: &HashMap<String, String>,
    all_defs: &[VariableDefinition],
) -> (String, Vec<String>) {
    let mut defaults_map: HashMap<&str, &str> = HashMap::new();
    for def in all_defs {
        if let Some(ref default) = def.default {
            defaults_map.insert(&def.name, default.as_str());
        }
    }

    let mut unresolved: Vec<String> = Vec::new();

    let result = VARIABLE_RE.replace_all(text, |caps: &regex::Captures| {
        let name = caps[1].trim();
        if name.starts_with("include:") {
            return caps[0].to_string();
        }
        if let Some(val) = variables.get(name) {
            return val.clone();
        }
        if let Some(default) = defaults_map.get(name) {
            return (*default).to_string();
        }
        unresolved.push(name.to_string());
        caps[0].to_string()
    });

    // Deduplicate unresolved
    let mut seen = HashSet::new();
    unresolved.retain(|n| seen.insert(n.clone()));

    (result.into_owned(), unresolved)
}

/// Extract all `{{variable}}` names from body text, excluding `{{include:...}}` patterns.
/// Returns unique names.
pub fn extract_variable_names(body: &str) -> Vec<String> {
    let mut seen = HashSet::new();
    let mut names = Vec::new();

    for cap in VARIABLE_RE.captures_iter(body) {
        let name = cap[1].trim().to_string();
        if !name.starts_with("include:") && seen.insert(name.clone()) {
            names.push(name);
        }
    }

    names
}

/// Extract all `{{include:path}}` paths from body text.
/// Returns unique paths.
pub fn extract_include_paths(body: &str) -> Vec<String> {
    let mut seen = HashSet::new();
    let mut paths = Vec::new();

    for cap in INCLUDE_RE.captures_iter(body) {
        let path = cap[1].trim().to_string();
        if seen.insert(path.clone()) {
            paths.push(path);
        }
    }

    paths
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::fs;
    use tempfile::TempDir;

    #[test]
    fn test_substitute_with_provided_values() {
        let mut vars = HashMap::new();
        vars.insert("name".to_string(), "Alice".to_string());
        vars.insert("greeting".to_string(), "Hello".to_string());

        let (result, unresolved) =
            substitute_variables("{{greeting}}, {{name}}!", &vars, &[]);
        assert_eq!(result, "Hello, Alice!");
        assert!(unresolved.is_empty());
    }

    #[test]
    fn test_substitute_with_defaults() {
        let defs = vec![VariableDefinition {
            name: "lang".to_string(),
            description: None,
            default: Some("Rust".to_string()),
            enum_values: None,
        }];
        let (result, unresolved) =
            substitute_variables("Language: {{lang}}", &HashMap::new(), &defs);
        assert_eq!(result, "Language: Rust");
        assert!(unresolved.is_empty());
    }

    #[test]
    fn test_provided_overrides_default() {
        let defs = vec![VariableDefinition {
            name: "lang".to_string(),
            description: None,
            default: Some("Rust".to_string()),
            enum_values: None,
        }];
        let mut vars = HashMap::new();
        vars.insert("lang".to_string(), "Go".to_string());

        let (result, _) = substitute_variables("Language: {{lang}}", &vars, &defs);
        assert_eq!(result, "Language: Go");
    }

    #[test]
    fn test_unresolved_variable_tracking() {
        let (result, unresolved) =
            substitute_variables("Hello {{name}} and {{other}}", &HashMap::new(), &[]);
        assert_eq!(result, "Hello {{name}} and {{other}}");
        assert_eq!(unresolved, vec!["name", "other"]);
    }

    #[test]
    fn test_unresolved_deduplication() {
        let (_, unresolved) =
            substitute_variables("{{x}} and {{x}} again", &HashMap::new(), &[]);
        assert_eq!(unresolved, vec!["x"]);
    }

    #[test]
    fn test_include_patterns_not_substituted() {
        let (result, unresolved) =
            substitute_variables("{{include:header}} {{name}}", &HashMap::new(), &[]);
        // The variable regex `[^}:]` won't match `include:header` because of the colon
        // so it remains as-is and doesn't appear in unresolved
        assert!(result.contains("{{name}}"));
        assert_eq!(unresolved, vec!["name"]);
    }

    fn create_fragment(dir: &Path, path: &str, body: &str) {
        let full = dir.join(format!("{}.md", path));
        if let Some(parent) = full.parent() {
            fs::create_dir_all(parent).unwrap();
        }
        let content = format!("---\ntitle: Fragment\ntype: fragment\n---\n{}", body);
        fs::write(full, content).unwrap();
    }

    #[test]
    fn test_include_resolution() {
        let tmp = TempDir::new().unwrap();
        create_fragment(tmp.path(), "fragments/header", "# Welcome");

        let content = "---\ntitle: Test\n---\n{{include:fragments/header}}\nBody";
        let result = resolve_template("test.md", content, tmp.path(), None).unwrap();
        assert!(result.text.contains("# Welcome"));
        assert!(result.text.contains("Body"));
        assert_eq!(result.included_fragments, vec!["fragments/header"]);
    }

    #[test]
    fn test_nested_include_resolution() {
        let tmp = TempDir::new().unwrap();
        create_fragment(tmp.path(), "fragments/inner", "Inner content");
        create_fragment(
            tmp.path(),
            "fragments/outer",
            "Outer: {{include:fragments/inner}}",
        );

        let content = "---\ntitle: Test\n---\n{{include:fragments/outer}}";
        let result = resolve_template("test.md", content, tmp.path(), None).unwrap();
        assert!(result.text.contains("Inner content"));
        assert!(result.text.contains("Outer:"));
        assert_eq!(
            result.included_fragments,
            vec!["fragments/outer", "fragments/inner"]
        );
    }

    #[test]
    fn test_circular_include_detection() {
        let tmp = TempDir::new().unwrap();
        create_fragment(tmp.path(), "a", "{{include:b}}");
        create_fragment(tmp.path(), "b", "{{include:a}}");

        let content = "---\ntitle: Test\n---\n{{include:a}}";
        let result = resolve_template("test.md", content, tmp.path(), None);
        assert!(result.is_err());
        let err = result.unwrap_err().to_string();
        assert!(err.contains("Circular include"));
    }

    #[test]
    fn test_max_depth_enforcement() {
        let tmp = TempDir::new().unwrap();
        // Create a chain: d0 -> d1 -> d2 -> ... -> d11
        for i in 0..12 {
            let body = if i < 11 {
                format!("{{{{include:d{}}}}}", i + 1)
            } else {
                "leaf".to_string()
            };
            create_fragment(tmp.path(), &format!("d{}", i), &body);
        }

        let content = "---\ntitle: Test\n---\n{{include:d0}}";
        let result = resolve_template("test.md", content, tmp.path(), None);
        assert!(result.is_err());
        let err = result.unwrap_err().to_string();
        assert!(err.contains("Include depth exceeded"));
    }

    #[test]
    fn test_same_fragment_in_different_branches() {
        let tmp = TempDir::new().unwrap();
        create_fragment(tmp.path(), "shared", "Shared content");
        create_fragment(tmp.path(), "a", "A: {{include:shared}}");
        create_fragment(tmp.path(), "b", "B: {{include:shared}}");

        let content = "---\ntitle: Test\n---\n{{include:a}}\n{{include:b}}";
        let result = resolve_template("test.md", content, tmp.path(), None).unwrap();
        // "shared" appears twice in included_fragments (once per branch)
        assert_eq!(
            result
                .included_fragments
                .iter()
                .filter(|f| *f == "shared")
                .count(),
            2
        );
        assert!(result.text.contains("A: Shared content"));
        assert!(result.text.contains("B: Shared content"));
    }

    #[test]
    fn test_fragment_variables_collected() {
        let tmp = TempDir::new().unwrap();
        let frag_content =
            "---\ntitle: Frag\ntype: fragment\nvariables:\n  - name: fragvar\n    default: fval\n---\nHello {{fragvar}}";
        let full = tmp.path().join("frag.md");
        fs::write(&full, frag_content).unwrap();

        let content = "---\ntitle: Test\n---\n{{include:frag}}";
        let result = resolve_template("test.md", content, tmp.path(), None).unwrap();
        // fragvar should be resolved using its default
        assert!(result.text.contains("Hello fval"));
        assert!(result.unresolved_variables.is_empty());
    }

    #[test]
    fn test_extract_variable_names() {
        let body = "{{greeting}} to {{name}}! Also {{greeting}} again. Not {{include:x}}.";
        let names = extract_variable_names(body);
        assert_eq!(names, vec!["greeting", "name"]);
    }

    #[test]
    fn test_extract_variable_names_empty() {
        let names = extract_variable_names("No variables here");
        assert!(names.is_empty());
    }

    #[test]
    fn test_extract_include_paths() {
        let body = "{{include:header}} and {{include:footer}} and {{include:header}} and {{name}}";
        let paths = extract_include_paths(body);
        assert_eq!(paths, vec!["header", "footer"]);
    }

    #[test]
    fn test_extract_include_paths_empty() {
        let paths = extract_include_paths("No includes here {{var}}");
        assert!(paths.is_empty());
    }

    #[test]
    fn test_full_resolve_with_variables() {
        let tmp = TempDir::new().unwrap();
        create_fragment(tmp.path(), "fragments/sig", "Best, {{author}}");

        let content =
            "---\ntitle: Email\nvariables:\n  - name: subject\n    default: Hello\n---\nSubject: {{subject}}\n{{include:fragments/sig}}";

        let mut vars = HashMap::new();
        vars.insert("author".to_string(), "Alice".to_string());

        let result =
            resolve_template("email.md", content, tmp.path(), Some(&vars)).unwrap();
        assert!(result.text.contains("Subject: Hello"));
        assert!(result.text.contains("Best, Alice"));
        assert!(result.unresolved_variables.is_empty());
    }

    // ---- New tests below ----

    #[test]
    fn test_empty_body_resolves_to_empty() {
        let tmp = TempDir::new().unwrap();
        let content = "---\ntitle: Empty\n---\n";
        let result = resolve_template("test.md", content, tmp.path(), None).unwrap();
        assert!(result.text.is_empty() || result.text.trim().is_empty());
        assert!(result.unresolved_variables.is_empty());
        assert!(result.included_fragments.is_empty());
    }

    #[test]
    fn test_multiple_same_variable_both_replaced() {
        let mut vars = HashMap::new();
        vars.insert("x".to_string(), "42".to_string());
        let (result, unresolved) = substitute_variables("{{x}} and {{x}}", &vars, &[]);
        assert_eq!(result, "42 and 42");
        assert!(unresolved.is_empty());
    }

    #[test]
    fn test_variable_with_spaces_in_name_trimmed() {
        let mut vars = HashMap::new();
        vars.insert("name".to_string(), "World".to_string());
        let (result, unresolved) = substitute_variables("Hello {{ name }}", &vars, &[]);
        assert_eq!(result, "Hello World");
        assert!(unresolved.is_empty());
    }

    #[test]
    fn test_include_nonexistent_fragment_errors() {
        let tmp = TempDir::new().unwrap();
        let content = "---\ntitle: Test\n---\n{{include:does_not_exist}}";
        let result = resolve_template("test.md", content, tmp.path(), None);
        assert!(result.is_err());
        let err_msg = result.unwrap_err().to_string();
        assert!(err_msg.contains("does_not_exist"));
    }

    #[test]
    fn test_deeply_nested_includes_5_levels() {
        let tmp = TempDir::new().unwrap();
        create_fragment(tmp.path(), "e", "leaf");
        create_fragment(tmp.path(), "d", "{{include:e}}");
        create_fragment(tmp.path(), "c", "{{include:d}}");
        create_fragment(tmp.path(), "b", "{{include:c}}");
        create_fragment(tmp.path(), "a", "{{include:b}}");

        let content = "---\ntitle: Deep\n---\n{{include:a}}";
        let result = resolve_template("test.md", content, tmp.path(), None).unwrap();
        assert_eq!(result.text, "leaf");
        assert_eq!(result.included_fragments, vec!["a", "b", "c", "d", "e"]);
    }

    #[test]
    fn test_provided_value_overrides_fragment_default() {
        let tmp = TempDir::new().unwrap();
        let frag_content =
            "---\ntitle: F\ntype: fragment\nvariables:\n  - name: color\n    default: red\n---\nColor is {{color}}";
        let full = tmp.path().join("frag.md");
        fs::write(&full, frag_content).unwrap();

        let content = "---\ntitle: Test\n---\n{{include:frag}}";
        let mut vars = HashMap::new();
        vars.insert("color".to_string(), "blue".to_string());
        let result = resolve_template("test.md", content, tmp.path(), Some(&vars)).unwrap();
        assert!(result.text.contains("Color is blue"));
    }

    #[test]
    fn test_mixed_includes_and_variables() {
        let tmp = TempDir::new().unwrap();
        create_fragment(tmp.path(), "header", "HEADER");

        let content = "---\ntitle: Mix\nvariables:\n  - name: who\n    default: you\n---\n{{include:header}} hello {{who}}";
        let result = resolve_template("test.md", content, tmp.path(), None).unwrap();
        assert!(result.text.contains("HEADER"));
        assert!(result.text.contains("hello you"));
    }

    #[test]
    fn test_empty_provided_variables_falls_back_to_defaults() {
        let content = "---\ntitle: Test\nvariables:\n  - name: lang\n    default: Rust\n---\n{{lang}}";
        let tmp = TempDir::new().unwrap();
        let empty: HashMap<String, String> = HashMap::new();
        let result = resolve_template("test.md", content, tmp.path(), Some(&empty)).unwrap();
        assert_eq!(result.text, "Rust");
    }

    #[test]
    fn test_no_variables_text_unchanged() {
        let tmp = TempDir::new().unwrap();
        let content = "---\ntitle: Plain\n---\nJust plain text, nothing special.";
        let result = resolve_template("test.md", content, tmp.path(), None).unwrap();
        assert_eq!(result.text, "Just plain text, nothing special.");
        assert!(result.unresolved_variables.is_empty());
    }

    #[test]
    fn test_include_at_start_and_end_of_body() {
        let tmp = TempDir::new().unwrap();
        create_fragment(tmp.path(), "top", "TOP");
        create_fragment(tmp.path(), "bottom", "BOTTOM");

        let content = "---\ntitle: Bookend\n---\n{{include:top}}\nmiddle\n{{include:bottom}}";
        let result = resolve_template("test.md", content, tmp.path(), None).unwrap();
        assert!(result.text.starts_with("TOP"));
        assert!(result.text.ends_with("BOTTOM"));
        assert!(result.text.contains("middle"));
        assert_eq!(result.included_fragments, vec!["top", "bottom"]);
    }
}
