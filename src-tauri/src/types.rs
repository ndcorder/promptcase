use std::collections::HashMap;

use serde::{Deserialize, Serialize};

#[derive(Serialize, Deserialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct VariableDefinition {
    pub name: String,
    pub description: Option<String>,
    pub default: Option<String>,
    #[serde(rename = "enum")]
    pub enum_values: Option<Vec<String>>,
}

#[derive(Serialize, Deserialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct StarredVersion {
    pub commit: String,
    pub label: String,
    pub date: String,
}

#[derive(Serialize, Deserialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct PromptFrontmatter {
    pub id: String,
    pub title: String,
    #[serde(rename = "type")]
    pub prompt_type: PromptType,
    pub tags: Vec<String>,
    pub folder: String,
    pub model_targets: Option<Vec<String>>,
    pub variables: Vec<VariableDefinition>,
    pub includes: Vec<String>,
    pub created: String,
    pub modified: String,
    pub starred_versions: Vec<StarredVersion>,
}

#[derive(Serialize, Deserialize, Clone, Debug)]
#[serde(rename_all = "lowercase")]
pub enum PromptType {
    Prompt,
    Fragment,
}

#[derive(Serialize, Deserialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct PromptFile {
    pub path: String,
    pub frontmatter: PromptFrontmatter,
    pub body: String,
    pub raw: String,
}

#[derive(Serialize, Deserialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct PromptEntry {
    pub path: String,
    pub frontmatter: PromptFrontmatter,
}

#[derive(Serialize, Deserialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct CommitEntry {
    pub hash: String,
    pub date: String,
    pub message: String,
    pub additions: usize,
    pub deletions: usize,
}

#[derive(Serialize, Deserialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct DiffResult {
    pub raw: String,
    pub hunks: Vec<DiffHunk>,
}

#[derive(Serialize, Deserialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct DiffHunk {
    pub old_start: usize,
    pub old_lines: usize,
    pub new_start: usize,
    pub new_lines: usize,
    pub lines: Vec<DiffLine>,
}

#[derive(Serialize, Deserialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct DiffLine {
    #[serde(rename = "type")]
    pub line_type: DiffLineType,
    pub content: String,
}

#[derive(Serialize, Deserialize, Clone, Debug)]
#[serde(rename_all = "lowercase")]
pub enum DiffLineType {
    Add,
    Remove,
    Context,
}

#[derive(Serialize, Deserialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct ResolvedPrompt {
    pub text: String,
    pub variables: HashMap<String, String>,
    pub unresolved_variables: Vec<String>,
    pub included_fragments: Vec<String>,
}

#[derive(Serialize, Deserialize, Clone, Debug)]
#[serde(rename_all = "lowercase")]
pub enum LintSeverity {
    Error,
    Warning,
    Info,
}

#[derive(Serialize, Deserialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct LintResult {
    pub rule: String,
    pub severity: LintSeverity,
    pub message: String,
    pub line: Option<usize>,
    pub column: Option<usize>,
}

#[derive(Serialize, Deserialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct SearchResult {
    pub path: String,
    pub title: String,
    pub snippet: String,
    pub score: f64,
    pub tags: Vec<String>,
}

#[derive(Serialize, Deserialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct SearchFilters {
    pub tag: Option<String>,
    pub folder: Option<String>,
    #[serde(rename = "type")]
    pub filter_type: Option<PromptType>,
}

#[derive(Serialize, Deserialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct RepoConfig {
    pub version: u32,
    pub default_model: String,
    pub auto_commit: bool,
    pub commit_prefix: String,
    pub token_count_models: Vec<String>,
    pub lint_rules: HashMap<String, LintSeverity>,
}

impl Default for RepoConfig {
    fn default() -> Self {
        let mut lint_rules = HashMap::new();
        lint_rules.insert("unresolved-variable".into(), LintSeverity::Error);
        lint_rules.insert("unused-variable".into(), LintSeverity::Warning);
        lint_rules.insert("broken-include".into(), LintSeverity::Error);
        lint_rules.insert("circular-include".into(), LintSeverity::Error);
        lint_rules.insert("include-depth".into(), LintSeverity::Error);
        lint_rules.insert("duplicate-variable".into(), LintSeverity::Warning);
        lint_rules.insert("missing-description".into(), LintSeverity::Info);
        lint_rules.insert("missing-title".into(), LintSeverity::Warning);
        lint_rules.insert("empty-body".into(), LintSeverity::Warning);
        lint_rules.insert("orphaned-fragment".into(), LintSeverity::Info);

        Self {
            version: 1,
            default_model: "claude-sonnet-4".into(),
            auto_commit: true,
            commit_prefix: "[promptcase]".into(),
            token_count_models: vec!["claude-sonnet-4".into(), "gpt-4o".into()],
            lint_rules,
        }
    }
}

#[derive(Serialize, Deserialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct RepoStatus {
    pub initialized: bool,
    pub clean: bool,
    pub total_files: usize,
    pub repo_path: String,
}
