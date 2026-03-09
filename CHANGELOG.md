# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/),
and this project adheres to [Semantic Versioning](https://semver.org/).

## [1.0.0] - 2026-03-09

### Added
- Desktop app for managing prompt templates with fragment composition
- Sidebar with prompt and fragment file tree, including new file and empty state UI
- Right-click context menu for renaming, duplicating, and deleting files
- Tag editing in the metadata panel
- Copy-to-clipboard for resolved prompts (with raw/resolved options in command palette)
- Save button in the tab bar
- Dev-mode mock backend with localStorage persistence for working without the sidecar
- Placeholder app icons for Tauri build

### Fixed
- Window.prompt and window.confirm dialogs replaced with custom dialogs (native browser dialogs are blocked in Tauri WebView)
- Tauri v2 shell plugin configuration and sidecar capability scoping
- Restored missing serde/serde_json dependencies required by Tauri build

### Security
- Fixed three path traversal vulnerabilities in the sidecar backend
