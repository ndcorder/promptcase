use std::sync::LazyLock;

use chrono::Utc;
use regex::Regex;
use serde::{Deserialize, Serialize};
use uuid::Uuid;

use crate::types::{PromptFile, PromptFrontmatter, PromptType, StarredVersion, VariableDefinition};

static INCLUDE_RE: LazyLock<Regex> = LazyLock::new(|| {
    Regex::new(r"\{\{include:([^}]+)\}\}").unwrap()
});

/// Generate a random 8-hex-character ID.
pub fn generate_id() -> String {
    let uuid = Uuid::new_v4();
    uuid.simple().to_string()[..8].to_string()
}

/// Extract `{{include:path}}` references from the body text.
fn extract_includes(body: &str) -> Vec<String> {
    INCLUDE_RE.captures_iter(body)
        .map(|cap| cap[1].trim().to_string())
        .collect()
}

/// Derive the folder field from a file path: `"/" + parent_path`.
fn derive_folder(file_path: &str) -> String {
    let normalized = file_path.replace('\\', "/");
    let parts: Vec<&str> = normalized.split('/').collect();
    if parts.len() <= 1 {
        "/".to_string()
    } else {
        let parent = parts[..parts.len() - 1].join("/");
        format!("/{}", parent)
    }
}

// -- Intermediate structs for YAML (snake_case keys, all optional for lenient parsing) --

#[derive(Deserialize)]
struct RawFrontmatter {
    id: Option<String>,
    title: Option<String>,
    #[serde(rename = "type")]
    prompt_type: Option<String>,
    tags: Option<Vec<String>>,
    model_targets: Option<Vec<String>>,
    variables: Option<Vec<RawVariable>>,
    created: Option<String>,
    modified: Option<String>,
    starred_versions: Option<Vec<RawStarredVersion>>,
}

#[derive(Deserialize)]
struct RawVariable {
    name: String,
    description: Option<String>,
    default: Option<String>,
    #[serde(rename = "enum")]
    enum_values: Option<Vec<String>>,
}

#[derive(Deserialize)]
struct RawStarredVersion {
    commit: String,
    label: String,
    date: String,
}

// -- Serialization structs (snake_case keys for YAML output, skip empty optionals) --

#[derive(Serialize)]
struct SerializableFrontmatter<'a> {
    id: &'a str,
    title: &'a str,
    #[serde(rename = "type")]
    prompt_type: &'a str,
    tags: &'a Vec<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    model_targets: Option<&'a Vec<String>>,
    #[serde(skip_serializing_if = "Option::is_none")]
    variables: Option<Vec<SerializableVariable<'a>>>,
    #[serde(skip_serializing_if = "Option::is_none")]
    includes: Option<&'a Vec<String>>,
    created: &'a str,
    modified: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    starred_versions: Option<Vec<SerializableStarredVersion<'a>>>,
}

#[derive(Serialize)]
struct SerializableVariable<'a> {
    name: &'a str,
    #[serde(skip_serializing_if = "Option::is_none")]
    description: Option<&'a str>,
    #[serde(skip_serializing_if = "Option::is_none")]
    default: Option<&'a str>,
    #[serde(rename = "enum", skip_serializing_if = "Option::is_none")]
    enum_values: Option<&'a Vec<String>>,
}

#[derive(Serialize)]
struct SerializableStarredVersion<'a> {
    commit: &'a str,
    label: &'a str,
    date: &'a str,
}

/// Parse a markdown file with YAML frontmatter into a `PromptFile`.
pub fn parse_prompt_file(file_path: &str, content: &str) -> PromptFile {
    let (yaml_str, body) = split_frontmatter(content);
    let now = Utc::now().to_rfc3339_opts(chrono::SecondsFormat::Millis, true);

    let frontmatter = if let Some(yaml) = yaml_str {
        match serde_yaml::from_str::<RawFrontmatter>(&yaml) {
            Ok(raw) => build_frontmatter(raw, file_path, &body, &now),
            Err(_) => default_frontmatter(file_path, &body, &now),
        }
    } else {
        default_frontmatter(file_path, &body, &now)
    };

    PromptFile {
        path: file_path.to_string(),
        frontmatter,
        body,
        raw: content.to_string(),
    }
}

/// Split content into optional YAML frontmatter string and body.
fn split_frontmatter(content: &str) -> (Option<String>, String) {
    let trimmed = content.trim_start();
    if !trimmed.starts_with("---") {
        return (None, content.to_string());
    }

    // Find the opening delimiter
    let after_first = &trimmed[3..];
    // Skip optional newline after first ---
    let after_first = after_first.strip_prefix('\n').unwrap_or(
        after_first.strip_prefix("\r\n").unwrap_or(after_first),
    );

    // Find closing ---
    if let Some(end_idx) = find_closing_delimiter(after_first) {
        let yaml = after_first[..end_idx].to_string();
        let rest = &after_first[end_idx + 3..];
        // Strip leading newline from body
        let body = rest
            .strip_prefix('\n')
            .unwrap_or(rest.strip_prefix("\r\n").unwrap_or(rest));
        (Some(yaml), body.to_string())
    } else {
        (None, content.to_string())
    }
}

/// Find the position of the closing `---` delimiter (must be at start of a line).
fn find_closing_delimiter(s: &str) -> Option<usize> {
    // Check if it starts right at position 0
    if s.starts_with("---") {
        return Some(0);
    }
    // Search for \n---
    let mut search_from = 0;
    while let Some(pos) = s[search_from..].find("\n---") {
        let abs_pos = search_from + pos + 1; // position of first '-'
        // Verify it's exactly --- (followed by newline or EOF)
        let after = abs_pos + 3;
        if after >= s.len() || s.as_bytes()[after] == b'\n' || s.as_bytes()[after] == b'\r' {
            return Some(abs_pos);
        }
        search_from = abs_pos + 3;
    }
    None
}

fn build_frontmatter(
    raw: RawFrontmatter,
    file_path: &str,
    body: &str,
    now: &str,
) -> PromptFrontmatter {
    let prompt_type = match raw.prompt_type.as_deref() {
        Some("fragment") => PromptType::Fragment,
        _ => PromptType::Prompt,
    };

    let variables: Vec<VariableDefinition> = raw
        .variables
        .unwrap_or_default()
        .into_iter()
        .map(|v| VariableDefinition {
            name: v.name,
            description: v.description,
            default: v.default,
            enum_values: v.enum_values,
        })
        .collect();

    let starred_versions: Vec<StarredVersion> = raw
        .starred_versions
        .unwrap_or_default()
        .into_iter()
        .map(|sv| StarredVersion {
            commit: sv.commit,
            label: sv.label,
            date: sv.date,
        })
        .collect();

    let model_targets = raw.model_targets.filter(|v| !v.is_empty());

    PromptFrontmatter {
        id: raw.id.unwrap_or_else(generate_id),
        title: raw.title.unwrap_or_default(),
        prompt_type,
        tags: raw.tags.unwrap_or_default(),
        folder: derive_folder(file_path),
        model_targets,
        variables,
        includes: extract_includes(body),
        created: raw.created.unwrap_or_else(|| now.to_string()),
        modified: raw.modified.unwrap_or_else(|| now.to_string()),
        starred_versions,
    }
}

fn default_frontmatter(file_path: &str, body: &str, now: &str) -> PromptFrontmatter {
    PromptFrontmatter {
        id: generate_id(),
        title: String::new(),
        prompt_type: PromptType::Prompt,
        tags: Vec::new(),
        folder: derive_folder(file_path),
        model_targets: None,
        variables: Vec::new(),
        includes: extract_includes(body),
        created: now.to_string(),
        modified: now.to_string(),
        starred_versions: Vec::new(),
    }
}

/// Serialize a `PromptFrontmatter` and body back into a markdown string with YAML frontmatter.
/// Always updates `modified` to the current timestamp.
pub fn serialize_prompt_file(frontmatter: &PromptFrontmatter, body: &str) -> String {
    let prompt_type_str = match frontmatter.prompt_type {
        PromptType::Prompt => "prompt",
        PromptType::Fragment => "fragment",
    };

    let model_targets = frontmatter
        .model_targets
        .as_ref()
        .filter(|v| !v.is_empty());

    let variables = if frontmatter.variables.is_empty() {
        None
    } else {
        Some(
            frontmatter
                .variables
                .iter()
                .map(|v| SerializableVariable {
                    name: &v.name,
                    description: v.description.as_deref(),
                    default: v.default.as_deref(),
                    enum_values: v.enum_values.as_ref(),
                })
                .collect(),
        )
    };

    let includes = if frontmatter.includes.is_empty() {
        None
    } else {
        Some(&frontmatter.includes)
    };

    let starred_versions = if frontmatter.starred_versions.is_empty() {
        None
    } else {
        Some(
            frontmatter
                .starred_versions
                .iter()
                .map(|sv| SerializableStarredVersion {
                    commit: &sv.commit,
                    label: &sv.label,
                    date: &sv.date,
                })
                .collect(),
        )
    };

    let serializable = SerializableFrontmatter {
        id: &frontmatter.id,
        title: &frontmatter.title,
        prompt_type: prompt_type_str,
        tags: &frontmatter.tags,
        model_targets,
        variables,
        includes,
        created: &frontmatter.created,
        modified: Utc::now().to_rfc3339_opts(chrono::SecondsFormat::Millis, true),
        starred_versions,
    };

    let yaml = serde_yaml::to_string(&serializable).unwrap_or_default();
    format!("---\n{}---\n{}", yaml, body)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_generate_id() {
        let id = generate_id();
        assert_eq!(id.len(), 8);
        assert!(id.chars().all(|c| c.is_ascii_hexdigit()));
    }

    #[test]
    fn test_extract_includes() {
        let body = "Hello {{include:header.md}} world {{include: footer.md }}";
        let includes = extract_includes(body);
        assert_eq!(includes, vec!["header.md", "footer.md"]);
    }

    #[test]
    fn test_derive_folder() {
        assert_eq!(derive_folder("prompts/greetings/hello.md"), "/prompts/greetings");
        assert_eq!(derive_folder("hello.md"), "/");
        assert_eq!(derive_folder("a/b.md"), "/a");
    }

    #[test]
    fn test_parse_full() {
        let content = r#"---
id: "abc12345"
title: "My Prompt"
type: prompt
tags:
  - tag1
  - tag2
variables:
  - name: topic
    description: The topic
    default: AI
model_targets:
  - claude-sonnet-4
created: "2024-01-01T00:00:00.000Z"
modified: "2024-01-01T00:00:00.000Z"
starred_versions: []
---
Hello {{include:header.md}} world
"#;
        let result = parse_prompt_file("prompts/hello.md", content);
        assert_eq!(result.frontmatter.id, "abc12345");
        assert_eq!(result.frontmatter.title, "My Prompt");
        assert!(matches!(result.frontmatter.prompt_type, PromptType::Prompt));
        assert_eq!(result.frontmatter.tags, vec!["tag1", "tag2"]);
        assert_eq!(result.frontmatter.folder, "/prompts");
        assert_eq!(
            result.frontmatter.model_targets,
            Some(vec!["claude-sonnet-4".to_string()])
        );
        assert_eq!(result.frontmatter.variables.len(), 1);
        assert_eq!(result.frontmatter.variables[0].name, "topic");
        assert_eq!(
            result.frontmatter.variables[0].description,
            Some("The topic".to_string())
        );
        assert_eq!(
            result.frontmatter.variables[0].default,
            Some("AI".to_string())
        );
        assert_eq!(result.frontmatter.includes, vec!["header.md"]);
        assert_eq!(result.frontmatter.created, "2024-01-01T00:00:00.000Z");
        assert_eq!(result.frontmatter.starred_versions.len(), 0);
        assert!(result.body.contains("Hello"));
    }

    #[test]
    fn test_parse_minimal() {
        let content = "---\ntitle: Minimal\n---\nBody text";
        let result = parse_prompt_file("test.md", content);
        assert_eq!(result.frontmatter.title, "Minimal");
        assert_eq!(result.frontmatter.id.len(), 8); // generated
        assert!(matches!(result.frontmatter.prompt_type, PromptType::Prompt));
        assert!(result.frontmatter.tags.is_empty());
        assert_eq!(result.frontmatter.folder, "/");
        assert_eq!(result.body, "Body text");
    }

    #[test]
    fn test_parse_no_frontmatter() {
        let content = "Just some text";
        let result = parse_prompt_file("notes/readme.md", content);
        assert_eq!(result.frontmatter.title, "");
        assert_eq!(result.frontmatter.id.len(), 8);
        assert_eq!(result.frontmatter.folder, "/notes");
        assert_eq!(result.body, "Just some text");
    }

    #[test]
    fn test_parse_fragment_type() {
        let content = "---\ntype: fragment\ntitle: Header\n---\n# Header";
        let result = parse_prompt_file("fragments/header.md", content);
        assert!(matches!(result.frontmatter.prompt_type, PromptType::Fragment));
    }

    #[test]
    fn test_serialize() {
        let fm = PromptFrontmatter {
            id: "abc12345".to_string(),
            title: "Test".to_string(),
            prompt_type: PromptType::Prompt,
            tags: vec!["a".to_string()],
            folder: "/prompts".to_string(),
            model_targets: None,
            variables: Vec::new(),
            includes: Vec::new(),
            created: "2024-01-01T00:00:00.000Z".to_string(),
            modified: "2024-01-01T00:00:00.000Z".to_string(),
            starred_versions: Vec::new(),
        };
        let output = serialize_prompt_file(&fm, "Body here\n");
        assert!(output.starts_with("---\n"));
        assert!(output.contains("id: abc12345"));
        assert!(output.contains("type: prompt"));
        assert!(output.contains("Body here"));
        // model_targets, variables, includes, starred_versions should be absent
        assert!(!output.contains("model_targets"));
        assert!(!output.contains("variables"));
        assert!(!output.contains("includes"));
        assert!(!output.contains("starred_versions"));
    }

    #[test]
    fn test_roundtrip() {
        let content = r#"---
id: roundtrip
title: Round Trip
type: fragment
tags:
  - test
variables:
  - name: var1
    description: A variable
    default: hello
created: "2024-06-01T00:00:00.000Z"
modified: "2024-06-01T00:00:00.000Z"
starred_versions: []
---
Content with {{include:other.md}} here
"#;
        let parsed = parse_prompt_file("prompts/rt.md", content);
        assert_eq!(parsed.frontmatter.includes, vec!["other.md"]);

        let serialized = serialize_prompt_file(&parsed.frontmatter, &parsed.body);
        let reparsed = parse_prompt_file("prompts/rt.md", &serialized);

        assert_eq!(reparsed.frontmatter.id, "roundtrip");
        assert_eq!(reparsed.frontmatter.title, "Round Trip");
        assert!(matches!(reparsed.frontmatter.prompt_type, PromptType::Fragment));
        assert_eq!(reparsed.frontmatter.tags, vec!["test"]);
        assert_eq!(reparsed.frontmatter.variables.len(), 1);
        assert_eq!(reparsed.frontmatter.includes, vec!["other.md"]);
    }

    // --- New tests below ---

    #[test]
    fn test_malformed_yaml() {
        let content = "---\n: :\ninvalid: [unclosed\n---\nBody after bad yaml";
        let result = parse_prompt_file("test.md", content);
        // Should fall back to defaults
        assert_eq!(result.frontmatter.title, "");
        assert!(matches!(result.frontmatter.prompt_type, PromptType::Prompt));
        assert_eq!(result.frontmatter.id.len(), 8);
        assert_eq!(result.body, "Body after bad yaml");
    }

    #[test]
    fn test_empty_frontmatter() {
        let content = "---\n---\nBody";
        let result = parse_prompt_file("test.md", content);
        // Empty YAML parses as null which fails RawFrontmatter → defaults
        assert_eq!(result.frontmatter.title, "");
        assert_eq!(result.frontmatter.id.len(), 8);
        assert_eq!(result.body, "Body");
    }

    #[test]
    fn test_no_closing_delimiter() {
        let content = "---\ntitle: Oops\nbody without closing";
        let result = parse_prompt_file("test.md", content);
        // No closing --- → treated as no frontmatter
        assert_eq!(result.body, content);
        assert_eq!(result.frontmatter.title, "");
    }

    #[test]
    fn test_windows_line_endings() {
        let content = "---\r\ntitle: WinTest\r\ntags:\r\n  - win\r\n---\r\nBody with CRLF";
        let result = parse_prompt_file("test.md", content);
        assert_eq!(result.frontmatter.title, "WinTest");
        assert_eq!(result.frontmatter.tags, vec!["win"]);
        assert!(result.body.contains("Body with CRLF"));
    }

    #[test]
    fn test_body_with_triple_dash() {
        let content = "---\ntitle: Dashes\n---\nSome body\n---\nThis is still body";
        let result = parse_prompt_file("test.md", content);
        assert_eq!(result.frontmatter.title, "Dashes");
        assert!(result.body.contains("---"));
        assert!(result.body.contains("This is still body"));
    }

    #[test]
    fn test_unicode_in_title() {
        let content = "---\ntitle: \"Hello \u{1F680} \u{4F60}\u{597D}\"\n---\nBody";
        let result = parse_prompt_file("test.md", content);
        assert_eq!(result.frontmatter.title, "Hello \u{1F680} \u{4F60}\u{597D}");

        // Round-trip
        let serialized = serialize_prompt_file(&result.frontmatter, &result.body);
        let reparsed = parse_prompt_file("test.md", &serialized);
        assert_eq!(reparsed.frontmatter.title, "Hello \u{1F680} \u{4F60}\u{597D}");
    }

    #[test]
    fn test_large_body() {
        let large_body = "x".repeat(10_000);
        let content = format!("---\ntitle: Large\n---\n{}", large_body);
        let result = parse_prompt_file("test.md", &content);
        assert_eq!(result.frontmatter.title, "Large");
        assert_eq!(result.body.len(), 10_000);

        let serialized = serialize_prompt_file(&result.frontmatter, &result.body);
        assert!(serialized.contains(&large_body));
    }

    #[test]
    fn test_all_variable_fields() {
        let content = r#"---
title: VarTest
variables:
  - name: lang
    description: Programming language
    default: Rust
    enum:
      - Rust
      - Python
      - Go
---
Body"#;
        let result = parse_prompt_file("test.md", content);
        assert_eq!(result.frontmatter.variables.len(), 1);
        let v = &result.frontmatter.variables[0];
        assert_eq!(v.name, "lang");
        assert_eq!(v.description, Some("Programming language".to_string()));
        assert_eq!(v.default, Some("Rust".to_string()));
        assert_eq!(
            v.enum_values,
            Some(vec!["Rust".to_string(), "Python".to_string(), "Go".to_string()])
        );
    }

    #[test]
    fn test_multiple_starred_versions() {
        let content = r#"---
title: Stars
starred_versions:
  - commit: aaa111
    label: v1
    date: "2024-01-01"
  - commit: bbb222
    label: v2
    date: "2024-02-01"
  - commit: ccc333
    label: v3
    date: "2024-03-01"
---
Body"#;
        let result = parse_prompt_file("test.md", content);
        assert_eq!(result.frontmatter.starred_versions.len(), 3);
        assert_eq!(result.frontmatter.starred_versions[0].commit, "aaa111");
        assert_eq!(result.frontmatter.starred_versions[1].label, "v2");
        assert_eq!(result.frontmatter.starred_versions[2].date, "2024-03-01");
    }

    #[test]
    fn test_fragment_type_explicit() {
        let content = "---\ntype: fragment\n---\nfragment body";
        let result = parse_prompt_file("test.md", content);
        assert!(matches!(result.frontmatter.prompt_type, PromptType::Fragment));
    }

    #[test]
    fn test_unknown_type_defaults_to_prompt() {
        let content = "---\ntype: unknown_thing\n---\nbody";
        let result = parse_prompt_file("test.md", content);
        assert!(matches!(result.frontmatter.prompt_type, PromptType::Prompt));
    }

    #[test]
    fn test_empty_tags_array() {
        let content = "---\ntitle: EmptyTags\ntags: []\n---\nbody";
        let result = parse_prompt_file("test.md", content);
        assert!(result.frontmatter.tags.is_empty());
    }

    #[test]
    fn test_deeply_nested_path() {
        let content = "---\ntitle: Deep\n---\nbody";
        let result = parse_prompt_file("a/b/c/d/e/file.md", content);
        assert_eq!(result.frontmatter.folder, "/a/b/c/d/e");
    }

    #[test]
    fn test_serialize_with_all_optional_fields() {
        let fm = PromptFrontmatter {
            id: "full1234".to_string(),
            title: "Full".to_string(),
            prompt_type: PromptType::Fragment,
            tags: vec!["t1".to_string()],
            folder: "/p".to_string(),
            model_targets: Some(vec!["gpt-4".to_string(), "claude-sonnet-4".to_string()]),
            variables: vec![VariableDefinition {
                name: "v1".to_string(),
                description: Some("desc".to_string()),
                default: Some("def".to_string()),
                enum_values: Some(vec!["a".to_string(), "b".to_string()]),
            }],
            includes: vec!["inc.md".to_string()],
            created: "2024-01-01T00:00:00.000Z".to_string(),
            modified: "2024-01-01T00:00:00.000Z".to_string(),
            starred_versions: vec![StarredVersion {
                commit: "abc".to_string(),
                label: "v1".to_string(),
                date: "2024-01-01".to_string(),
            }],
        };
        let output = serialize_prompt_file(&fm, "body\n");
        assert!(output.contains("model_targets"));
        assert!(output.contains("gpt-4"));
        assert!(output.contains("variables"));
        assert!(output.contains("v1"));
        assert!(output.contains("includes"));
        assert!(output.contains("inc.md"));
        assert!(output.contains("starred_versions"));
        assert!(output.contains("type: fragment"));
    }

    #[test]
    fn test_serialize_omits_empty_optionals() {
        let fm = PromptFrontmatter {
            id: "omit1234".to_string(),
            title: "Omit".to_string(),
            prompt_type: PromptType::Prompt,
            tags: vec![],
            folder: "/".to_string(),
            model_targets: None,
            variables: Vec::new(),
            includes: Vec::new(),
            created: "2024-01-01T00:00:00.000Z".to_string(),
            modified: "2024-01-01T00:00:00.000Z".to_string(),
            starred_versions: Vec::new(),
        };
        let output = serialize_prompt_file(&fm, "body");
        assert!(!output.contains("model_targets"));
        assert!(!output.contains("variables"));
        assert!(!output.contains("includes"));
        assert!(!output.contains("starred_versions"));
    }

    #[test]
    fn test_id_generation_uniqueness() {
        use std::collections::HashSet;
        let ids: HashSet<String> = (0..100).map(|_| generate_id()).collect();
        assert_eq!(ids.len(), 100);
    }

    #[test]
    fn test_frontmatter_with_extra_unknown_fields() {
        let content = "---\ntitle: Known\nauthor: Unknown Field\npriority: 5\n---\nbody";
        let result = parse_prompt_file("test.md", content);
        // Extra fields should be silently ignored
        assert_eq!(result.frontmatter.title, "Known");
        assert_eq!(result.body, "body");
    }

    #[test]
    fn test_include_extraction_with_whitespace() {
        let body = "{{include:  path/with/spaces  }} and {{include:tight.md}}";
        let includes = extract_includes(body);
        assert_eq!(includes, vec!["path/with/spaces", "tight.md"]);
    }
}
