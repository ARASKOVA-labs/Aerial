#!/usr/bin/env bash
# Builds Aerial.app signed with a stable identity.
#
# Why: Aerial keeps its storage key in the macOS Keychain. The Keychain trusts
# an app by its code signature. An ad-hoc signature (what `tauri build` uses
# when no identity is set) is just the hash of the binary, so every rebuild is
# a "different app" and macOS asks for the login password again. Signing with
# a certificate gives the app an identity that survives rebuilds.
#
# Usage:  scripts/build-mac.sh [extra tauri build args]
# Override the identity with APPLE_SIGNING_IDENTITY (name or SHA-1).
set -euo pipefail
cd "$(dirname "$0")/.."

if [ -z "${APPLE_SIGNING_IDENTITY:-}" ]; then
  # Prefer Developer ID (distribution), then Apple Development (local builds).
  for kind in "Developer ID Application" "Apple Development"; do
    found="$(security find-identity -v -p codesigning | awk -v k="$kind" 'index($0,k){print $2; exit}')"
    if [ -n "$found" ]; then APPLE_SIGNING_IDENTITY="$found"; break; fi
  done
fi

if [ -z "${APPLE_SIGNING_IDENTITY:-}" ]; then
  echo "No code-signing certificate found in your keychain." >&2
  echo "Add a free one in Xcode (Settings → Accounts → Manage Certificates → +" >&2
  echo "→ Apple Development), then run this again. Building ad-hoc would bring" >&2
  echo "back the keychain password prompt on every rebuild." >&2
  exit 1
fi
export APPLE_SIGNING_IDENTITY
echo "Signing with ${APPLE_SIGNING_IDENTITY}"

bun x tauri build --bundles app "$@"

APP="target/release/bundle/macos/Aerial.app"
codesign --verify --deep --strict "$APP"
echo "Designated requirement:"
codesign -d -r- "$APP" 2>&1 | sed -n 's/^designated => /  /p'
echo "Built ${APP}"
