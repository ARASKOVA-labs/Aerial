#!/usr/bin/env bash
# Builds the Rust WASM engine into public/aerial-engine (the copy the app and
# the npm package ship). Path prefixes are remapped so the binary does not
# embed the builder's home directory or checkout location.
set -euo pipefail
cd "$(dirname "$0")/.."

EXPECTED_BINDGEN="$(awk '/^name = "wasm-bindgen"$/{getline; gsub(/"/,"",$3); print $3; exit}' Cargo.lock)"
if ! command -v wasm-bindgen >/dev/null 2>&1; then
  echo "wasm-bindgen CLI not found. Install it with:" >&2
  echo "  cargo install wasm-bindgen-cli --version ${EXPECTED_BINDGEN} --locked" >&2
  exit 1
fi
ACTUAL_BINDGEN="$(wasm-bindgen --version | awk '{print $2}')"
if [ "${ACTUAL_BINDGEN}" != "${EXPECTED_BINDGEN}" ]; then
  echo "wasm-bindgen CLI ${ACTUAL_BINDGEN} does not match Cargo.lock (${EXPECTED_BINDGEN})." >&2
  exit 1
fi

RUSTFLAGS="--remap-path-prefix=${PWD}=. --remap-path-prefix=${CARGO_HOME:-$HOME/.cargo}=cargo" \
  cargo build -p aerial-engine --target wasm32-unknown-unknown --release --locked
wasm-bindgen --target web --out-dir public/aerial-engine \
  target/wasm32-unknown-unknown/release/aerial_engine.wasm
echo "Engine built → public/aerial-engine"
