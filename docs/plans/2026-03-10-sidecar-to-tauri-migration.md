# Sidecar-to-Tauri Migration Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Replace the Node.js/Bun sidecar with native Rust Tauri commands, eliminating the external binary, JSON-RPC IPC, and ~50MB of bundle size.

**Architecture:** Each sidecar TypeScript module becomes a Rust module under `src-tauri/src/`. The RPC dispatch layer (`rpc.ts`, `index.ts`) is replaced by Tauri's `#[tauri::command]` system. The frontend switches from JSON-RPC over stdin/stdout to `@tauri-apps/api/core::invoke()`. Shared state (config, search index, git handle) lives in `tauri::State<Mutex<AppState>>`.

**Tech Stack:** Rust, Tauri v2, serde/serde_yaml, git2, tiktoken-rs, notify, walkdir, regex, uuid, chrono

---

## Task 1: Rust Project Setup

**Files:**
- Modify: `src-tauri/Cargo.toml`
- Modify: `src-tauri/src/main.rs`
- Create: `src-tauri/src/types.rs`
- Create: `src-tauri/src/state.rs`
- Create: `src-tauri/src/error.rs`

**Step 1: Add Rust dependencies to Cargo.toml**

Add these dependencies (keep existing ones):
```toml
serde_yaml = "0.9"
git2 = "0.19"
tiktoken-rs = "0.6"
notify = { version = "7", features = ["macos_kqueue"] }
walkdir = "2"
uuid = { version = "1", features = ["v4"] }
chrono = { version = "0.4", features = ["serde"] }
regex = "1"
```

**Step 2: Create types.rs**

Port all types from `sidecar/src/types.ts`. Every struct needs `#[derive(Serialize, Deserialize, Clone, Debug)]`. Key types:

- `VariableDefinition { name, description, default, enum_values }`
- `StarredVersion { commit, label, date }`
- `PromptFrontmatter { id, title, prompt_type, tags, folder, model_targets, variables, includes, created, modified, starred_versions }`
- `PromptFile { path, frontmatter, body, raw }`
- `PromptEntry { path, frontmatter }`
- `CommitEntry { hash, date, message, additions, deletions }`
- `DiffResult { raw, hunks }`, `DiffHunk`, `DiffLine`
- `ResolvedPrompt { text, variables, unresolved_variables, included_fragments }`
- `LintResult { rule, severity, message, line, column }`, `LintSeverity` enum
- `SearchResult { path, title, snippet, score, tags }`
- `SearchFilters { tag, folder, filter_type, model }`
- `RepoConfig { version, default_model, auto_commit, commit_prefix, token_count_models, lint_rules }`
- `RepoStatus { initialized, clean, total_files, repo_path }`
- `DEFAULT_CONFIG` constant matching the TypeScript version

**Step 3: Create error.rs**

Simple error type that implements `Into<tauri::InvokeError>`:
```rust
#[derive(Debug, thiserror::Error)]
pub enum AppError {
    #[error("{0}")]
    Io(#[from] std::io::Error),
    #[error("{0}")]
    Git(#[from] git2::Error),
    #[error("{0}")]
    Yaml(#[from] serde_yaml::Error),
    #[error("{0}")]
    Custom(String),
}
impl serde::Serialize for AppError {
    fn serialize<S: serde::Serializer>(&self, s: S) -> Result<S::Ok, S::Error> {
        s.serialize_str(&self.to_string())
    }
}
```
Add `thiserror = "2"` to Cargo.toml.

**Step 4: Create state.rs**

```rust
pub struct AppState {
    pub repo_root: PathBuf,
    pub config: RepoConfig,
    pub search: PromptSearch,
}
```

**Step 5: Update main.rs skeleton**

```rust
mod types;
mod state;
mod error;
mod config;
mod frontmatter;
mod file_ops;
mod git_ops;
mod template;
mod linter;
mod tokenizer;
mod search;
mod commands;

fn main() {
    let repo_root = std::env::args().nth(1)
        .or_else(|| std::env::var("PROMPTCASE_REPO").ok())
        .unwrap_or_else(|| dirs::home_dir().unwrap().join("prompts").to_string_lossy().to_string());
    // State init happens in commands::setup
    tauri::Builder::default()
        .plugin(tauri_plugin_shell::init())
        .setup(|app| {
            commands::setup(app, &repo_root)?;
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            commands::list_files,
            commands::read_file,
            commands::write_file,
            commands::create_file,
            commands::delete_file,
            commands::move_file,
            commands::git_log,
            commands::git_diff,
            commands::git_restore,
            commands::git_status,
            commands::resolve_template,
            commands::lint_file,
            commands::lint_all,
            commands::get_variables,
            commands::count_tokens,
            commands::count_tokens_resolved,
            commands::search_query,
            commands::search_reindex,
            commands::get_config,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
```

Add `dirs = "6"` to Cargo.toml for home directory resolution.

**Step 6: Verify it compiles**

Run: `cd src-tauri && cargo check`
Expected: Compiles (modules will be empty stubs initially)

**Step 7: Commit**
```
feat: scaffold Rust modules for sidecar migration
```

---

## Task 2: Config Module

**Files:**
- Create: `src-tauri/src/config.rs`

Port `sidecar/src/config.ts` + `yaml-minimal.ts`. Since we have `serde_yaml`, we don't need the minimal parser.

**Key functions:**
- `load_config(repo_root: &Path) -> RepoConfig` - Read `.promptcase.yaml`, deserialize, merge with defaults
- `save_config(repo_root: &Path, config: &RepoConfig)` - Serialize and write
- `ensure_repo_structure(repo_root: &Path)` - Create config file, .gitignore, and `_templates/` with default templates if missing

The default templates content comes from `config.ts` lines 61-109.

**Step 1: Write config.rs with tests**

Test: `load_config` returns defaults when no file exists. `save_config` + `load_config` round-trips. `ensure_repo_structure` creates expected files.

**Step 2: Verify**
Run: `cd src-tauri && cargo test config`

**Step 3: Commit**
```
feat: add config module for repo setup and YAML config
```

---

## Task 3: Frontmatter Module

**Files:**
- Create: `src-tauri/src/frontmatter.rs`

Port `sidecar/src/frontmatter.ts`. Parse markdown files with `---` delimited YAML frontmatter.

**Key functions:**
- `parse_prompt_file(file_path: &str, content: &str) -> PromptFile` - Split on `---`, parse YAML with serde_yaml, extract includes from body, build PromptFrontmatter
- `serialize_prompt_file(frontmatter: &PromptFrontmatter, body: &str) -> String` - Produce `---\n{yaml}\n---\n{body}`
- `generate_id() -> String` - 8 hex chars from random bytes

**Important details:**
- The `folder` field is derived from the file path: `"/" + path.parent()`
- `includes` are extracted from `{{include:path}}` patterns in the body
- When serializing, only include optional fields (model_targets, variables, includes, starred_versions) if non-empty
- The `modified` timestamp is always updated on serialize

**Tests:**
- Parse a valid prompt file, verify all frontmatter fields
- Parse a file with no frontmatter (should get defaults)
- Round-trip: serialize then parse produces same data
- Include extraction from body text

**Commit:**
```
feat: add frontmatter parsing and serialization
```

---

## Task 4: File Operations Module

**Files:**
- Create: `src-tauri/src/file_ops.rs`

Port `sidecar/src/file-ops.ts`. Uses `walkdir` for directory traversal.

**Key functions:**
- `safe_path(repo_root: &Path, file_path: &str) -> Result<PathBuf>` - Reject `..` and paths escaping repo root
- `list_all(repo_root: &Path) -> Result<Vec<PromptEntry>>` - Walk directory, parse all .md files, skip hidden dirs and node_modules
- `read_file(repo_root: &Path, file_path: &str) -> Result<PromptFile>`
- `read_raw(repo_root: &Path, file_path: &str) -> Result<String>`
- `write_file(repo_root: &Path, file_path: &str, frontmatter: &PromptFrontmatter, body: &str, config: &RepoConfig) -> Result<()>` - Create parent dirs, serialize, write, optionally auto-commit
- `create_file(repo_root: &Path, file_path: &str, title: &str, prompt_type: &str, template: Option<&str>) -> Result<PromptFile>` - Use template from `_templates/` or generate default
- `delete_file(repo_root: &Path, file_path: &str) -> Result<()>`
- `move_file(repo_root: &Path, from: &str, to: &str) -> Result<()>`

**Important:** Auto-commit calls go through git_ops. Pass the git handle to functions that need it, or handle at the command layer.

**Tests:**
- `safe_path` rejects traversal attempts
- `list_all` finds .md files, skips hidden dirs
- Full CRUD cycle: create, read, write, delete

**Commit:**
```
feat: add file operations module with path safety
```

---

## Task 5: Git Operations Module

**Files:**
- Create: `src-tauri/src/git_ops.rs`

Port `sidecar/src/git-ops.ts` using the `git2` crate.

**Key functions:**
- `init_repo(repo_root: &Path) -> Result<Repository>` - Open or init repo, set default user config
- `repo_status(repo: &Repository, repo_root: &Path) -> Result<RepoStatus>`
- `auto_commit(repo: &Repository, file_paths: &[&str], action: &str, title: Option<&str>, commit_prefix: &str) -> Result<Option<String>>` - Stage files, commit if anything staged
- `git_log(repo: &Repository, file_path: Option<&str>, limit: usize) -> Result<Vec<CommitEntry>>` - Walk revisions, optionally filter by path using diff
- `git_diff(repo: &Repository, file_path: &str, commit_a: &str, commit_b: &str) -> Result<DiffResult>` - Validate refs, compute diff, parse into hunks
- `show_file_at_commit(repo: &Repository, file_path: &str, commit: &str) -> Result<String>` - Resolve commit, get blob at path
- `git_restore(repo: &Repository, repo_root: &Path, file_path: &str, commit: &str, commit_prefix: &str) -> Result<Option<String>>` - Get content at commit, write to disk, auto-commit

**Important details:**
- `validate_commit_ref` - Same regex as TS version
- `validate_file_path` - Reject leading `-` and `..`
- `parse_diff` - Parse unified diff format into `DiffHunk`/`DiffLine` structs
- For `git_log` with path filter: use `repo.revwalk()` then check each commit's diff to filter by path

**Tests:**
- Init a temp dir, verify repo creation
- Create file, auto-commit, verify log has entry
- Diff between two commits

**Commit:**
```
feat: add git operations module using git2
```

---

## Task 6: Template Resolution Module

**Files:**
- Create: `src-tauri/src/template.rs`

Port `sidecar/src/template.ts`. Pure logic with file reads.

**Key functions:**
- `resolve_template(file_path: &str, content: &str, repo_root: &Path, variables: Option<&HashMap<String, String>>) -> Result<ResolvedPrompt>`
- `resolve_includes(text: &str, ctx: &mut ResolveContext) -> Result<String>` - Recursive, max depth 10, circular detection via visited set
- `substitute_variables(text: &str, variables: &HashMap<String, String>, all_defs: &[VariableDefinition]) -> (String, Vec<String>)` - Replace `{{var}}` with values/defaults, track unresolved
- `extract_variable_names(body: &str) -> Vec<String>` - All `{{name}}` excluding `{{include:...}}`
- `extract_include_paths(body: &str) -> Vec<String>` - All `{{include:path}}`

**Patterns (regex):**
- Include: `\{\{include:([^}]+)\}\}`
- Variable: `\{\{([^}:]+)\}\}`

**Tests:**
- Variable substitution with defaults
- Include resolution (create temp files)
- Circular include detection
- Max depth enforcement

**Commit:**
```
feat: add template resolution with include and variable support
```

---

## Task 7: Linter Module

**Files:**
- Create: `src-tauri/src/linter.rs`

Port `sidecar/src/linter.ts`. Uses frontmatter and template modules.

**Lint rules (11 total):**
1. `missing-title` - No title in frontmatter
2. `empty-body` - Frontmatter present but no body
3. `unresolved-variable` - `{{var}}` used but not declared
4. `unused-variable` - Declared but not referenced in body
5. `missing-description` - Variable without description
6. `broken-include` - `{{include:path}}` references nonexistent file
7. `circular-include` - Recursive include cycle (max depth 10)
8. `include-depth` - Nesting exceeds 10
9. `duplicate-variable` - Same variable in parent and fragment with different defaults
10. `orphaned-fragment` - Fragment not included by any prompt (lint_all only)

**Key functions:**
- `lint_prompt(file_path: &str, content: &str, repo_root: &Path, config: &RepoConfig) -> Result<Vec<LintResult>>`
- `lint_all(files: &[(String, String)], repo_root: &Path, config: &RepoConfig) -> Result<HashMap<String, Vec<LintResult>>>`
- `check_circular_includes(...)` - Recursive traversal with visited set
- `check_duplicate_variables(...)` - Compare defaults across parent + fragment variables
- Helper: `severity(rule, config) -> LintSeverity` - Look up rule severity from config, default to "warning"

**Tests:**
- Missing title produces warning
- Unresolved variable produces error
- Broken include produces error
- Orphaned fragment detected in lint_all

**Commit:**
```
feat: add linter with 11 configurable lint rules
```

---

## Task 8: Token Counting Module

**Files:**
- Create: `src-tauri/src/tokenizer.rs`

Port `sidecar/src/tokenizer.ts` using `tiktoken-rs`.

**Key functions:**
- `count_tokens(text: &str, model: &str) -> usize` - Get encoding for model, encode text, return length
- `get_encoding_for_model(model: &str) -> &str` - "o200k_base" for 4o/o1/o3 models, "cl100k_base" for others
- `is_approximate(model: &str) -> bool` - True for claude/sonnet/opus/haiku models

**Note:** `tiktoken-rs` uses `p50k_base`, `cl100k_base`, `o200k_base`. API:
```rust
use tiktoken_rs::{cl100k_base, o200k_base};
let bpe = cl100k_base().unwrap();
let tokens = bpe.encode_with_special_tokens(text);
tokens.len()
```

Cache the BPE instances (they're expensive to create). Use `once_cell::sync::Lazy` or `std::sync::OnceLock`.

**Tests:**
- Known string produces expected token count
- Model routing: "gpt-4o" -> o200k_base, "claude-sonnet" -> cl100k_base

**Commit:**
```
feat: add token counting module using tiktoken-rs
```

---

## Task 9: Search Module

**Files:**
- Create: `src-tauri/src/search.rs`

Port `sidecar/src/search.ts`. Implement a simple in-memory search since we're dealing with small document sets (hundreds, not millions).

**Approach:** Store documents in a `HashMap<String, SearchableDoc>`. On search, iterate all docs, compute a relevance score based on:
- Title match (boost 3x)
- Tag match (boost 2x)
- Body match (boost 1x)
- Fuzzy matching via simple edit distance or substring contains
- Prefix matching

This is simpler than MiniSearch but sufficient for the use case.

**Key types/functions:**
- `PromptSearch { documents: HashMap<String, SearchableDoc> }`
- `add_document(&mut self, entry: &PromptEntry, body: &str)`
- `remove_document(&mut self, path: &str)`
- `search(&self, query: &str, filters: Option<&SearchFilters>) -> Vec<SearchResult>`
- `clear(&mut self)`

**Scoring:** Split query into terms. For each term, check if title/tags/body contains the term (case-insensitive). Score = sum of (boost * match_count). Sort by score descending.

**Tests:**
- Add documents, search by title term, verify found
- Filter by tag
- Remove document, verify not in results

**Commit:**
```
feat: add in-memory search with scoring and filters
```

---

## Task 10: Tauri Commands Module

**Files:**
- Create: `src-tauri/src/commands.rs`

Wire up all 18 Tauri commands + the setup function.

**Setup function:**
```rust
pub fn setup(app: &mut tauri::App, repo_root: &str) -> Result<(), Box<dyn std::error::Error>> {
    let root = PathBuf::from(repo_root);
    ensure_repo_structure(&root)?;
    let config = load_config(&root)?;
    git_ops::init_repo(&root)?;
    let mut search = PromptSearch::new();
    // Build initial index
    let entries = file_ops::list_all(&root)?;
    for entry in &entries {
        if let Ok(file) = file_ops::read_raw(&root, &entry.path) {
            search.add_document(entry, &file);
        }
    }
    app.manage(Mutex::new(AppState { repo_root: root, config, search }));
    Ok(())
}
```

**Each command:** Extract state, call module function, return result. Example:
```rust
#[tauri::command]
async fn list_files(state: tauri::State<'_, Mutex<AppState>>) -> Result<Vec<PromptEntry>, AppError> {
    let state = state.lock().unwrap();
    file_ops::list_all(&state.repo_root)
}
```

**All 18 commands mapping (TS method -> Rust function):**
1. `file.list` -> `list_files()`
2. `file.read` -> `read_file(path)`
3. `file.write` -> `write_file(path, frontmatter, body)` — merges frontmatter, updates search index
4. `file.create` -> `create_file(path, title, prompt_type, template)` — adds to search index
5. `file.delete` -> `delete_file(path)` — removes from search index
6. `file.move` -> `move_file(from, to)` — updates search index
7. `git.log` -> `git_log(path, limit)`
8. `git.diff` -> `git_diff(path, commit_a, commit_b)`
9. `git.restore` -> `git_restore(path, commit)`
10. `git.status` -> `git_status()`
11. `template.resolve` -> `resolve_template(path, variables)`
12. `template.lint` -> `lint_file(path)`
13. `template.lint_all` -> `lint_all()`
14. `template.variables` -> `get_variables(path)`
15. `tokens.count` -> `count_tokens(text, model)`
16. `tokens.count_resolved` -> `count_tokens_resolved(path, model, variables)`
17. `search.query` -> `search_query(q, filters)`
18. `search.reindex` -> `search_reindex()`
19. `config.get` -> `get_config()`

**Important:** The git Repository handle should also be in AppState (wrapped in Mutex). Open it once in setup.

**Step 1:** Write all commands
**Step 2:** Verify compilation: `cd src-tauri && cargo check`

**Commit:**
```
feat: wire up all 18 Tauri commands replacing sidecar RPC
```

---

## Task 11: Frontend IPC Migration

**Files:**
- Modify: `src/lib/ipc.ts`

Replace the entire sidecar-based IPC with direct Tauri `invoke()` calls.

**New ipc.ts structure:**
```typescript
import type { PromptEntry, PromptFile, ... } from "./types";

function isTauri(): boolean {
  return typeof window !== "undefined" && "__TAURI__" in window;
}

async function call<T>(command: string, args?: Record<string, unknown>): Promise<T> {
  if (isTauri()) {
    const { invoke } = await import("@tauri-apps/api/core");
    return invoke<T>(command, args);
  }
  return mockCall<T>(command, args);
}

export const api = {
  listFiles: () => call<PromptEntry[]>("list_files"),
  readFile: (path: string) => call<PromptFile>("read_file", { path }),
  writeFile: (path: string, frontmatter?: object, body?: string) =>
    call<{ ok: boolean }>("write_file", { path, frontmatter, body }),
  createFile: (path: string, title: string, type: string = "prompt", template?: string) =>
    call<PromptFile>("create_file", { path, title, prompt_type: type, template }),
  deleteFile: (path: string) => call<{ ok: boolean }>("delete_file", { path }),
  moveFile: (from: string, to: string) => call<{ ok: boolean }>("move_file", { from, to }),
  gitLog: (path?: string, limit?: number) => call<CommitEntry[]>("git_log", { path, limit }),
  gitDiff: (path: string, commitA: string, commitB: string) =>
    call<DiffResult>("git_diff", { path, commit_a: commitA, commit_b: commitB }),
  gitRestore: (path: string, commit: string) => call<string | null>("git_restore", { path, commit }),
  gitStatus: () => call<RepoStatus>("git_status"),
  resolveTemplate: (path: string, variables?: Record<string, string>) =>
    call<ResolvedPrompt>("resolve_template", { path, variables }),
  lintFile: (path: string) => call<LintResult[]>("lint_file", { path }),
  lintAll: () => call<Record<string, LintResult[]>>("lint_all"),
  getVariables: (path: string) => call<VariableDefinition[]>("get_variables", { path }),
  countTokens: (text: string, model: string) => call<number>("count_tokens", { text, model }),
  countTokensResolved: (path: string, model: string, variables?: Record<string, string>) =>
    call<number>("count_tokens_resolved", { path, model, variables }),
  search: (q: string, filters?: object) => call<SearchResult[]>("search_query", { q, filters }),
  reindex: () => call<{ ok: boolean }>("search_reindex"),
  getConfig: () => call<RepoConfig>("get_config"),
};
```

**Keep the mock implementation** for `npm run dev` without Tauri. Move it to a `mockCall` function (same logic as existing `mockRpcCall`).

**Important:** The command names in `invoke()` must match the Rust `#[tauri::command]` function names exactly (snake_case).

**Commit:**
```
feat: switch frontend IPC from sidecar JSON-RPC to Tauri invoke
```

---

## Task 12: Cleanup

**Files:**
- Modify: `src-tauri/tauri.conf.json` — Remove `externalBin` and `shell` plugin config
- Modify: `src-tauri/Cargo.toml` — Remove `tauri-plugin-shell` dependency
- Modify: `src-tauri/src/main.rs` — Remove `.plugin(tauri_plugin_shell::init())`
- Modify: `src-tauri/capabilities/default.json` — Remove shell permissions
- Modify: `package.json` — Remove sidecar build scripts
- Modify: `.github/workflows/ci.yml` — Remove sidecar build step
- Delete: `sidecar/` directory entirely

**Step 1: Update tauri.conf.json**
- Remove `"externalBin": ["binaries/promptcase-sidecar"]` from bundle
- Remove `"shell": { "open": true }` from plugins (unless shell:open is still needed for external links)

**Step 2: Update Cargo.toml**
- Remove `tauri-plugin-shell = "2"` from dependencies

**Step 3: Update main.rs**
- Remove `tauri_plugin_shell` import/plugin registration

**Step 4: Update capabilities**
- Remove any shell:execute permissions from `default.json`

**Step 5: Update package.json**
- Remove sidecar-related scripts (build-sidecar, install-sidecar, etc.)
- Remove sidecar from workspace if configured

**Step 6: Update CI**
- Remove sidecar build steps from `.github/workflows/ci.yml`

**Step 7: Delete sidecar directory**
```bash
rm -rf sidecar/
```

**Step 8: Verify full build**
```bash
cd src-tauri && cargo build
npm run build
```

**Step 9: Run existing frontend tests**
```bash
npm run test
```

**Commit:**
```
chore: remove sidecar and shell plugin, complete migration to native Tauri
```

---

## Dependency Graph

```
Task 1 (Setup) ──┬── Task 2 (Config)
                  ├── Task 3 (Frontmatter)──── Task 4 (File Ops)──┐
                  ├── Task 5 (Git Ops)                             ├── Task 6 (Template)── Task 7 (Linter)
                  ├── Task 8 (Tokenizer)                           │
                  └── Task 9 (Search)                              │
                                                                   │
Task 10 (Commands) ◄──────────────────────────────────────────────┘
Task 11 (Frontend IPC) ◄── Task 10
Task 12 (Cleanup) ◄── Task 11
```

**Parallelizable:** Tasks 2, 5, 8, 9 can run in parallel after Task 1. Task 3 can also run in parallel. Tasks 4, 6, 7 are sequential. Task 10 waits for all modules. Tasks 11 and 12 are sequential at the end.
