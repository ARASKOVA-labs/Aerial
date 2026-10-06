# Changelog

## Unreleased

### Fixed
- macOS no longer asks for the login password on every launch of a new build:
  releases are signed with a stable certificate (`scripts/build-mac.sh`), so
  the Keychain keeps trusting Aerial. See the ADR on stable signing.

### New
- Claude Desktop extension bundle (`scripts/pack-mcpb.sh`) and a guide to
  submitting it to the directory (`docs/mcp-directory.md`).

## 3.0.0 — 2026-10-06

### New
- **.aerial files.** Save a board with its images as one portable file (⌘E)
  and open it anywhere Aerial runs (⌘⇧E, Finder double-click, Open With).
  Optional password protection with AES-256-GCM.
- **Claude and other AI agents (MCP).** `Aerial mcp` lets MCP clients read the
  board, draw shapes, arrows and diagrams, write notes with the pen and look
  at the result. Off switch under Menu → AI agents. See `docs/mcp.md`.
- **Encryption at rest.** Boards and images are sealed with XChaCha20-Poly1305
  under a 256-bit key kept in the macOS Keychain; existing data is encrypted
  on first launch.
- **Zoom to fit** (⇧1).
- **New identity.** A new mark and app icon, and a loading screen where a
  spark writes the wordmark.

### Improved
- The diagram studio, command palette and translator now match the editor's
  design. The diagram preview is exactly what is inserted, and renders the
  same in the macOS app as in browsers.
- Pen strokes keep the shape you drew after you lift the pen.
- Menus and the More tools popover stay inside the window at any size; the
  side menu's scrollbar no longer covers its shortcuts.

### Removed
- The Quick Note window, menu-bar tray icon and global shortcut (already
  disabled in 1.2.2).
- The "copy an AI prompt" banner in the diagram studio.
- The feedback dialog's "Send" button, which sent nothing; feedback now opens
  a pre-filled GitHub issue.

### Under the hood
- `App.tsx` and `AerialCanvas.tsx` (≈1,300–1,400 lines each) are split into
  focused hooks and components under `src/app/` and `src/components/canvas/`;
  the engine's JS API and the diagram theme are split into modules.
