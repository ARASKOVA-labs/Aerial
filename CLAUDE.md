# CLAUDE.md — Araskova Project Guidelines

## Hephaestus AI CLI Commands
- Query domain standards in JSON: `npx hephaestus query --domain <web|desktop-tauri|rust|pdf-engine|quantum>`
- Search bug solutions: `npx hephaestus query --bug "<keyword>"`
- Export Rephen font: `npx hephaestus font`
- Record new fix to memory: `npx hephaestus learn --title "..." --solution "..."`

## Development Commands
- Dev server: `bun run dev`
- Typecheck: `bun x tsc --noEmit`
- Build: `bun run build`
- Compliance Audit: `npx hephaestus audit`

## Core Principles
- **Aesthetics**: Machinery-grade brutalist precision. Dark mode by default (#0a0a0a), sharp borders (#2a2a2a), tactical accent (#e73f07).
- **Typography**: All headings UPPERCASE font-black tracking-tight text-brand-light using Roboto/Inter (`var(--font-sans)`). Orbitron is strictly BANNED.
- **Logging**: Never use `console.log`. Always use `createLogger` from `@/lib/logger` or native `tracing` in Rust.
- **Rust / Tauri**: Zero `.unwrap()` in production paths. Offload heavy computation to `tokio::task::spawn_blocking`.
- **ADRs**: Document all significant changes in `docs/adr/YYYY-MM-DD-title.md`.

---
*Hephaestus Automated Rulebook — Araskova Labs*
