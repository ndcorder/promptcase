# Promptcase

A desktop app for managing, versioning, and composing LLM prompt templates.

Promptcase stores prompts as Markdown files with YAML frontmatter, giving you
full control over metadata, version history, and template composition. It runs
as a native desktop app powered by Tauri v2, with a Svelte 5 frontend and a
Node.js sidecar for git operations and token counting.

## Features

- **YAML frontmatter metadata** -- tags, variables, model targets, and custom fields on every prompt file
- **Template composition** -- include reusable fragments with `{{> fragment-name}}` syntax
- **Variable substitution** -- `{{variable}}` placeholders with enum value support
- **Git-backed version history** -- view diffs, browse history, and restore previous versions
- **Token counting** -- estimates for multiple models (Claude, GPT-4o)
- **Template linting** -- real-time error and warning display as you edit
- **Full-text search** -- search across all prompts and fragments
- **Code editor** -- dark theme editor powered by CodeMirror 6 with Markdown and YAML support
- **Context menus** -- right-click to rename, duplicate, or delete prompts
- **Command palette** -- quick actions via Cmd+Shift+P, quick open via Cmd+P

## Tech Stack

| Layer | Technology |
|-|-|
| Frontend | Svelte 5, TypeScript, Vite, CodeMirror 6 |
| Backend | Node.js sidecar (simple-git, gray-matter, js-tiktoken, MiniSearch) |
| Desktop | Tauri v2 (Rust) |

## Getting Started

### Prerequisites

- Node.js 20+
- Rust (latest stable)
- Tauri CLI (`npm install -g @tauri-apps/cli`)

### Installation

```bash
git clone https://github.com/promptcase/promptcase
cd promptcase
npm install
npm --prefix sidecar install
```

## Development

Start the Vite dev server (frontend only, with mock backend):

```bash
npm run dev
```

Run the full desktop app with Tauri:

```bash
npm run tauri dev
```

Run tests:

```bash
npm test              # Frontend tests (Vitest)
npm run test:sidecar  # Backend / sidecar tests
npm run test:all      # Both
```

## Building

Build the sidecar and package the desktop app:

```bash
npm run sidecar:build
npm run tauri build
```

The compiled application will be in `src-tauri/target/release/`.

## License

GPL-3.0-only. See [LICENSE](LICENSE) for details.
