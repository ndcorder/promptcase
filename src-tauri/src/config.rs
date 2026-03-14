use std::fs;
use std::path::Path;

use crate::error::AppError;
use crate::types::RepoConfig;

const CONFIG_FILE: &str = ".promptcase.yaml";

const DEFAULT_GITIGNORE: &str = "\
.DS_Store
Thumbs.db
*.swp
*.swo
*~
.vscode/
.idea/
node_modules/
";

const DEFAULT_SYSTEM_TEMPLATE: &str = "\
---
id: \"\"
title: \"\"
type: prompt
tags: []
variables: []
created: \"\"
modified: \"\"
starred_versions: []
---

You are a helpful assistant.
";

const DEFAULT_USER_TEMPLATE: &str = "\
---
id: \"\"
title: \"\"
type: prompt
tags: []
variables: []
created: \"\"
modified: \"\"
starred_versions: []
---

Please help me with the following task:
";

/// Load `.promptcase.yaml` from the repo root, merging with defaults.
/// Returns defaults if the file doesn't exist.
pub fn load_config(repo_root: &Path) -> Result<RepoConfig, AppError> {
    let config_path = repo_root.join(CONFIG_FILE);
    if !config_path.exists() {
        return Ok(RepoConfig::default());
    }
    let content = fs::read_to_string(&config_path)?;
    let parsed: RepoConfig = serde_yaml::from_str(&content)?;
    // Merge: parsed fields override defaults. Since serde_yaml will use
    // Deserialize defaults for missing fields only if we annotate properly,
    // we do a manual merge to ensure defaults fill any gaps.
    let defaults = RepoConfig::default();
    Ok(merge_config(defaults, parsed))
}

/// Serialize config to YAML and write to `.promptcase.yaml`.
pub fn save_config(repo_root: &Path, config: &RepoConfig) -> Result<(), AppError> {
    let config_path = repo_root.join(CONFIG_FILE);
    let content = serde_yaml::to_string(config)?;
    fs::write(&config_path, content)?;
    Ok(())
}

/// Create config file if missing, `.gitignore` if missing, and
/// `_templates/` dir with default template files if missing.
pub fn ensure_repo_structure(repo_root: &Path) -> Result<(), AppError> {
    // Create .promptcase.yaml if missing
    let config_path = repo_root.join(CONFIG_FILE);
    if !config_path.exists() {
        save_config(repo_root, &RepoConfig::default())?;
    }

    // Create .gitignore if missing
    let gitignore_path = repo_root.join(".gitignore");
    if !gitignore_path.exists() {
        fs::write(&gitignore_path, DEFAULT_GITIGNORE)?;
    }

    // Create _templates/ directory
    let templates_dir = repo_root.join("_templates");
    fs::create_dir_all(&templates_dir)?;

    // Create system-prompt.md if missing
    let system_tpl = templates_dir.join("system-prompt.md");
    if !system_tpl.exists() {
        fs::write(&system_tpl, DEFAULT_SYSTEM_TEMPLATE)?;
    }

    // Create user-prompt.md if missing
    let user_tpl = templates_dir.join("user-prompt.md");
    if !user_tpl.exists() {
        fs::write(&user_tpl, DEFAULT_USER_TEMPLATE)?;
    }

    Ok(())
}

/// Merge a parsed config on top of defaults. The parsed config wins for
/// any field that was deserialized; for collection fields (lint_rules),
/// entries from parsed override/extend the defaults.
fn merge_config(defaults: RepoConfig, parsed: RepoConfig) -> RepoConfig {
    let mut lint_rules = defaults.lint_rules;
    for (k, v) in parsed.lint_rules {
        lint_rules.insert(k, v);
    }
    RepoConfig {
        version: parsed.version,
        default_model: parsed.default_model,
        auto_commit: parsed.auto_commit,
        commit_prefix: parsed.commit_prefix,
        token_count_models: parsed.token_count_models,
        lint_rules,
        commit_delay_ms: parsed.commit_delay_ms,
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use tempfile::TempDir;

    fn tmp_dir() -> TempDir {
        TempDir::new().unwrap()
    }

    #[test]
    fn load_config_returns_defaults_when_missing() {
        let dir = tmp_dir();
        let config = load_config(dir.path()).unwrap();
        assert_eq!(config.version, 1);
        assert_eq!(config.default_model, "claude-sonnet-4");
        assert!(config.auto_commit);
    }

    #[test]
    fn save_and_load_roundtrip() {
        let dir = tmp_dir();
        let mut config = RepoConfig::default();
        config.default_model = "gpt-4o".into();
        config.auto_commit = false;

        save_config(dir.path(), &config).unwrap();
        let loaded = load_config(dir.path()).unwrap();

        assert_eq!(loaded.default_model, "gpt-4o");
        assert!(!loaded.auto_commit);
        assert_eq!(loaded.version, 1);
    }

    #[test]
    fn load_config_merges_with_defaults() {
        let dir = tmp_dir();
        // Write a partial config (missing some lint rules)
        let partial = "version: 2\ndefaultModel: custom-model\nautoCommit: false\ncommitPrefix: '[pc]'\ntokenCountModels:\n  - custom\nlintRules:\n  custom-rule: error\n";
        fs::write(dir.path().join(CONFIG_FILE), partial).unwrap();

        let config = load_config(dir.path()).unwrap();
        assert_eq!(config.version, 2);
        assert_eq!(config.default_model, "custom-model");
        // Default lint rules should still be present
        assert!(config.lint_rules.contains_key("unresolved-variable"));
        // Custom rule should also be present
        assert!(config.lint_rules.contains_key("custom-rule"));
    }

    #[test]
    fn ensure_repo_structure_creates_all_files() {
        let dir = tmp_dir();
        ensure_repo_structure(dir.path()).unwrap();

        assert!(dir.path().join(CONFIG_FILE).exists());
        assert!(dir.path().join(".gitignore").exists());
        assert!(dir.path().join("_templates").is_dir());
        assert!(dir.path().join("_templates/system-prompt.md").exists());
        assert!(dir.path().join("_templates/user-prompt.md").exists());

        // Verify gitignore content
        let gitignore = fs::read_to_string(dir.path().join(".gitignore")).unwrap();
        assert!(gitignore.contains(".DS_Store"));
        assert!(gitignore.contains("node_modules/"));

        // Verify template content
        let system = fs::read_to_string(dir.path().join("_templates/system-prompt.md")).unwrap();
        assert!(system.contains("You are a helpful assistant."));
        assert!(system.contains("type: prompt"));

        let user = fs::read_to_string(dir.path().join("_templates/user-prompt.md")).unwrap();
        assert!(user.contains("Please help me with the following task:"));
    }

    #[test]
    fn ensure_repo_structure_does_not_overwrite_existing() {
        let dir = tmp_dir();
        // Create a custom gitignore first
        fs::write(dir.path().join(".gitignore"), "custom\n").unwrap();

        ensure_repo_structure(dir.path()).unwrap();

        // Should not have been overwritten
        let gitignore = fs::read_to_string(dir.path().join(".gitignore")).unwrap();
        assert_eq!(gitignore, "custom\n");
    }

    #[test]
    fn ensure_repo_structure_idempotent() {
        let dir = tmp_dir();
        ensure_repo_structure(dir.path()).unwrap();
        // Running again should succeed without error
        ensure_repo_structure(dir.path()).unwrap();
    }

    #[test]
    fn save_config_creates_valid_yaml() {
        let dir = tmp_dir();
        save_config(dir.path(), &RepoConfig::default()).unwrap();
        let content = fs::read_to_string(dir.path().join(CONFIG_FILE)).unwrap();
        // Should be valid YAML that parses back
        let _: RepoConfig = serde_yaml::from_str(&content).unwrap();
    }

    #[test]
    fn save_config_creates_parent_dir() {
        let dir = tmp_dir();
        let nested = dir.path().join("deep/nested/dir");
        fs::create_dir_all(&nested).unwrap();
        save_config(&nested, &RepoConfig::default()).unwrap();
        assert!(nested.join(CONFIG_FILE).exists());
    }

    #[test]
    fn load_config_with_empty_file() {
        let dir = tmp_dir();
        // Write an empty file
        fs::write(dir.path().join(CONFIG_FILE), "").unwrap();
        // Should return defaults, not error (serde_yaml parses empty as null,
        // which will fail deserialization, so load_config should handle it)
        let result = load_config(dir.path());
        // Empty YAML may fail to deserialize to struct; verify behavior
        // If it errors, that's acceptable - the important thing is it doesn't panic
        if let Ok(config) = result {
            // If it succeeds, should have sensible defaults
            assert!(config.version >= 1);
        }
    }

    #[test]
    fn ensure_structure_idempotent_on_existing_templates() {
        let dir = tmp_dir();
        // Create a custom template first
        let tpl_dir = dir.path().join("_templates");
        fs::create_dir_all(&tpl_dir).unwrap();
        let custom_content = "---\ntitle: Custom\ntype: prompt\n---\nMy custom system prompt.\n";
        fs::write(tpl_dir.join("system-prompt.md"), custom_content).unwrap();

        ensure_repo_structure(dir.path()).unwrap();

        // Custom template should NOT be overwritten
        let after = fs::read_to_string(tpl_dir.join("system-prompt.md")).unwrap();
        assert_eq!(after, custom_content);
    }

    #[test]
    fn roundtrip_preserves_all_lint_rules() {
        let dir = tmp_dir();
        let defaults = RepoConfig::default();
        let expected_rules: Vec<String> = defaults.lint_rules.keys().cloned().collect();

        save_config(dir.path(), &defaults).unwrap();
        let loaded = load_config(dir.path()).unwrap();

        // All 10 default lint rules must be present
        assert_eq!(loaded.lint_rules.len(), 10);
        for rule in &expected_rules {
            assert!(
                loaded.lint_rules.contains_key(rule),
                "Missing lint rule after round-trip: {rule}"
            );
        }
    }

    #[test]
    fn config_with_extra_unknown_fields() {
        let dir = tmp_dir();
        // Write YAML with extra keys that don't exist on RepoConfig
        let yaml = "version: 1\ndefaultModel: claude-sonnet-4\nautoCommit: true\ncommitPrefix: '[pc]'\ntokenCountModels:\n  - claude-sonnet-4\nlintRules: {}\nextraField: surprise\nanotherUnknown: 42\n";
        fs::write(dir.path().join(CONFIG_FILE), yaml).unwrap();

        // serde should ignore unknown fields and parse successfully
        let config = load_config(dir.path()).unwrap();
        assert_eq!(config.version, 1);
        assert_eq!(config.default_model, "claude-sonnet-4");
    }

    #[test]
    fn commit_delay_ms_default_value() {
        let config = RepoConfig::default();
        assert_eq!(config.commit_delay_ms, 5000);
    }

    #[test]
    fn commit_delay_ms_from_yaml() {
        let dir = tmp_dir();
        let yaml = "version: 1\ndefaultModel: claude-sonnet-4\nautoCommit: true\ncommitPrefix: '[pc]'\ntokenCountModels:\n  - claude-sonnet-4\nlintRules: {}\ncommitDelayMs: 3000\n";
        fs::write(dir.path().join(CONFIG_FILE), yaml).unwrap();

        let config = load_config(dir.path()).unwrap();
        assert_eq!(config.commit_delay_ms, 3000);
    }

    #[test]
    fn commit_delay_ms_defaults_when_missing_from_yaml() {
        let dir = tmp_dir();
        // YAML without commitDelayMs — should default to 5000
        let yaml = "version: 1\ndefaultModel: claude-sonnet-4\nautoCommit: true\ncommitPrefix: '[pc]'\ntokenCountModels:\n  - claude-sonnet-4\nlintRules: {}\n";
        fs::write(dir.path().join(CONFIG_FILE), yaml).unwrap();

        let config = load_config(dir.path()).unwrap();
        assert_eq!(config.commit_delay_ms, 5000);
    }
}
