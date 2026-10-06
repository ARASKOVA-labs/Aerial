# Aerial Threat Model

_Last reviewed: 2026-10-01. Review on any change to IPC commands, capabilities,
CSP, network endpoints, storage format, or the collab protocol._

## System and trust boundaries

```
┌──────────────────────── Desktop app (Tauri) ────────────────────────┐
│  Webview (untrusted content)            Rust core (trusted)          │
│  React UI · WASM engine · Mermaid  ──IPC──►  security.rs validation  │
│  renders user / AI / pasted content        storage.rs (redb, assets) │
│                                            ai.rs (OpenRouter)        │
└─────────────┬───────────────────────────────────────┬───────────────┘
              │ consent-gated HTTPS                   │ WSS + signed token
              ▼                                       ▼
   Google Translate · MyMemory ·             Collab relay (axum)
   Google Input Tools · OpenRouter           content-blind fan-out
```

Boundaries an attacker can cross:

1. **Content → webview.** Board files, pasted text/images, diagram source
   (often LLM-generated), and peers' collaboration frames are attacker-
   controllable. The webview must be assumed compromisable.
2. **Webview → Rust core (IPC).** Every command argument is untrusted.
3. **Network → collab relay.** Anyone on the internet can open a socket.
4. **Supply chain.** npm and crates.io packages, CDN assets, GitHub Actions.

## Assets

| Asset | Where | Sensitivity |
|---|---|---|
| Board contents (strokes, text, diagrams, images) | `aerial_store.redb`, `assets/` in the app data dir | Confidential — user IP |
| Quick notes | webview `localStorage` | Confidential |
| OpenRouter API key | supplied per call, held in memory only | Secret |
| Collab HMAC secret | relay environment (`AERIAL_COLLAB_SECRET`) | Secret |
| Room traffic | relay memory, transient | Confidential (CRDT updates) |

## Threats and mitigations

| # | Threat (STRIDE) | Before | Mitigation now | Evidence |
|---|---|---|---|---|
| T1 | XSS via diagram labels → script in webview (E) | `aras-layout` interpolated labels/colours into SVG unescaped; Mermaid `securityLevel: 'loose'`; preview via `innerHTML` | XML escaping + colour allowlist in `aras-layout`; Mermaid `strict`; DOMPurify on preview; CSP `script-src 'self' 'wasm-unsafe-eval'` | `aras-layout` tests; browser test: payload in node label does not execute |
| T2 | Webview compromise → read/write any file (E, I) | `fs:scope ["**"]` with read/write/remove | fs plugin removed. Files reach Rust only through `read_dropped_image`, which accepts paths the OS reported in a drop event in the last 60 s, image types only, ≤ 25 MB | Real-app test: `plugin:fs` absent, `/etc/passwd` rejected |
| T3 | Path traversal via asset / board id (T, I) | `assets_dir.join(id)` unchecked | `validate_id`: `[A-Za-z0-9_-]{1,128}`, no leading `-` | `security.rs` + real-app tests |
| T4 | Webview → arbitrary network (exfiltration) (I) | HTTP plugin allowed `http(s)://**`; `csp: null` | HTTP plugin allowlisted to two translation endpoints; CSP `connect-src` limited to IPC and Google Input Tools | Real-app test: `example.com` blocked by plugin and CSP |
| T5 | Silent data egress to third parties (I) | Translation, handwriting recognition and Google Fonts sent data with no notice | Fonts self-hosted; translation and handwriting gated by explicit consent per service | `src/lib/consent.ts`; browser test |
| T6 | Malicious board / peer data → crash or hang (D) | Unchecked `NaN`/`Infinity`/huge coordinates; DSL parser could panic on `[a]: "` | `element::sanitize` (kinds, finite geometry, ±1e9 world, size caps); parser panic paths fixed; diagram source ≤ 64 KB | engine + DSL tests (`malformed_input_never_panics`) |
| T7 | Collab: unauthenticated room access (S) | Any token starting `premium_` accepted | HMAC-SHA256 signed tokens: room-scoped, expiring, max 24 h, constant-time verify; ≥ 32-byte secret required | `auth.rs` tests; integration test: old bypass → 401 |
| T8 | Collab: resource exhaustion (D) | No frame limit, no rate limit, rooms never freed | 1 MB frames, 60 fps / 4 MB/s per connection, 64 members/room, 10k rooms, 300 s idle timeout, empty rooms reclaimed, text frames rejected | `tests/relay.rs` |
| T9 | Collab: no accountability (R) | `println!` only | JSON audit events (connect, deny with reason, disconnect, rate-limit) without payloads | `lib.rs` |
| T10 | Data persists after "delete" (I) | Deleting a board only removed it from a `localStorage` list | `delete_board` removes rows and unshared assets; UI confirms first | Real-app test: data gone after delete |
| T11 | Supply chain: remote code at runtime (T) | PDF.js worker loaded from unpkg CDN | Worker bundled; fonts bundled; no runtime CDN code | CSP has no third-party script origins |
| T12 | Supply chain: vulnerable dependencies (T) | No auditing | `cargo audit`, `bun audit`, CodeQL and Dependabot in CI; unused plugins/packages removed; `Cargo.lock` enforced in the container build | `.github/workflows/ci.yml` |
| T13 | Secrets in logs (I) | n/a | API key never logged; AI audit records model + byte count only; relay logs never include payloads or tokens | `ai.rs`, relay `lib.rs` |
| T14 | Boards readable from disk, backups or another local account (I) | Plain JSON rows and image files in the app data directory | XChaCha20-Poly1305 with a 256-bit key held in the OS keychain; each record bound to its board/element/asset id; existing data sealed and the DB compacted on first open; a locked keychain refuses all writes | `vault.rs`, `storage.rs` tests |
| T15 | Shared boards readable by whoever gets the file (I) | No export format | `.aerial` files can be sealed with AES-256-GCM (PBKDF2-SHA-256, 600k iterations, authenticated header); imports are validated and assets re-keyed | `aerial-file.test.ts`, `files.rs` tests |

## Residual risks / follow-ups

- **Encryption at rest needs an OS credential store.** macOS, iOS and Windows
  seal boards (T14); Linux and Android still rely on full-disk encryption
  until a persistent secret-service backend is added. Unsigned (ad-hoc) builds
  make macOS ask again for keychain access after each update.
- **Password-protected files are as strong as their password.** PBKDF2 slows
  guessing; the Save dialog requires 8+ characters.
- **Collab tokens travel in the WebSocket URL.** Keep lifetimes short (minutes)
  and terminate TLS at a proxy that does not log query strings.
- **The Yrs CRDT document is not yet bound to scene elements.** The relay is
  hardened, but end-to-end collaborative editing is not shipped.
- **`style-src 'unsafe-inline'`** is required by React inline styles and
  Mermaid; scripts remain strictly same-origin.
- **Upstream advisory warnings.** `cargo audit` reports no vulnerabilities but
  10 informational warnings (unmaintained/unsound crates such as `glib`,
  `unic-*`, `proc-macro-error`) inside Tauri's GTK dependency tree. They are
  resolved by upgrading Tauri when upstream moves; Dependabot tracks this.
- **GitHub Actions are pinned by tag, not commit SHA.** Dependabot keeps them
  current; SHA pinning is recommended before a SOC 2 Type II window.
