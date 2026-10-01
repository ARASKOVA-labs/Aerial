# ADR 2026-10-01: Security Hardening and SOC 2 Technical Controls

## Status
Accepted

## Context

A review of v1.2.2 found that a single script injection in the webview would
have given an attacker the user's whole disk and network:

- `csp: null`; Tauri `fs:scope ["**"]` with read/write/remove; HTTP plugin
  allowed every URL.
- Diagram SVG built by string interpolation without escaping
  (`aras-layout`), Mermaid `securityLevel: 'loose'`, preview via
  `dangerouslySetInnerHTML` — a working XSS path from pasted or LLM-generated
  diagram code.
- `save_asset` / `load_asset` joined an unchecked id onto a path.
- Collab relay accepted any token starting with `premium_`, had no size or
  rate limits, echoed frames back, and never freed rooms.
- PDF.js worker and fonts loaded from CDNs at runtime; translation and
  handwriting recognition sent user content to third parties without notice.
- "Deleting" a board left its data on disk.

The project also needs to support a SOC 2 audit.

## Decision

**Desktop app**
1. CSP: `script-src 'self' 'wasm-unsafe-eval'`, `object-src 'none'`,
   `frame-ancestors 'none'`, `connect-src` limited to IPC and Google Input
   Tools. `freezePrototype` was evaluated and rejected: it broke app boot in
   WebKitGTK (bundled libraries assign to prototype-shadowed properties).
2. Capabilities reduced to `core:default`, fullscreen, and an HTTP allowlist of
   the two translation endpoints. fs, shell and dialog plugins removed
   (Rust and npm).
3. Dropped files are read by `read_dropped_image`, which only accepts paths the
   OS reported in a drop event within 60 s, image extensions, ≤ 25 MB.
4. All IPC input validated in `security.rs` (ids, sizes, data-URL types);
   blocking storage work moved to `spawn_blocking`.
5. Diagram rendering: XML escaping and a colour allowlist in `aras-layout`;
   DSL parser panic paths fixed; Mermaid `strict`; DOMPurify on the preview
   (with `foreignObject` as an HTML integration point so labels survive).
6. Fonts (`@fontsource`) and the PDF.js worker are bundled. Translation and
   handwriting recognition ask for consent once per service.
7. Storage schema v3: one redb row per element; delta autosave; legacy blobs
   migrate on first load and are removed; `delete_board` removes rows and
   unshared assets; the UI confirms before deleting.
8. OpenRouter client: HTTPS-only (rustls), timeouts, SSE lines buffered across
   chunks (tokens were previously dropped), key never logged.

**Collab relay**
9. HMAC-SHA256 tokens (`v1.<claims>.<sig>`): room-scoped, expiring, ≤ 24 h,
   constant-time verification; ≥ 32-byte secret required at startup;
   `mint` subcommand for operators.
10. Room id validation, optional Origin allowlist, 1 MB frames, per-connection
    token bucket, per-room and global caps, idle timeout, no echo, lagging
    peers disconnected to resync, empty rooms reclaimed.
11. JSON audit logging without payloads; `/healthz`; graceful shutdown;
    non-root container built with `--locked` from the workspace lockfile.

**Process**
12. CI: clippy `-D warnings`, workspace tests, 1M-element scale benchmark,
    fresh WASM build with binding drift check, `cargo audit`, `bun audit`,
    CodeQL; Dependabot; PR security checklist; `SECURITY.md`; threat model;
    SOC 2 control mapping (`docs/compliance/SOC2.md`).
13. Fixed a pre-existing shortcut bug: with Ctrl/Cmd held, single-key tool
    shortcuts still fired (Ctrl+Z switched to the laser pen and broke undo).

## Verification

- Rust: 51 tests across engine, DSL, layout, desktop backend, and relay
  (including real-socket integration tests).
- Browser (production CSP): drawing/undo/drag/eraser/zoom/pan e2e, fonts
  load locally, Mermaid renders, XSS payload in a node label does not execute,
  zero CSP violations.
- Real Tauri app under Xvfb + WebDriver: 20 checks — persistence across
  restart, board isolation, confirmed delete removes data from disk, legacy
  v1.2.2 database migrates, and every IPC boundary above rejects attacks
  (`plugin:fs` absent, traversal rejected, non-dropped path rejected,
  non-allowlisted URL rejected by plugin and CSP).

## Consequences

- SOC 2 still requires organisational controls (policies, access reviews,
  branch protection, IR/BCP, vendor reviews, audit); listed in
  `docs/compliance/SOC2.md`.
- Residual risks are tracked in `docs/security/threat-model.md` (no app-level
  encryption at rest, collab token in URL, CRDT not yet bound to elements).
- Library consumers that relied on `check_and_clear_dirty` keep working;
  `scene_version` is preferred.
