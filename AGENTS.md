# AGENTS.md

## Project Summary

Promptcase is a local-first desktop app for managing prompt templates stored as Markdown files with YAML frontmatter. The current implementation is a Tauri v2 app with:

- `src/`: Svelte 5 + TypeScript frontend
- `src-tauri/`: Rust backend exposed through Tauri commands
- `tests/`: Vitest coverage for frontend stores and Tauri config

Important: some docs still describe an older Node.js sidecar architecture. For implementation work, trust `package.json`, `src/`, `src-tauri/`, and tests over older planning text or README wording.

## Source Of Truth

Use this precedence when the repo disagrees with itself:

1. Runtime code in `src-tauri/src/*.rs` and `src/**/*.ts|svelte`
2. Tests in `tests/` and inline Rust module tests
3. Build/config files such as `package.json`, `vite.config.ts`, `src-tauri/Cargo.toml`, and `src-tauri/tauri.conf.json`
4. Docs in `README.md` and `docs/plans/*.md`

Current example of drift: the README and some plan docs mention a Node sidecar, but the shipping code is Rust-only Tauri IPC.

## Repo Layout

- `src/App.svelte`: top-level app shell and panel layout
- `src/lib/components/`: UI components
- `src/lib/stores/`: shared Svelte stores for files, editor state, keybindings, theme, layout, commits, and toasts
- `src/lib/ipc.ts`: frontend Tauri API wrapper; command names must match Rust snake_case commands exactly
- `src/lib/types.ts`: frontend mirror of backend data contracts
- `src/lib/codemirror/`: editor theme, autocomplete, and template highlighting
- `src/lib/styles/theme.css` and `src/lib/styles/native.css`: design tokens and platform-native styling
- `src-tauri/src/commands.rs`: Tauri command boundary
- `src-tauri/src/file_ops.rs`: filesystem CRUD and path safety
- `src-tauri/src/git_ops.rs`: git history, diffs, restore, and commit message generation
- `src-tauri/src/frontmatter.rs`: Markdown/YAML parsing and serialization
- `src-tauri/src/template.rs`: include resolution and variable substitution
- `src-tauri/src/linter.rs`: prompt lint rules
- `src-tauri/src/search.rs`: in-memory search index
- `src-tauri/src/config.rs`: `.promptcase.yaml` loading/saving and repo scaffolding

## Development Commands

- `npm install`
- `npm run dev`
- `npm run tauri dev`
- `npm test`
- `npm run test:rust`
- `npm run test:all`

If you change only Rust code, `cd src-tauri && cargo test` is enough. For cross-boundary changes, run both frontend and Rust tests.

## Frontend Conventions

- Use Svelte 5 patterns already present in the repo:
  - `$state`, `$derived`, `$effect` inside components
  - `svelte/store` for shared app state in `src/lib/stores/*`
- Keep app-wide state in stores, not ad hoc component-local duplication.
- Use the existing CSS variable system in `theme.css`; avoid hardcoded colors when touching UI.
- Preserve the dense native-desktop feel. Existing UI styling intentionally targets a macOS/Fork/Zed-like desktop app, not a generic web app.
- `Editor.svelte` lazy-loads CodeMirror modules. Keep heavyweight editor dependencies lazy unless there is a strong reason not to.
- Keyboard shortcuts are centralized in `src/lib/stores/keybindings.ts`. Do not hardcode new shortcuts in random components.

## Backend Conventions

- All frontend/backend API changes must stay synchronized across:
  - `src-tauri/src/commands.rs`
  - `src-tauri/src/main.rs`
  - `src/lib/ipc.ts`
  - `src/lib/types.ts` or `src-tauri/src/types.rs` as needed
- Preserve filesystem safety:
  - use `safe_path()` for repo-root-relative file access
  - use `validate_commit_ref()` and `validate_file_path()` for git-facing inputs
- After file or folder mutations, keep the in-memory search index updated. Existing command handlers already do this pattern; follow it.
- `write_file()` writes to disk only. Debounced git commits are scheduled by the frontend commit store.
- Create/delete/move operations still auto-commit when `auto_commit` is enabled.
- Hidden directories, `node_modules`, and `_templates` are intentionally excluded from prompt listing/search.

## Config And Repo Initialization

- The app repo root is chosen from:
  - first CLI argument
  - `PROMPTCASE_REPO`
  - fallback `~/prompts`
- `commands::setup()` ensures repo scaffolding exists:
  - `.promptcase.yaml`
  - `.gitignore`
  - `_templates/`
  - default prompt folder scaffold with `.gitkeep`
- User settings live in `.promptcase.yaml`.

Current behavior to keep in mind: `update_config` persists config to disk, but `AppState.config` is initialized once during setup. Some frontend settings also update local stores immediately, so UI changes can appear live even though backend state may still be using the startup snapshot.

## Testing Expectations

- Frontend tests use Vitest with `jsdom`.
- Rust tests live inline under `#[cfg(test)]` in backend modules.
- Prefer adding tests near the code you change:
  - frontend store behavior in `tests/stores/*.test.ts`
  - backend behavior in the affected Rust module
- For security-sensitive file or git changes, preserve or extend the existing traversal/validation coverage.

## Known Constraints

- Tauri capabilities are intentionally minimal in `src-tauri/capabilities/default.json`.
  - no shell permissions
  - only core defaults plus window dragging/maximize permissions
- `tauri.conf.json` CSP is explicitly tested; do not loosen it casually.
- The repo may contain generated icon changes unrelated to your task. Do not revert unrelated user work.

## Practical Editing Rules

- If you change prompt/file/folder behavior, inspect both the Rust operation and the Svelte store/component flow.
- If you change prompt metadata or serialization, inspect both `frontmatter.rs` and the TS interfaces.
- If you change search behavior, verify indexing on create, write, move, rename, duplicate, delete, and reindex paths.
- If you change commit behavior, inspect both `src/lib/stores/commit.ts` and `src-tauri/src/git_ops.rs`.
- If docs conflict with code, update docs only after confirming the live behavior in code.
