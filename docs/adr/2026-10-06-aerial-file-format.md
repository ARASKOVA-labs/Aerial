# ADR 2026-10-06: The .aerial File Format

## Status
Accepted

## Context

Boards lived only inside the app's local store. There was no way to hand a
board to someone else, move it to another machine, or keep a backup: PNG and
SVG exports are pictures, not editable boards.

## Decision

A `.aerial` file is one self-contained UTF-8 JSON document:

```json
{ "format": "aerial", "version": 1, "encrypted": false,
  "name": "Roadmap", "app": "3.0.0", "created": "2026-10-06T…",
  "scene": { "elements": [ … ] },
  "assets": { "<assetId>": "data:image/png;base64,…" } }
```

- **Portable.** JSON with inlined images opens in the desktop app and in the
  web build, needs no store, and can be inspected or diffed.
- **Optional password.** The same document sealed with AES-256-GCM. The key
  comes from PBKDF2-SHA-256 with 600 000 iterations and a random 16-byte salt;
  the envelope header (format, version, KDF parameters, IV) is authenticated
  as additional data so it cannot be altered or downgraded.
- **Untrusted on open.** Unknown formats and newer versions are refused with
  a clear message; assets must be well-formed image data URLs with safe ids;
  every asset gets a fresh id on import so a file can never overwrite or
  alias images already on the machine; the engine validates every element.
- **Desktop integration.** Native Save / Open dialogs run in Rust
  (`files.rs`), which writes atomically and caps reads at 512 MB. The bundle
  registers `.aerial`, so Finder double-click and Open With work; the webview
  still never receives a file path or a file-system capability.
- **Shortcuts.** ⌘E saves, ⌘⇧E opens; also in the main menu, the welcome
  screen and the command palette.

## Consequences

- Files grow with their images (base64, ~33% overhead); compression can be a
  future version without breaking v1 readers, which refuse newer versions.
- A lost password cannot be recovered; the Save dialog says so.
