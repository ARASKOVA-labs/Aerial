# SOC 2 Readiness — Aerial

## What this document is (and is not)

SOC 2 is an **attestation report** issued by an independent CPA firm about an
**organisation's** controls over a period of time (Type II) or at a point in
time (Type I). Software cannot be "SOC 2 compliant" on its own; Araskova Labs
becomes SOC 2 attested by operating controls and passing an audit.

This document maps the **technical controls implemented in this repository**
to the AICPA Trust Services Criteria (2017, revised points of focus 2022), with
evidence an auditor can inspect, and lists the **organisational controls that
must exist outside the code** before an audit can succeed.

Scope assumed: Security (required), Availability, Confidentiality. Privacy and
Processing Integrity are noted where relevant.

## System description (for the auditor)

| Component | Deployment | Customer data handled |
|---|---|---|
| Desktop app (Tauri) | User devices (macOS, Windows, Linux, iOS) | Boards, images and notes, stored locally in the OS app-data directory |
| `@araskova/aerial` npm package | Embedded in customers' web apps | Whatever the host app passes in; no network calls except optional handwriting recognition |
| Collab relay | Araskova-operated container | Transient CRDT frames in memory; never persisted or logged |

**Data flows to subprocessors** (all user-initiated and consent-gated in the desktop app):

| Subprocessor | Data sent | Trigger | Gate |
|---|---|---|---|
| Google Translate (`translate.googleapis.com`) | Selected text | "Translate" action | One-time consent (`src/lib/consent.ts`) |
| MyMemory (`api.mymemory.translated.net`) | Text typed into the translator | Translator modal | Same consent |
| Google Input Tools (`inputtools.google.com`) | Handwriting stroke coordinates | Magic Pen "convert" | One-time consent; `onExternalRequest` hook for SDK hosts |
| OpenRouter (`openrouter.ai`) | Diagram prompt + user's own API key | AI diagram generation | User supplies their key per request |

No telemetry or analytics are collected. Fonts and the PDF.js worker are
bundled; the app makes no other third-party requests.

## Technical controls → Trust Services Criteria

### CC6 — Logical and physical access

| Criterion | Control | Evidence |
|---|---|---|
| CC6.1 Restrict logical access | Desktop: Tauri capabilities limited to `core:default`, fullscreen, and an HTTP allowlist of two URLs; fs/shell/dialog plugins removed | `src-tauri/capabilities/default.json`; real-app test: `plugin:fs` absent |
| CC6.1 | Collab: HMAC-SHA256 room-scoped, expiring tokens; ≥32-byte secret enforced at startup | `araskova-labs/collab-server/src/auth.rs` + tests |
| CC6.1 | File reads limited to OS-reported dropped paths (60 s), image types, ≤25 MB | `src-tauri/src/security.rs` (`DropGrants`) |
| CC6.6 Protect against threats from outside system boundaries | CSP: `script-src 'self' 'wasm-unsafe-eval'`, `object-src 'none'`, `frame-ancestors 'none'`, restricted `connect-src` | `src-tauri/tauri.conf.json`; browser test under production CSP |
| CC6.6 | Origin allowlist and capacity limits on the relay | `AERIAL_ALLOWED_ORIGINS`; `Limits` in relay `lib.rs` |
| CC6.7 Restrict transmission of data | HTTPS-only client for AI calls (`https_only`, rustls); TLS terminated in front of the relay (deployment requirement) | `src-tauri/src/ai.rs` |
| CC6.8 Prevent malicious software | No runtime-loaded remote code (CDN worker and fonts removed); XSS hardening of diagram rendering | `docs/security/threat-model.md` T1, T11 |

### CC7 — System operations

| Criterion | Control | Evidence |
|---|---|---|
| CC7.1 Detect vulnerabilities | `cargo audit`, `bun audit` (high), CodeQL (JS/TS + Rust) on every push/PR; Dependabot weekly for cargo, bun, Actions, Docker | `.github/workflows/ci.yml`, `.github/dependabot.yml` |
| CC7.2 Monitor for anomalies | Structured JSON audit events on the relay: `connect`, `connect_denied` (with reason), `disconnect` (reason, bytes, duration), rate-limit violations. Desktop `audit` target logs rejected input, deletions, migrations, AI requests (no content) | relay `src/lib.rs`; `src-tauri/src/*.rs` |
| CC7.3 / CC7.4 Evaluate and respond to incidents | Vulnerability intake and SLAs | `SECURITY.md` |
| CC7.5 Recover from incidents | Atomic redb transactions; write-then-rename for assets; autosave falls back to a full snapshot after a failed write | `src-tauri/src/storage.rs`, `src/lib/board-store.ts` |

### CC8 — Change management

| Criterion | Control | Evidence |
|---|---|---|
| CC8.1 Authorise, test, approve changes | PR template with security checklist; CI gates (clippy `-D warnings`, 51 Rust unit/integration tests plus a 1M-element scale benchmark, typecheck, builds, audits, SAST); ADRs for significant changes | `.github/pull_request_template.md`, `docs/adr/` |
| CC8.1 | Reproducible builds: `Cargo.lock` / `bun.lock` enforced (`--locked`, `--frozen-lockfile`), container builds from the workspace lockfile, engine build script with path remapping | `scripts/build-engine.sh`, collab `Dockerfile` |

### CC9 — Risk mitigation

| Criterion | Control | Evidence |
|---|---|---|
| CC9.2 Vendor risk | Subprocessor inventory with consent gating (above) | this document; `src/lib/consent.ts` |

### A1 — Availability

| Criterion | Control | Evidence |
|---|---|---|
| A1.1 Capacity | Relay limits (frames, rate, members, rooms, idle timeout); room reclamation | relay `tests/relay.rs` |
| A1.1 | Engine performance is bounded by what is visible, not board size (spatial index, LOD, cached layers); input caps stop crafted boards from hanging the app | `docs/adr/2026-10-01-scalable-render-engine.md`; `aerial-core/aerial-engine/tests/scale.rs` |
| A1.2 Recovery | Health endpoint `/healthz`; graceful shutdown on SIGTERM; non-root container | relay `main.rs`, `Dockerfile` |

### C1 — Confidentiality

| Criterion | Control | Evidence |
|---|---|---|
| C1.1 Identify and protect confidential information | Board data stays on device; the relay is content-blind (never parses, stores or logs payloads); secrets never logged | relay `lib.rs`, `ai.rs` |
| C1.2 Dispose of confidential information | Board deletion removes stored rows and unshared assets (previously data was retained indefinitely); legacy blobs removed after migration | `Store::delete_board`; real-app test |

### Privacy (P-series, if in scope)

Notice and choice for each third-party flow (consent prompts); data
minimisation (no telemetry; the AI audit log records only model and size);
deletion on request via board deletion.

## Organisational controls required for an audit (not code)

These are the usual gaps that block a SOC 2 report. Each needs an owner,
documented policy, and evidence over the audit window:

- [ ] **Governance (CC1–CC2):** information security policy, code of conduct acknowledgement, org chart, security owner, board/management oversight
- [ ] **Risk assessment (CC3):** annual risk assessment and risk register (this threat model is an input)
- [ ] **Access management (CC6.2–CC6.3):** SSO + MFA for GitHub, cloud, and secret stores; onboarding/offboarding checklists; quarterly access reviews
- [ ] **Repository protections (CC8.1):** branch protection on `main` (required reviews, required CI checks, no force-push), CODEOWNERS, signed commits/tags for releases
- [ ] **Secrets management:** collab HMAC secret in a managed secret store with rotation; release signing keys (Apple notarisation, Windows code signing) access-controlled
- [ ] **Infrastructure (relay):** TLS termination, log retention (≥1 year typical) in a central SIEM, alerting on `connect_denied` spikes, backups/IaC for the deployment, vulnerability scanning of the container image
- [ ] **Incident response (CC7.3–CC7.5):** documented IR plan, on-call, annual tabletop exercise
- [ ] **Business continuity / DR (A1.2–A1.3):** BCP/DR plan and annual test
- [ ] **Vendor management (CC9.2):** DPAs / terms review for each subprocessor above; annual review
- [ ] **People (CC1.4):** background checks, security awareness training (annual), policy acknowledgements
- [ ] **Independent testing:** annual penetration test of the desktop app and relay
- [ ] **Audit engagement:** readiness assessment, then Type I, then a 3–12 month Type II window; a compliance automation platform helps collect evidence continuously

## Known technical gaps

Tracked in `docs/security/threat-model.md` → "Residual risks": app-level
encryption at rest, collab token transport in the URL, unbound CRDT, Actions
pinned by tag instead of SHA.
