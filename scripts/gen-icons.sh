#!/usr/bin/env bash
# Regenerates every app icon and favicon from the SVG sources in brand/.
set -euo pipefail
cd "$(dirname "$0")/.."
node scripts/render-svg.mjs brand/aerial-icon.svg brand/aerial-icon-1024.png 1024
bun tauri icon brand/aerial-icon-1024.png
cp brand/aerial-favicon.svg public/favicon.svg
node scripts/render-svg.mjs brand/aerial-favicon.svg public/favicon.png 64
echo "Icons regenerated from brand/*.svg"
