use std::collections::{HashMap, HashSet};
use std::path::Path;

use crate::error::AppError;
use crate::frontmatter::parse_prompt_file;
use crate::template::{extract_include_paths, extract_variable_names};
use crate::types::{LintResult, LintSeverity, PromptType, RepoConfig, VariableDefinition};

/// Look up the configured severity for a lint rule, defaulting to Warning.
fn severity(rule: &str, config: &RepoConfig) -> LintSeverity {
    config
        .lint_rules
        .get(rule)
        .cloned()
        .unwrap_or(LintSeverity::Warning)
}

/// Find the 1-based line number where `{{var_name}}` first appears in body.
fn find_variable_line(body: &str, var_name: &str) -> usize {
    let pattern = format!("{{{{{}}}}}", var_name);
    for (i, line) in body.lines().enumerate() {
        if line.contains(&pattern) {
            return i + 1;
        }
    }
    1
}

/// Find the 1-based line number where `{{include:path}}` first appears in body.
fn find_include_line(body: &str, inc_path: &str) -> usize {
    let pattern = format!("{{{{include:{}}}}}", inc_path);
    for (i, line) in body.lines().enumerate() {
        if line.contains(&pattern) {
            return i + 1;
        }
    }
    1
}

/// Recursively check for circular includes and excessive nesting depth.
fn check_circular_includes(
    include_paths: &[String],
    repo_root: &Path,
    visited: &HashSet<String>,
    results: &mut Vec<LintResult>,
    config: &RepoConfig,
    depth: usize,
) {
    if depth > 10 {
        results.push(LintResult {
            rule: "include-depth".to_string(),
            severity: severity("include-depth", config),
            message: "Fragment nesting exceeds maximum depth of 10".to_string(),
            line: None,
            column: None,
        });
        return;
    }

    for path in include_paths {
        if visited.contains(path) {
            results.push(LintResult {
                rule: "circular-include".to_string(),
                severity: severity("circular-include", config),
                message: format!("Circular include detected: {}", path),
                line: None,
                column: None,
            });
            continue;
        }

        let full_path = repo_root.join(format!("{}.md", path));
        if let Ok(content) = std::fs::read_to_string(&full_path) {
            let parsed = parse_prompt_file(&format!("{}.md", path), &content);
            let child_includes = extract_include_paths(&parsed.body);
            if !child_includes.is_empty() {
                let mut new_visited = visited.clone();
                new_visited.insert(path.clone());
                check_circular_includes(
                    &child_includes,
                    repo_root,
                    &new_visited,
                    results,
                    config,
                    depth + 1,
                );
            }
        }
    }
}

/// Check for variables declared in both parent and included fragments with different defaults.
fn check_duplicate_variables(
    include_paths: &[String],
    parent_vars: &[VariableDefinition],
    repo_root: &Path,
    results: &mut Vec<LintResult>,
    config: &RepoConfig,
) {
    let mut var_defaults: HashMap<String, Vec<String>> = HashMap::new();

    for v in parent_vars {
        var_defaults
            .entry(v.name.clone())
            .or_default()
            .push(v.default.clone().unwrap_or_else(|| "<none>".to_string()));
    }

    for inc_path in include_paths {
        let full_path = repo_root.join(format!("{}.md", inc_path));
        if let Ok(content) = std::fs::read_to_string(&full_path) {
            let parsed = parse_prompt_file(&format!("{}.md", inc_path), &content);
            for v in &parsed.frontmatter.variables {
                let default_val = v.default.clone().unwrap_or_else(|| "<none>".to_string());
                let entry = var_defaults.entry(v.name.clone()).or_default();
                if !entry.contains(&default_val) {
                    entry.push(default_val);
                }
            }
        }
    }

    for (name, defaults) in &var_defaults {
        if defaults.len() > 1 {
            results.push(LintResult {
                rule: "duplicate-variable".to_string(),
                severity: severity("duplicate-variable", config),
                message: format!(
                    "Variable \"{}\" is declared in multiple fragments with different defaults",
                    name
                ),
                line: None,
                column: None,
            });
        }
    }
}

/// Lint a single prompt file, checking all structural and variable rules.
pub fn lint_prompt(
    file_path: &str,
    content: &str,
    repo_root: &Path,
    config: &RepoConfig,
) -> Result<Vec<LintResult>, AppError> {
    let mut results = Vec::new();
    let parsed = parse_prompt_file(file_path, content);
    let frontmatter = &parsed.frontmatter;
    let body = &parsed.body;

    // missing-title
    if frontmatter.title.trim().is_empty() {
        results.push(LintResult {
            rule: "missing-title".to_string(),
            severity: severity("missing-title", config),
            message: "Prompt file has no title in frontmatter".to_string(),
            line: Some(1),
            column: None,
        });
    }

    // empty-body
    if body.trim().is_empty() {
        results.push(LintResult {
            rule: "empty-body".to_string(),
            severity: severity("empty-body", config),
            message: "Prompt has frontmatter but no body content".to_string(),
            line: None,
            column: None,
        });
    }

    // Variable analysis
    let declared_var_names: HashSet<String> =
        frontmatter.variables.iter().map(|v| v.name.clone()).collect();
    let used_var_names = extract_variable_names(body);
    let used_var_set: HashSet<String> = used_var_names.iter().cloned().collect();

    // unresolved-variable
    for name in &used_var_names {
        if !declared_var_names.contains(name) {
            let line = find_variable_line(body, name);
            results.push(LintResult {
                rule: "unresolved-variable".to_string(),
                severity: severity("unresolved-variable", config),
                message: format!(
                    "Variable \"{{{{{}}}}}\" is used but not declared in frontmatter",
                    name
                ),
                line: Some(line),
                column: None,
            });
        }
    }

    // unused-variable
    for v in &frontmatter.variables {
        if !used_var_set.contains(&v.name) {
            results.push(LintResult {
                rule: "unused-variable".to_string(),
                severity: severity("unused-variable", config),
                message: format!(
                    "Variable \"{}\" is declared but never referenced in body",
                    v.name
                ),
                line: None,
                column: None,
            });
        }
    }

    // missing-description
    for v in &frontmatter.variables {
        if v.description.is_none() {
            results.push(LintResult {
                rule: "missing-description".to_string(),
                severity: severity("missing-description", config),
                message: format!("Variable \"{}\" has no description", v.name),
                line: None,
                column: None,
            });
        }
    }

    // Include analysis
    let include_paths = extract_include_paths(body);

    // broken-include
    for inc_path in &include_paths {
        let full_path = repo_root.join(format!("{}.md", inc_path));
        if !full_path.exists() {
            let line = find_include_line(body, inc_path);
            results.push(LintResult {
                rule: "broken-include".to_string(),
                severity: severity("broken-include", config),
                message: format!(
                    "Include \"{{{{include:{}}}}}\" references a file that doesn't exist",
                    inc_path
                ),
                line: Some(line),
                column: None,
            });
        }
    }

    // circular-include
    let file_stem = file_path.trim_end_matches(".md");
    let mut initial_visited = HashSet::new();
    initial_visited.insert(file_stem.to_string());
    check_circular_includes(
        &include_paths,
        repo_root,
        &initial_visited,
        &mut results,
        config,
        0,
    );

    // duplicate-variable
    if !include_paths.is_empty() {
        check_duplicate_variables(
            &include_paths,
            &frontmatter.variables,
            repo_root,
            &mut results,
            config,
        );
    }

    Ok(results)
}

/// Lint all prompt files in a repository, including cross-file checks like orphaned fragments.
pub fn lint_all(
    files: &[(String, String)],
    repo_root: &Path,
    config: &RepoConfig,
) -> Result<HashMap<String, Vec<LintResult>>, AppError> {
    let mut results: HashMap<String, Vec<LintResult>> = HashMap::new();

    // Collect all includes across all files for orphaned-fragment detection
    let mut all_includes: HashSet<String> = HashSet::new();

    for (path, content) in files {
        let parsed = parse_prompt_file(path, content);
        let includes = extract_include_paths(&parsed.body);
        for inc in includes {
            all_includes.insert(inc);
        }
    }

    for (path, content) in files {
        let mut file_results = lint_prompt(path, content, repo_root, config)?;

        // orphaned-fragment check
        let path_without_ext = path.trim_end_matches(".md");
        let parsed = parse_prompt_file(path, content);
        if matches!(parsed.frontmatter.prompt_type, PromptType::Fragment)
            && !all_includes.contains(path_without_ext)
        {
            file_results.push(LintResult {
                rule: "orphaned-fragment".to_string(),
                severity: severity("orphaned-fragment", config),
                message: format!("Fragment \"{}\" is not included by any prompt", path),
                line: None,
                column: None,
            });
        }

        if !file_results.is_empty() {
            results.insert(path.clone(), file_results);
        }
    }

    Ok(results)
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::fs;
    use tempfile::TempDir;

    fn default_config() -> RepoConfig {
        RepoConfig::default()
    }

    #[test]
    fn test_missing_title_produces_warning() {
        let content = "---\ntitle: \"\"\n---\nSome body";
        let results = lint_prompt("test.md", content, Path::new("/tmp"), &default_config()).unwrap();
        let rule = results.iter().find(|r| r.rule == "missing-title");
        assert!(rule.is_some());
        assert!(matches!(rule.unwrap().severity, LintSeverity::Warning));
    }

    #[test]
    fn test_empty_body_produces_warning() {
        let content = "---\ntitle: Test\n---\n  \n";
        let results = lint_prompt("test.md", content, Path::new("/tmp"), &default_config()).unwrap();
        let rule = results.iter().find(|r| r.rule == "empty-body");
        assert!(rule.is_some());
        assert!(matches!(rule.unwrap().severity, LintSeverity::Warning));
    }

    #[test]
    fn test_unresolved_variable_produces_error() {
        let content = "---\ntitle: Test\n---\nHello {{name}}";
        let results = lint_prompt("test.md", content, Path::new("/tmp"), &default_config()).unwrap();
        let rule = results.iter().find(|r| r.rule == "unresolved-variable");
        assert!(rule.is_some());
        assert!(matches!(rule.unwrap().severity, LintSeverity::Error));
        assert!(rule.unwrap().message.contains("name"));
    }

    #[test]
    fn test_unused_variable_produces_warning() {
        let content = "---\ntitle: Test\nvariables:\n  - name: unused_var\n---\nNo vars here";
        let results = lint_prompt("test.md", content, Path::new("/tmp"), &default_config()).unwrap();
        let rule = results.iter().find(|r| r.rule == "unused-variable");
        assert!(rule.is_some());
        assert!(matches!(rule.unwrap().severity, LintSeverity::Warning));
    }

    #[test]
    fn test_missing_description_produces_info() {
        let content =
            "---\ntitle: Test\nvariables:\n  - name: topic\n---\nAbout {{topic}}";
        let results = lint_prompt("test.md", content, Path::new("/tmp"), &default_config()).unwrap();
        let rule = results.iter().find(|r| r.rule == "missing-description");
        assert!(rule.is_some());
        assert!(matches!(rule.unwrap().severity, LintSeverity::Info));
    }

    #[test]
    fn test_broken_include_produces_error() {
        let tmp = TempDir::new().unwrap();
        let content = "---\ntitle: Test\n---\n{{include:nonexistent}}";
        let results = lint_prompt("test.md", content, tmp.path(), &default_config()).unwrap();
        let rule = results.iter().find(|r| r.rule == "broken-include");
        assert!(rule.is_some());
        assert!(matches!(rule.unwrap().severity, LintSeverity::Error));
    }

    #[test]
    fn test_circular_include_detected() {
        let tmp = TempDir::new().unwrap();

        // Create a.md that includes b
        let a_content = "---\ntitle: A\ntype: fragment\n---\n{{include:b}}";
        fs::write(tmp.path().join("a.md"), a_content).unwrap();

        // Create b.md that includes a
        let b_content = "---\ntitle: B\ntype: fragment\n---\n{{include:a}}";
        fs::write(tmp.path().join("b.md"), b_content).unwrap();

        // Lint a.md - should detect circular include
        let results = lint_prompt("a.md", a_content, tmp.path(), &default_config()).unwrap();
        let rule = results.iter().find(|r| r.rule == "circular-include");
        assert!(rule.is_some(), "Expected circular-include lint result");
    }

    #[test]
    fn test_orphaned_fragment_in_lint_all() {
        let tmp = TempDir::new().unwrap();

        let prompt_content = "---\ntitle: Main\ntype: prompt\n---\nHello world";
        let fragment_content = "---\ntitle: Orphan\ntype: fragment\n---\nOrphan body";

        let files = vec![
            ("main.md".to_string(), prompt_content.to_string()),
            ("orphan.md".to_string(), fragment_content.to_string()),
        ];

        let results = lint_all(&files, tmp.path(), &default_config()).unwrap();
        let orphan_results = results.get("orphan.md").expect("Should have results for orphan.md");
        let rule = orphan_results
            .iter()
            .find(|r| r.rule == "orphaned-fragment");
        assert!(rule.is_some(), "Expected orphaned-fragment lint result");
    }

    #[test]
    fn test_no_orphan_when_included() {
        let tmp = TempDir::new().unwrap();

        let fragment_content = "---\ntitle: Header\ntype: fragment\n---\n# Header";
        fs::write(tmp.path().join("header.md"), fragment_content).unwrap();

        let prompt_content = "---\ntitle: Main\ntype: prompt\n---\n{{include:header}}\nBody";

        let files = vec![
            ("main.md".to_string(), prompt_content.to_string()),
            ("header.md".to_string(), fragment_content.to_string()),
        ];

        let results = lint_all(&files, tmp.path(), &default_config()).unwrap();
        if let Some(header_results) = results.get("header.md") {
            let orphan = header_results
                .iter()
                .find(|r| r.rule == "orphaned-fragment");
            assert!(orphan.is_none(), "Fragment should not be orphaned when included");
        }
    }

    #[test]
    fn test_find_variable_line() {
        let body = "Line one\nHello {{name}}\nLine three";
        assert_eq!(find_variable_line(body, "name"), 2);
    }

    #[test]
    fn test_find_include_line() {
        let body = "First\n{{include:header}}\nThird";
        assert_eq!(find_include_line(body, "header"), 2);
    }

    #[test]
    fn test_duplicate_variable_detection() {
        let tmp = TempDir::new().unwrap();

        // Fragment declares topic with default "AI"
        let frag_content =
            "---\ntitle: Frag\ntype: fragment\nvariables:\n  - name: topic\n    default: AI\n---\nAbout {{topic}}";
        fs::write(tmp.path().join("frag.md"), frag_content).unwrap();

        // Parent declares topic with default "Science"
        let content =
            "---\ntitle: Test\nvariables:\n  - name: topic\n    default: Science\n---\n{{topic}} {{include:frag}}";
        let results = lint_prompt("test.md", content, tmp.path(), &default_config()).unwrap();
        let rule = results.iter().find(|r| r.rule == "duplicate-variable");
        assert!(rule.is_some(), "Expected duplicate-variable lint result");
    }

    #[test]
    fn test_clean_prompt_no_issues() {
        let tmp = TempDir::new().unwrap();
        let content = "---\ntitle: Clean Prompt\nvariables:\n  - name: topic\n    description: The topic\n---\nTell me about {{topic}}";
        let results = lint_prompt("test.md", content, tmp.path(), &default_config()).unwrap();
        // Should only have no errors (may have no results at all for a clean prompt)
        let errors: Vec<_> = results
            .iter()
            .filter(|r| matches!(r.severity, LintSeverity::Error))
            .collect();
        assert!(errors.is_empty(), "Clean prompt should have no errors");
    }

    // ---- New tests below ----

    #[test]
    fn test_clean_prompt_with_description_no_issues() {
        let tmp = TempDir::new().unwrap();
        let content = "---\ntitle: Clean\nvariables:\n  - name: x\n    description: A var\n    default: val\n---\nUse {{x}}";
        let results = lint_prompt("test.md", content, tmp.path(), &default_config()).unwrap();
        assert!(results.is_empty(), "Fully clean prompt should produce zero lint issues, got: {:?}", results);
    }

    #[test]
    fn test_multiple_unresolved_variables() {
        let content = "---\ntitle: Test\n---\n{{a}} and {{b}}";
        let results = lint_prompt("test.md", content, Path::new("/tmp"), &default_config()).unwrap();
        let unresolved: Vec<_> = results.iter().filter(|r| r.rule == "unresolved-variable").collect();
        assert_eq!(unresolved.len(), 2, "Expected 2 unresolved variables, got {}", unresolved.len());
        let msgs: Vec<&str> = unresolved.iter().map(|r| r.message.as_str()).collect();
        assert!(msgs.iter().any(|m| m.contains("a")));
        assert!(msgs.iter().any(|m| m.contains("b")));
    }

    #[test]
    fn test_all_rules_fire_at_once() {
        let tmp = TempDir::new().unwrap();
        // missing-title (empty title), empty-body (whitespace only... no wait, we need unresolved var too)
        // Actually: no title + body with unresolved var works. empty-body needs no body.
        // We can't have both empty-body and unresolved-variable simultaneously (no body = no vars).
        // So: missing-title + unresolved-variable (body has undeclared var)
        let content = "---\ntitle: \"\"\n---\nHello {{mystery}}";
        let results = lint_prompt("test.md", content, tmp.path(), &default_config()).unwrap();
        let rules: Vec<&str> = results.iter().map(|r| r.rule.as_str()).collect();
        assert!(rules.contains(&"missing-title"), "missing-title not found in {:?}", rules);
        assert!(rules.contains(&"unresolved-variable"), "unresolved-variable not found in {:?}", rules);
    }

    #[test]
    fn test_broken_include_correct_line_number() {
        let tmp = TempDir::new().unwrap();
        let content = "---\ntitle: Test\n---\nLine one\nLine two\n{{include:missing}}";
        let results = lint_prompt("test.md", content, tmp.path(), &default_config()).unwrap();
        let broken = results.iter().find(|r| r.rule == "broken-include").unwrap();
        assert_eq!(broken.line, Some(3), "Include is on body line 3, got {:?}", broken.line);
    }

    #[test]
    fn test_deep_circular_include_3_level_cycle() {
        let tmp = TempDir::new().unwrap();
        let a = "---\ntitle: A\ntype: fragment\n---\n{{include:b}}";
        let b = "---\ntitle: B\ntype: fragment\n---\n{{include:c}}";
        let c = "---\ntitle: C\ntype: fragment\n---\n{{include:a}}";
        fs::write(tmp.path().join("a.md"), a).unwrap();
        fs::write(tmp.path().join("b.md"), b).unwrap();
        fs::write(tmp.path().join("c.md"), c).unwrap();

        let results = lint_prompt("a.md", a, tmp.path(), &default_config()).unwrap();
        let circular = results.iter().find(|r| r.rule == "circular-include");
        assert!(circular.is_some(), "Expected circular-include for 3-level cycle a->b->c->a");
    }

    #[test]
    fn test_lint_all_no_fragments_no_orphan() {
        let tmp = TempDir::new().unwrap();
        let p1 = "---\ntitle: P1\ntype: prompt\n---\nBody one";
        let p2 = "---\ntitle: P2\ntype: prompt\n---\nBody two";
        let files = vec![
            ("p1.md".to_string(), p1.to_string()),
            ("p2.md".to_string(), p2.to_string()),
        ];
        let results = lint_all(&files, tmp.path(), &default_config()).unwrap();
        for (_path, issues) in &results {
            assert!(!issues.iter().any(|r| r.rule == "orphaned-fragment"),
                "No fragments exist, so no orphaned-fragment should fire");
        }
    }

    #[test]
    fn test_lint_all_used_fragment_not_orphaned() {
        let tmp = TempDir::new().unwrap();
        let frag = "---\ntitle: F\ntype: fragment\n---\nFragment body";
        fs::write(tmp.path().join("frag.md"), frag).unwrap();
        let prompt = "---\ntitle: P\ntype: prompt\n---\n{{include:frag}}";
        let files = vec![
            ("prompt.md".to_string(), prompt.to_string()),
            ("frag.md".to_string(), frag.to_string()),
        ];
        let results = lint_all(&files, tmp.path(), &default_config()).unwrap();
        if let Some(frag_issues) = results.get("frag.md") {
            assert!(!frag_issues.iter().any(|r| r.rule == "orphaned-fragment"),
                "Included fragment should not be orphaned");
        }
    }

    #[test]
    fn test_lint_all_multiple_orphans() {
        let tmp = TempDir::new().unwrap();
        let f1 = "---\ntitle: F1\ntype: fragment\n---\nBody 1";
        let f2 = "---\ntitle: F2\ntype: fragment\n---\nBody 2";
        let prompt = "---\ntitle: P\ntype: prompt\n---\nNo includes";
        let files = vec![
            ("prompt.md".to_string(), prompt.to_string()),
            ("f1.md".to_string(), f1.to_string()),
            ("f2.md".to_string(), f2.to_string()),
        ];
        let results = lint_all(&files, tmp.path(), &default_config()).unwrap();
        let orphan_count = results.values()
            .flat_map(|v| v.iter())
            .filter(|r| r.rule == "orphaned-fragment")
            .count();
        assert_eq!(orphan_count, 2, "Expected 2 orphaned fragments, got {}", orphan_count);
    }

    #[test]
    fn test_variable_with_empty_description_no_missing_description() {
        let content = "---\ntitle: Test\nvariables:\n  - name: x\n    description: \"\"\n---\n{{x}}";
        let results = lint_prompt("test.md", content, Path::new("/tmp"), &default_config()).unwrap();
        let missing_desc = results.iter().find(|r| r.rule == "missing-description");
        assert!(missing_desc.is_none(),
            "Empty string description should count as having a description");
    }

    #[test]
    fn test_custom_severity_override() {
        let mut config = default_config();
        config.lint_rules.insert("missing-title".to_string(), LintSeverity::Error);
        let content = "---\ntitle: \"\"\n---\nBody";
        let results = lint_prompt("test.md", content, Path::new("/tmp"), &config).unwrap();
        let rule = results.iter().find(|r| r.rule == "missing-title").unwrap();
        assert!(matches!(rule.severity, LintSeverity::Error),
            "Expected Error severity after override, got {:?}", rule.severity);
    }

    #[test]
    fn test_include_exists_but_broken_yaml_not_broken_include() {
        let tmp = TempDir::new().unwrap();
        // Fragment file exists but has invalid YAML frontmatter
        let bad_frag = "---\ntitle: [broken\n---\nSome body";
        fs::write(tmp.path().join("badfrag.md"), bad_frag).unwrap();

        let content = "---\ntitle: Test\n---\n{{include:badfrag}}";
        let results = lint_prompt("test.md", content, tmp.path(), &default_config()).unwrap();
        let broken = results.iter().find(|r| r.rule == "broken-include");
        assert!(broken.is_none(),
            "File exists (even with bad YAML), so broken-include should NOT fire");
    }
}
