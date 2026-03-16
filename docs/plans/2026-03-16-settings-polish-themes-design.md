# Settings, Polish & Themes — Design Document

**Target**: v0.1 release for prompt developers and power users
**Audience**: Developers and AI power users who want speed, keyboard-driven UX, and configurability
**Reference apps**: Querious, Fork, Dataflare, Zed — native macOS, dense, opinionated, no wasted space

---

## 1. Settings System

Separate Tauri window (macOS convention). Cmd+comma opens it.

### Three tabs:

**General**
- Repo path (read-only + "Change..." folder picker)
- Auto-commit toggle
- Commit delay slider (1s–30s)
- Commit prefix text field
- Default model dropdown

**Editor**
- Font family (monospace picker)
- Font size (12–24, stepper)
- Word wrap toggle
- Line numbers toggle
- Show invisibles toggle

**Appearance**
- Theme: Dark / Light radio
- Sidebar position: Left / Right

### Architecture
- Stored in `.promptcase.yaml` (existing config system)
- New `updateConfig` Tauri command for writes
- Changes apply immediately (no "Apply" button)
- Settings window reads via `getConfig`, writes via `updateConfig`

---

## 2. Light Theme

Second set of CSS variable values under `[data-theme="light"]` on `<html>`.

**Light palette:**
- Backgrounds: #ffffff → #f5f5f5 hierarchy
- Text: #1d1d1f primary, grays for secondary/tertiary
- Sidebar: translucent white with vibrancy blur
- Borders: #d1d1d6 (macOS system divider)
- Accent: same macOS blue #0a84ff
- CodeMirror: matching light editor theme

**Behavior:**
- Stored in config, applied immediately
- First launch: detect system preference via `prefers-color-scheme`
- No restart required — swaps `data-theme` attribute live

---

## 3. UI Polish Pass

**Visual tightening:**
- Consistent spacing audit — everything on 4px grid
- Hover/active states on all interactive elements
- Focus rings for keyboard nav (subtle blue, macOS convention)
- Panel show/hide transitions (150ms ease-out)

**Empty states:**
- History: icon + "Save to start tracking versions"
- Problems: checkmark + "No issues"
- Variables: "No variables defined" + hint about {{variable}} syntax

**Loading states:**
- Skeleton pulse for file list
- Thin progress bar at editor top during file open (Zed-style)

**Status bar upgrade:**
- Token count for active model inline
- Git status indicator (clean/dirty)
- Theme icon (moon/sun)

**Micro-interactions:**
- Tab close button on hover only
- Toast slide-in from top-right
- Sidebar items smooth hover highlight

---

## 4. Keyboard Shortcuts & Keybinding Config

**Built-in defaults:**
- Cmd+, → Settings
- Cmd+S → Save
- Cmd+P → Quick Open
- Cmd+B → Toggle sidebar
- Cmd+J → Toggle bottom panel
- Cmd+E → Toggle preview
- Cmd+W → Close tab
- Cmd+Shift+T → Reopen closed tab
- Cmd+1/2/3... → Switch to tab N

**Customization:**
```yaml
keybindings:
  toggleSidebar: Cmd+Shift+B
  save: Ctrl+S
```

**Architecture:**
- `keybindings.ts` store: loads defaults, merges user overrides from config
- Components read from store instead of hardcoding shortcuts
- Settings shows read-only shortcut reference sheet
- Visual rebinder deferred to later version

---

## Out of Scope (v0.1)
- App icon (user handling separately)
- Auto-updater / code signing (later stage)
- Command palette (QuickOpen covers file search)
- LLM provider config (separate project)
- Custom theme engine (dark/light is sufficient)
