#!/usr/bin/env bash
set -euo pipefail

# Promptcase — local macOS build script
#
# Usage:
#   ./scripts/build-macos.sh              Build for current architecture
#   ./scripts/build-macos.sh --universal  Build universal binary (arm64 + x86_64)
#
# Code signing:
#   If a "Developer ID Application" certificate is in your keychain,
#   the app is signed automatically by Tauri.
#
# Notarization:
#   export APPLE_ID="your@email.com"
#   export APPLE_PASSWORD="app-specific-password"
#   export APPLE_TEAM_ID="XXXXXXXXXX"
#   ./scripts/build-macos.sh

TAURI_ARGS=""
BUNDLE_DIR="src-tauri/target/release/bundle"

for arg in "$@"; do
  case $arg in
    --universal)
      TAURI_ARGS="--target universal-apple-darwin"
      BUNDLE_DIR="src-tauri/target/universal-apple-darwin/release/bundle"
      ;;
    -h|--help)
      head -14 "$0" | tail -12
      exit 0
      ;;
    *)
      echo "Unknown argument: $arg"
      echo "Usage: $0 [--universal]"
      exit 1
      ;;
  esac
done

# ── Prerequisites ────────────────────────────────────────────────

if [[ "$(uname)" != "Darwin" ]]; then
  echo "Error: this script only runs on macOS"
  exit 1
fi

if ! command -v cargo &>/dev/null; then
  echo "Error: Rust toolchain not found — install from https://rustup.rs"
  exit 1
fi

if ! command -v node &>/dev/null; then
  echo "Error: Node.js not found"
  exit 1
fi

# ── Rust targets ─────────────────────────────────────────────────

if [[ "$TAURI_ARGS" == *"universal"* ]]; then
  echo "==> Installing universal build targets"
  rustup target add aarch64-apple-darwin x86_64-apple-darwin
fi

# ── Signing identity ─────────────────────────────────────────────

echo "==> Checking for signing identity"
if security find-identity -v -p codesigning 2>/dev/null | grep -q "Developer ID Application"; then
  IDENTITY=$(security find-identity -v -p codesigning | grep "Developer ID Application" | head -1 | sed 's/.*"\(.*\)".*/\1/')
  echo "    Found: $IDENTITY"
  export APPLE_SIGNING_IDENTITY="$IDENTITY"
else
  echo "    No 'Developer ID Application' certificate found — build will be unsigned"
  echo "    To sign: install a certificate from your Apple Developer account"
fi

# ── Notarization check ───────────────────────────────────────────

if [[ -n "${APPLE_ID:-}" && -n "${APPLE_PASSWORD:-}" && -n "${APPLE_TEAM_ID:-}" ]]; then
  echo "==> Notarization credentials detected"
else
  echo "==> Notarization skipped (set APPLE_ID, APPLE_PASSWORD, APPLE_TEAM_ID to enable)"
fi

# ── Build ────────────────────────────────────────────────────────

echo "==> Installing npm dependencies"
npm ci

echo "==> Building frontend"
npm run build

echo "==> Installing tauri-cli"
if ! cargo tauri --version &>/dev/null; then
  cargo install tauri-cli@^2
fi

echo "==> Building Tauri app (release mode)"
# shellcheck disable=SC2086
cargo tauri build $TAURI_ARGS

# ── Output ───────────────────────────────────────────────────────

echo ""
echo "==> Build complete!"
echo ""

if ls "$BUNDLE_DIR/dmg/"*.dmg &>/dev/null 2>&1; then
  echo "DMG:"
  ls -lh "$BUNDLE_DIR/dmg/"*.dmg
  echo ""
fi

if [ -d "$BUNDLE_DIR/macos/" ]; then
  echo "App bundle:"
  ls -lhd "$BUNDLE_DIR/macos/"*.app 2>/dev/null || true
fi
