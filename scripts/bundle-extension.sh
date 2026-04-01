#!/usr/bin/env bash
# Bundle the Chrome extension for Web Store submission.
# Produces: releases/nextslide-extension-v{version}.zip
#
# Usage:
#   ./scripts/bundle-extension.sh           # build + zip
#   ./scripts/bundle-extension.sh --no-build  # zip existing dist (skip build)
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
DIST_DIR="$REPO_ROOT/apps/extension/dist"
MANIFEST="$REPO_ROOT/apps/extension/public/manifest.json"
RELEASES_DIR="$REPO_ROOT/releases"

# Read version from manifest
VERSION=$(node -e "process.stdout.write(require('$MANIFEST').version)")

ZIP_NAME="nextslide-extension-v${VERSION}.zip"
ZIP_PATH="$RELEASES_DIR/$ZIP_NAME"

# ── Build ──────────────────────────────────────────────────────────────────
if [[ "${1:-}" != "--no-build" ]]; then
  echo "▸ Building extension (production)..."
  cd "$REPO_ROOT"
  pnpm --filter @nextslide/extension build
  echo ""
fi

# ── Sanity check ──────────────────────────────────────────────────────────
if [[ ! -f "$DIST_DIR/manifest.json" ]]; then
  echo "✗ dist/manifest.json not found — run without --no-build first"
  exit 1
fi

# ── Zip ───────────────────────────────────────────────────────────────────
mkdir -p "$RELEASES_DIR"

# Zip from inside dist so manifest.json is at the root of the archive
(cd "$DIST_DIR" && zip -r --quiet "$ZIP_PATH" .)

SIZE=$(du -sh "$ZIP_PATH" | cut -f1)
echo "✓ $ZIP_PATH ($SIZE)"
echo ""
echo "Upload at: https://chrome.google.com/webstore/devconsole"
