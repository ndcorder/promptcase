# Settings, Polish & Themes Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add a settings system, light theme, keybinding configuration, and comprehensive UI polish to make Promptcase feel like a native macOS app on par with Fork/Zed.

**Architecture:** Expand RepoConfig with editor/appearance/keybinding fields, add an `update_config` Tauri command for live writes. Theme switching via a `data-theme` attribute on `<html>` that swaps CSS variable values. Settings presented as a full-screen modal with three tabs. Keybindings centralized in a store that merges defaults with user overrides. UI polish as a systematic pass across all components.

**Tech Stack:** Rust (serde, Tauri commands), Svelte 5 (runes), TypeScript, CSS custom properties, CodeMirror 6 theme API.

---

## Task 1: Expand RepoConfig with new fields (Rust)

Add editor, appearance, and keybinding config fields. Add an `update_config` command.

**Files:**
- Modify: `src-tauri/src/types.rs`
- Modify: `src-tauri/src/config.rs`
- Modify: `src-tauri/src/commands.rs`
- Modify: `src-tauri/src/main.rs`
- Modify: `src/lib/ipc.ts`
- Modify: `src/lib/types.ts`

**Step 1: Add new fields to RepoConfig**

In `src-tauri/src/types.rs`, add to `RepoConfig`:

```rust
// Editor
#[serde(default = "default_editor_font_family")]
pub editor_font_family: String,
#[serde(default = "default_editor_font_size")]
pub editor_font_size: u16,
#[serde(default)]
pub editor_word_wrap: bool,
#[serde(default = "default_true")]
pub editor_line_numbers: bool,
#[serde(default)]
pub editor_show_invisibles: bool,

// Appearance
#[serde(default = "default_theme")]
pub theme: String,
#[serde(default = "default_sidebar_position")]
pub sidebar_position: String,

// Keybindings (user overrides only — empty by default)
#[serde(default)]
pub keybindings: HashMap<String, String>,
```

Add default helper functions:

```rust
fn default_editor_font_family() -> String { "Fira Code".into() }
fn default_editor_font_size() -> u16 { 14 }
fn default_true() -> bool { true }
fn default_theme() -> String { "dark".into() }
fn default_sidebar_position() -> String { "left".into() }
```

Update `Default for RepoConfig` to include all new fields with matching defaults.

**Step 2: Update merge_config in config.rs**

Add all new fields to the `merge_config` function:

```rust
editor_font_family: parsed.editor_font_family,
editor_font_size: parsed.editor_font_size,
editor_word_wrap: parsed.editor_word_wrap,
editor_line_numbers: parsed.editor_line_numbers,
editor_show_invisibles: parsed.editor_show_invisibles,
theme: parsed.theme,
sidebar_position: parsed.sidebar_position,
keybindings: parsed.keybindings,
```

**Step 3: Add update_config Tauri command**

In `src-tauri/src/commands.rs`:

```rust
#[tauri::command]
pub fn update_config(
    state: tauri::State<'_, AppState>,
    updates: serde_json::Value,
) -> Result<RepoConfig, AppError> {
    // Read current config from disk (not from state — state.config is immutable)
    let mut config = crate::config::load_config(&state.repo_root)?;

    // Merge updates into config
    let mut config_value = serde_json::to_value(&config)
        .map_err(|e| AppError::Custom(format!("Failed to serialize config: {e}")))?;
    if let (Some(base), Some(updates)) = (config_value.as_object_mut(), updates.as_object()) {
        for (k, v) in updates {
            base.insert(k.clone(), v.clone());
        }
    }
    config = serde_json::from_value(config_value)
        .map_err(|e| AppError::Custom(format!("Failed to deserialize config: {e}")))?;

    // Save to disk
    crate::config::save_config(&state.repo_root, &config)?;

    Ok(config)
}
```

Register in `main.rs` invoke_handler: `commands::update_config`.

**Step 4: Update TypeScript types and IPC**

In `src/lib/types.ts`, update `RepoConfig`:

```typescript
export interface RepoConfig {
  version: number;
  defaultModel: string;
  autoCommit: boolean;
  commitPrefix: string;
  commitDelayMs: number;
  tokenCountModels: string[];
  lintRules: Record<string, "error" | "warning" | "info">;
  // Editor
  editorFontFamily: string;
  editorFontSize: number;
  editorWordWrap: boolean;
  editorLineNumbers: boolean;
  editorShowInvisibles: boolean;
  // Appearance
  theme: string;
  sidebarPosition: string;
  // Keybindings
  keybindings: Record<string, string>;
}
```

In `src/lib/ipc.ts`, add to `api`:

```typescript
updateConfig: (updates: Partial<RepoConfig>) =>
  call<RepoConfig>("update_config", { updates }),
```

**Step 5: Write tests and verify**

Add Rust tests in `config.rs`:
- `test_update_config_round_trip`: save default, update one field, verify it persists
- `test_new_config_fields_defaults`: verify all new fields have correct defaults
- `test_config_backward_compat`: YAML without new fields still loads (serde defaults)

Run: `cd src-tauri && cargo test`
Expected: All tests pass.

**Step 6: Commit**

```
Expand RepoConfig with editor, appearance, and keybinding fields

Add update_config Tauri command for live config writes.
New fields: editorFontFamily, editorFontSize, editorWordWrap,
editorLineNumbers, editorShowInvisibles, theme, sidebarPosition,
keybindings. All backward-compatible with serde defaults.
```

---

## Task 2: Light theme CSS variables

Create the light theme variable set alongside the existing dark theme.

**Files:**
- Modify: `src/lib/styles/theme.css`

**Step 1: Wrap existing variables in a dark theme scope**

Move ALL existing `:root` variables into `:root, [data-theme="dark"]` selector. This makes dark the default while allowing explicit override.

**Step 2: Add light theme variables**

Add `[data-theme="light"]` block with light palette values:

```css
[data-theme="light"] {
  /* Backgrounds */
  --bg-primary: #ffffff;
  --bg-secondary: #f5f5f7;
  --bg-tertiary: #ebebed;
  --bg-quaternary: #e0e0e2;
  --sidebar-bg: rgba(246, 246, 248, 0.85);
  --sidebar-blur: 20px;

  /* Text */
  --text-primary: #1d1d1f;
  --text-secondary: #6e6e73;
  --text-tertiary: #86868b;
  --text-quaternary: #aeaeb2;

  /* Accent — same blue works on both themes */
  --accent: #0a84ff;
  --accent-hover: #0077ed;
  --accent-subtle: rgba(10, 132, 255, 0.12);
  --accent-selection: rgba(10, 132, 255, 0.2);

  /* Borders */
  --border-primary: #d1d1d6;
  --border-secondary: #e5e5ea;
  --border-focus: rgba(10, 132, 255, 0.6);

  /* Semantic */
  --color-error: #ff3b30;
  --color-error-subtle: rgba(255, 59, 48, 0.12);
  --color-warning: #ff9500;
  --color-warning-subtle: rgba(255, 149, 0, 0.12);
  --color-success: #34c759;
  --color-success-subtle: rgba(52, 199, 89, 0.12);
  --color-info: #5ac8fa;

  /* Template syntax */
  --color-variable: #af52de;
  --color-variable-subtle: rgba(175, 82, 222, 0.12);
  --color-include: #ff9500;
  --color-include-subtle: rgba(255, 149, 0, 0.12);

  /* Shadows — lighter for light theme */
  --shadow-sm: 0 1px 2px rgba(0, 0, 0, 0.06);
  --shadow-md: 0 2px 8px rgba(0, 0, 0, 0.08);
  --shadow-lg: 0 4px 16px rgba(0, 0, 0, 0.1);
  --shadow-xl: 0 8px 32px rgba(0, 0, 0, 0.12);
  --shadow-popover: 0 4px 24px rgba(0, 0, 0, 0.15);
}
```

Typography, spacing, radii, and transitions stay the same across themes (no override needed).

**Step 3: Verify no visual regression in dark mode**

Run `npm run tauri dev`, confirm the app still looks identical (dark is still the default).

**Step 4: Test light mode manually**

In browser console: `document.documentElement.setAttribute('data-theme', 'light')` — verify all panels, editor, sidebar, tabs render correctly with the light palette.

**Step 5: Commit**

```
Add light theme CSS variables

Dark theme remains default. Light theme activated via
data-theme="light" attribute on <html>. All 42 color/shadow
variables overridden; typography/spacing/radii shared.
```

---

## Task 3: Theme store and live switching

Create a reactive theme store that syncs with config and applies the `data-theme` attribute.

**Files:**
- Create: `src/lib/stores/theme.ts`
- Modify: `src/main.ts`

**Step 1: Create theme store**

```typescript
import { writable, get } from "svelte/store";
import { api } from "../ipc";

export type Theme = "dark" | "light";

export const currentTheme = writable<Theme>("dark");

/** Apply theme to DOM and persist to config. */
export async function setTheme(theme: Theme): Promise<void> {
  currentTheme.set(theme);
  document.documentElement.setAttribute("data-theme", theme);
  try {
    await api.updateConfig({ theme });
  } catch (err) {
    console.warn("Failed to persist theme:", err);
  }
}

/** Initialize theme from config, falling back to system preference. */
export async function initTheme(): Promise<void> {
  try {
    const config = await api.getConfig();
    const theme = config.theme === "light" ? "light" : "dark";
    currentTheme.set(theme);
    document.documentElement.setAttribute("data-theme", theme);
  } catch {
    // Fall back to system preference
    const prefersDark = window.matchMedia("(prefers-color-scheme: dark)").matches;
    const theme = prefersDark ? "dark" : "light";
    currentTheme.set(theme);
    document.documentElement.setAttribute("data-theme", theme);
  }
}
```

**Step 2: Initialize theme on app start**

In `src/main.ts`, add before the Svelte mount:

```typescript
import { initTheme } from "./lib/stores/theme";
initTheme();
```

**Step 3: Verify**

Run `npm run tauri dev`. App should load in the configured theme. Calling `setTheme("light")` from console should switch immediately.

**Step 4: Commit**

```
Add theme store with live switching and config persistence
```

---

## Task 4: Keybinding system

Centralize all keyboard shortcuts in a store with user-configurable overrides.

**Files:**
- Create: `src/lib/stores/keybindings.ts`
- Modify: `src/App.svelte` (replace hardcoded keydown handler)
- Modify: `src/main.ts` (remove browser shortcut blocking — move to keybindings)

**Step 1: Create keybindings store**

```typescript
import { api } from "../ipc";

/** All available actions with their default shortcuts. */
const DEFAULTS: Record<string, string> = {
  save: "Cmd+S",
  openQuickOpen: "Cmd+P",
  toggleSidebar: "Cmd+B",
  toggleBottomPanel: "Cmd+J",
  togglePreview: "Cmd+E",
  closeTab: "Cmd+W",
  openSettings: "Cmd+,",
  switchTab1: "Cmd+1",
  switchTab2: "Cmd+2",
  switchTab3: "Cmd+3",
  switchTab4: "Cmd+4",
  switchTab5: "Cmd+5",
  switchTab6: "Cmd+6",
  switchTab7: "Cmd+7",
  switchTab8: "Cmd+8",
  switchTab9: "Cmd+9",
};

let bindings: Record<string, string> = { ...DEFAULTS };
let actionHandlers: Record<string, () => void> = {};

/** Load user keybinding overrides from config. */
export async function initKeybindings(): Promise<void> {
  try {
    const config = await api.getConfig();
    bindings = { ...DEFAULTS, ...config.keybindings };
  } catch {
    // use defaults
  }
}

/** Register a handler for an action. */
export function registerAction(action: string, handler: () => void): void {
  actionHandlers[action] = handler;
}

/** Get the current shortcut string for an action (for display). */
export function getShortcut(action: string): string {
  return bindings[action] || "";
}

/** Get all action names and their current shortcuts. */
export function getAllShortcuts(): Array<{ action: string; shortcut: string }> {
  return Object.entries(bindings).map(([action, shortcut]) => ({
    action,
    shortcut,
  }));
}

/** Parse a shortcut string into a matcher. */
function parseShortcut(shortcut: string): {
  meta: boolean; ctrl: boolean; shift: boolean; alt: boolean; key: string;
} {
  const parts = shortcut.toLowerCase().split("+");
  return {
    meta: parts.includes("cmd") || parts.includes("meta"),
    ctrl: parts.includes("ctrl"),
    shift: parts.includes("shift"),
    alt: parts.includes("alt") || parts.includes("option"),
    key: parts[parts.length - 1],
  };
}

function matchesEvent(shortcut: string, e: KeyboardEvent): boolean {
  const parsed = parseShortcut(shortcut);
  const isMac = navigator.platform.includes("Mac");
  const metaMatch = isMac ? e.metaKey === parsed.meta : e.ctrlKey === (parsed.meta || parsed.ctrl);
  return (
    metaMatch &&
    e.shiftKey === parsed.shift &&
    e.altKey === parsed.alt &&
    e.key.toLowerCase() === parsed.key
  );
}

/** Global keydown handler — attach once in main.ts */
export function handleGlobalKeydown(e: KeyboardEvent): void {
  // Block browser shortcuts
  const isMeta = e.metaKey || e.ctrlKey;
  if ((isMeta && e.key === "r") || e.key === "F5") { e.preventDefault(); return; }
  if ((isMeta && e.altKey && e.key === "i") || e.key === "F12") { e.preventDefault(); return; }
  if (isMeta && e.key === "u") { e.preventDefault(); return; }

  // Match against registered bindings
  for (const [action, shortcut] of Object.entries(bindings)) {
    if (matchesEvent(shortcut, e)) {
      e.preventDefault();
      actionHandlers[action]?.();
      return;
    }
  }
}
```

**Step 2: Wire up in main.ts**

Replace the existing `document.addEventListener("keydown", ...)` block with:

```typescript
import { initKeybindings, handleGlobalKeydown } from "./lib/stores/keybindings";

initKeybindings();
document.addEventListener("keydown", handleGlobalKeydown);
```

**Step 3: Register actions in App.svelte**

Replace the hardcoded keydown handler in App.svelte with action registrations:

```typescript
import { registerAction } from "$lib/stores/keybindings";

// In component initialization (onMount or $effect):
registerAction("save", () => saveFile());
registerAction("openQuickOpen", () => showQuickOpen = true);
registerAction("toggleSidebar", () => showSidebar.update(v => !v));
registerAction("toggleBottomPanel", () => showBottomPanel.update(v => !v));
registerAction("togglePreview", () => showPreview.update(v => !v));
registerAction("closeTab", () => { /* close active tab */ });
registerAction("openSettings", () => showSettings = true);
// Tab switching: registerAction("switchTab1", () => switchToTab(0)); etc.
```

Remove the `onkeydown` handler from App.svelte that currently handles these shortcuts.

**Step 4: Remove browser shortcut blocking from main.ts**

The `handleGlobalKeydown` function in keybindings.ts now handles browser shortcut blocking. Remove the separate `document.addEventListener("keydown", ...)` block from main.ts.

**Step 5: Verify all shortcuts still work**

Test: Cmd+S saves, Cmd+P opens QuickOpen, Cmd+B toggles sidebar, Cmd+J toggles bottom panel, Cmd+E toggles preview.

**Step 6: Commit**

```
Centralize keyboard shortcuts in keybinding store with user overrides
```

---

## Task 5: Settings modal

Full-screen modal with three tabs: General, Editor, Appearance.

**Files:**
- Create: `src/lib/components/SettingsModal.svelte`
- Modify: `src/App.svelte` (add settings modal + trigger)

**Step 1: Create SettingsModal.svelte**

The component should:
- Take over the full window with a centered panel (~600px wide, ~500px tall)
- Semi-transparent backdrop with blur
- Three tabs across the top: General | Editor | Appearance
- Each tab renders its controls
- Close button (X) in top-right, also closes on Escape
- All changes call `api.updateConfig()` immediately (no Apply button)
- Load config on mount via `api.getConfig()`

**Tab: General**
- Repo path: read-only text display (from `api.gitStatus()` repoPath)
- Auto-commit: toggle switch (writes `autoCommit`)
- Commit delay: range slider 1000–30000 with ms label (writes `commitDelayMs`)
- Commit prefix: text input (writes `commitPrefix`)
- Default model: text input or dropdown (writes `defaultModel`)

**Tab: Editor**
- Font family: text input with common monospace suggestions (writes `editorFontFamily`)
- Font size: number stepper 12–24 (writes `editorFontSize`)
- Word wrap: toggle (writes `editorWordWrap`)
- Line numbers: toggle (writes `editorLineNumbers`)
- Show invisibles: toggle (writes `editorShowInvisibles`)

**Tab: Appearance**
- Theme: two radio buttons — Dark / Light (writes `theme`, calls `setTheme()`)
- Sidebar position: two radio buttons — Left / Right (writes `sidebarPosition`)
- Keyboard shortcuts: read-only table of all shortcuts from `getAllShortcuts()`

**Styling guidelines:**
- Match the existing app aesthetic (use CSS variables, same border/radius/spacing tokens)
- Labels left-aligned, controls right-aligned in each row
- Subtle section dividers between groups
- Active tab has accent underline

**Step 2: Add to App.svelte**

```svelte
<script>
  let showSettings = $state(false);
  // registerAction("openSettings", ...) already wired in Task 4
</script>

{#if showSettings}
  <SettingsModal onclose={() => showSettings = false} />
{/if}
```

**Step 3: Make editor react to config changes**

The Editor component (CodeMirror) needs to apply font family, font size, word wrap, line numbers, and show invisibles from config. Read config on mount and when settings change.

Options:
- Store editor settings in a Svelte store (like `editorConfig`)
- Editor.svelte subscribes and reconfigures CodeMirror when they change

Create a minimal `editorConfig` store in `src/lib/stores/editor.ts`:

```typescript
export const editorConfig = writable({
  fontFamily: "Fira Code",
  fontSize: 14,
  wordWrap: false,
  lineNumbers: true,
  showInvisibles: false,
});

export async function loadEditorConfig(): Promise<void> {
  const config = await api.getConfig();
  editorConfig.set({
    fontFamily: config.editorFontFamily,
    fontSize: config.editorFontSize,
    wordWrap: config.editorWordWrap,
    lineNumbers: config.editorLineNumbers,
    showInvisibles: config.editorShowInvisibles,
  });
}
```

In `SettingsModal`, after each `api.updateConfig()` call for editor fields, also update `editorConfig` store so the editor reacts immediately.

In `Editor.svelte`, subscribe to `editorConfig` and apply changes to the CodeMirror instance via `view.dispatch({ effects: ... })`.

**Step 4: Make sidebar position reactive**

In `App.svelte`, the grid layout should flip sidebar/inspector columns when `sidebarPosition` is "right". Read from a store or config.

**Step 5: Verify**

- Cmd+, opens Settings
- Each control persists to `.promptcase.yaml`
- Theme switch works live
- Editor font/size changes apply immediately
- Sidebar swaps sides
- Escape or X closes settings

**Step 6: Commit**

```
Add Settings modal with General, Editor, and Appearance tabs
```

---

## Task 6: UI polish — visual consistency

Systematic pass across all components for spacing, hover states, focus rings, and transitions.

**Files:**
- Modify: `src/lib/styles/theme.css` (add any missing utility variables)
- Modify: Multiple component `<style>` blocks

**Step 1: Spacing audit**

Check all components use `--space-*` variables (not raw px values). Fix any hardcoded values. Ensure consistent padding:
- Panel headers: `--space-3` padding
- List items: `--space-2` vertical, `--space-3` horizontal
- Buttons: `--space-2` vertical, `--space-3` horizontal
- Section gaps: `--space-4`

**Step 2: Hover and active states**

Ensure every interactive element has hover and active states:
- Sidebar file items: smooth background transition on hover
- Tab bar tabs: hover highlight
- Buttons: darken on hover, further darken on active
- Tag pills in MetadataPanel: hover highlight
- Context menu items: already have hover (verify)

Use `--transition-fast` (100ms) for all hover transitions.

**Step 3: Focus rings**

Add focus-visible styles for keyboard navigation:

```css
:focus-visible {
  outline: 2px solid var(--border-focus);
  outline-offset: 2px;
}
```

Add this to `app.css` as a global rule. Override on specific components where the default outline doesn't fit (e.g., tabs, sidebar items — use `box-shadow` instead).

**Step 4: Panel transitions**

Add smooth show/hide transitions for sidebar, inspector, and bottom panel. In `App.svelte`, use CSS transitions on the grid columns:

```css
.layout {
  transition: grid-template-columns var(--transition-base) ease;
}
```

When sidebar/inspector/bottom panel are hidden, transition the column width to 0.

**Step 5: Commit**

```
UI polish: spacing consistency, hover states, focus rings, panel transitions
```

---

## Task 7: UI polish — empty states, loading states, status bar

**Files:**
- Modify: `src/lib/components/HistoryPanel.svelte`
- Modify: `src/lib/components/ProblemsPanel.svelte` (or equivalent)
- Modify: `src/lib/components/VariablesPanel.svelte`
- Modify: `src/lib/components/Sidebar.svelte`
- Modify: `src/lib/components/StatusBar.svelte`
- Modify: `src/lib/components/Editor.svelte`

**Step 1: Empty states**

Replace plain text empty messages with styled empty states:

**HistoryPanel**: Icon (clock or history symbol using unicode/CSS) + "Save to start tracking versions" in `--text-tertiary`, italic.

**ProblemsPanel**: Checkmark icon + "No issues" in `--color-success`.

**VariablesPanel**: "No variables defined" + small hint: "Use {{name}} syntax in your prompt".

Style: centered vertically in the panel, `--text-tertiary` color, `--font-size-sm`.

**Step 2: Loading states**

**Sidebar file list**: When `isLoading` is true, show 4–5 skeleton pulse bars (rectangular divs with a shimmer animation):

```css
@keyframes skeleton-pulse {
  0%, 100% { opacity: 0.15; }
  50% { opacity: 0.25; }
}
.skeleton {
  background: var(--text-quaternary);
  animation: skeleton-pulse 1.5s ease-in-out infinite;
  border-radius: var(--radius-sm);
  height: 20px;
}
```

**Editor**: When loading a file, show a thin 2px progress bar at the top of the editor area, accent color, animated width from 0% to 100% over 300ms. Remove on load complete.

**Step 3: Status bar upgrade**

Update `StatusBar.svelte` to show:

Left side:
- File type label ("Prompt" / "Fragment")
- Error count (red) + Warning count (yellow) — already exists
- Git status: small dot (green for clean, orange for dirty)

Right side:
- Token counts — already exists
- Theme toggle icon: 🌙 / ☀ (clickable, calls `setTheme`)
- Line/column if cursor position is available

**Step 4: Commit**

```
UI polish: empty states, loading skeletons, status bar upgrade
```

---

## Task 8: UI polish — micro-interactions

**Files:**
- Modify: `src/lib/components/EditorTabs.svelte`
- Modify: `src/lib/components/ToastContainer.svelte`
- Modify: `src/lib/components/Sidebar.svelte`

**Step 1: Tab close button on hover**

In `EditorTabs.svelte`, the close button (X) on each tab should be:
- Hidden by default (`opacity: 0`)
- Visible on tab hover (`opacity: 1` with `--transition-fast`)
- Always visible on the active tab
- Always visible if the tab is modified (unsaved)

```css
.tab .close-btn {
  opacity: 0;
  transition: opacity var(--transition-fast);
}
.tab:hover .close-btn,
.tab.active .close-btn,
.tab.modified .close-btn {
  opacity: 1;
}
```

**Step 2: Toast slide-in animation**

In `ToastContainer.svelte`, toasts should slide in from the top-right:

```css
@keyframes toast-in {
  from {
    transform: translateX(100%);
    opacity: 0;
  }
  to {
    transform: translateX(0);
    opacity: 1;
  }
}

.toast {
  animation: toast-in 200ms ease-out;
}
```

Also add a fade-out on dismiss.

**Step 3: Sidebar hover highlights**

Ensure sidebar file items have a smooth hover transition:

```css
.file-item {
  transition: background var(--transition-fast);
  border-radius: var(--radius-sm);
}
.file-item:hover {
  background: var(--accent-subtle);
}
.file-item.active {
  background: var(--accent-selection);
}
```

**Step 4: Commit**

```
UI polish: tab close hover, toast animations, sidebar hover highlights
```

---

## Dependency Order

```
Task 1 (Config expansion) ─┬─> Task 3 (Theme store)  ─┬─> Task 5 (Settings modal)
                            │                           │
Task 2 (Light theme CSS) ──┘                           │
                                                        │
Task 4 (Keybinding system) ────────────────────────────┘

Task 6 (Visual polish)  ──── independent, any time after Task 2
Task 7 (States + status bar) ── independent, any time after Task 3
Task 8 (Micro-interactions) ── independent, any time
```

**Recommended execution order**: 1 → 2 → 3 → 4 → 5 → 6 → 7 → 8

Tasks 6, 7, 8 are independent and can run in any order after their dependencies are met.

---

## Batching for Subagent Execution

| Batch | Tasks | Focus |
|-|-|-|
| A | 1, 2 | Rust config + light theme CSS |
| B | 3, 4 | Theme store + keybinding system |
| C | 5 | Settings modal (largest single task) |
| D | 6, 7, 8 | All UI polish |
