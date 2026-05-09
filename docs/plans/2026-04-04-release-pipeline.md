---
status: 100% complete
last_reviewed: 2026-05-08
---

> **Status: 100% complete.** All 3 tasks done: tauri.conf.json macOS bundle config, GitHub Actions release workflow (.github/workflows/release.yml) with multi-platform builds and Apple signing support, local macOS build script (scripts/build-macos.sh) with --universal flag and npm convenience scripts.

# Release Pipeline Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Create a CI/CD release pipeline and local build script that produce signed macOS app bundles (with signing as a placeholder until Apple Developer credentials are available).

**Architecture:** GitHub Actions release workflow triggered on `v*` tags builds release binaries on all three platforms. macOS builds sign and notarize when Apple credentials are configured as repository secrets, skip gracefully when absent. A local shell script provides the same for dev builds on the developer's Mac.

**Tech Stack:** GitHub Actions, tauri-apps/tauri-action, Tauri v2 code signing env vars, Bash

---

### Task 1: Update tauri.conf.json with macOS bundle config

**Files:**
- Modify: `src-tauri/tauri.conf.json`

**Step 1: Add macOS bundle settings**

Add `category` and `macOS` section to the `bundle` object:

```json
{
  "bundle": {
    "active": true,
    "targets": "all",
    "icon": ["..."],
    "category": "DeveloperTool",
    "macOS": {
      "minimumSystemVersion": "10.13"
    }
  }
}
```

**Step 2: Verify config is valid JSON**

Run: `python3 -c "import json; json.load(open('src-tauri/tauri.conf.json'))"`

**Step 3: Commit**

```bash
git add src-tauri/tauri.conf.json
git commit -m "feat: add macOS bundle config (category, minimum OS version)"
```

---

### Task 2: Create GitHub Actions release workflow

**Files:**
- Create: `.github/workflows/release.yml`

**Step 1: Write the release workflow**

The workflow:
- Triggers on `v*` tags
- Builds on ubuntu-latest, macos-latest (arm64 + x86_64), windows-latest
- Uses `tauri-apps/tauri-action@v0` for build + release creation
- Imports Apple certificate into temporary keychain when secrets are available
- Creates a draft GitHub Release with all platform artifacts

Key env vars for macOS signing (all stored as GitHub repository secrets):
- `APPLE_CERTIFICATE` — base64-encoded .p12 certificate
- `APPLE_CERTIFICATE_PASSWORD` — password for the .p12 file
- `APPLE_SIGNING_IDENTITY` — e.g. "Developer ID Application: Name (TEAMID)"
- `APPLE_ID` — Apple ID email (for notarization)
- `APPLE_PASSWORD` — app-specific password (for notarization)
- `APPLE_TEAM_ID` — Apple Developer Team ID (for notarization)

**Step 2: Validate YAML**

Run: `python3 -c "import yaml; yaml.safe_load(open('.github/workflows/release.yml'))"`

**Step 3: Commit**

```bash
git add .github/workflows/release.yml
git commit -m "feat: add release workflow with macOS signing placeholder"
```

---

### Task 3: Create local macOS build script

**Files:**
- Create: `scripts/build-macos.sh`

**Step 1: Write the build script**

Features:
- Builds Tauri app in release mode
- `--universal` flag for universal binary (arm64 + x86_64)
- Auto-detects signing identity from keychain
- Reports build output locations
- Graceful handling when signing credentials are absent

**Step 2: Make executable and test help**

Run: `chmod +x scripts/build-macos.sh`

**Step 3: Add npm convenience script**

Add to package.json: `"build:macos": "./scripts/build-macos.sh"`

**Step 4: Commit**

```bash
git add scripts/build-macos.sh package.json
git commit -m "feat: add local macOS build script"
```

---

## Setting up signing (when Apple Developer account is ready)

### For GitHub Actions:
1. Export "Developer ID Application" certificate as .p12 from Keychain Access
2. Base64 encode: `base64 -i certificate.p12 | pbcopy`
3. Add repository secrets: `APPLE_CERTIFICATE`, `APPLE_CERTIFICATE_PASSWORD`, `APPLE_SIGNING_IDENTITY`, `APPLE_ID`, `APPLE_PASSWORD`, `APPLE_TEAM_ID`

### For local builds:
1. Install "Developer ID Application" certificate in keychain
2. The build script auto-detects it — no config changes needed
3. For notarization, export: `APPLE_ID`, `APPLE_PASSWORD`, `APPLE_TEAM_ID`
