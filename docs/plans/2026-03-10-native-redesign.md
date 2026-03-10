# Native macOS Redesign + Prompt/Fragment Unification

## Summary

Redesigned Promptcase to feel like a native macOS dark-mode app and removed the artificial prompt/fragment type distinction.

## Changes

### 1. Removed Prompt/Fragment Distinction (UI only)
- Sidebar: single "New Prompt" button (removed "New Fragment")
- MetadataPanel: removed Type badge/field
- StatusBar: always shows "Prompt" (no conditional)
- FolderTree: uniform file icons (SVG document icon, no P/F badges)
- Duplicate: always creates with type "prompt"
- Backend types preserved for backward compatibility — existing `type: fragment` files work fine, the field is just ignored in UI

### 2. macOS Native Design System
Created `src/lib/styles/theme.css` with CSS custom properties:
- **Colors**: macOS Sonoma dark palette (#1e1e1e backgrounds, rgba borders, system blue #0a84ff accent)
- **Typography**: SF Pro via -apple-system, 13px base, tight letter-spacing
- **Spacing**: 4px base scale
- **Radii**: 4/6/10/14px
- **Shadows**: depth-based shadow scale
- **Transitions**: 100-250ms ease-out

Created `src/lib/styles/native.css`:
- Thin overlay scrollbars
- Native selection color
- Custom focus rings (blue glow)
- Disabled web-style outlines
- Platform overscroll behavior

### 3. Tauri Window Config
- `titleBarStyle: "Overlay"` — traffic lights sit on content
- `hiddenTitle: true` — no title text in titlebar
- Sidebar header has 52px top padding for traffic light clearance

### 4. Component Restyling
Every component updated to use CSS variables:
- Sidebar: translucent background with backdrop-filter blur
- FolderTree: SVG chevrons/file icons, rounded selection with accent-subtle
- EditorTabs: subtle tab separators, accent underline for active tab
- Dialogs/overlays: backdrop blur, larger radii, new shadow scale
- Context menu: macOS-style with accent highlight on hover
- All "x" buttons → SVG icons
- All hardcoded hex colors → CSS variables

### 5. CodeMirror Theme
Updated to match:
- macOS system colors for syntax highlighting
- Blue cursor and selection
- Translucent gutter backgrounds
- Tooltip styling with proper radii and shadows
