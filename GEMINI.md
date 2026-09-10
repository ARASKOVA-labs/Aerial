# ARASKOVA COOKBOOK — Gemini / Antigravity Agent Instructions

This file is automatically read by Gemini and the Antigravity IDE on every conversation.
You are building software for Araskova. The Araskova Cookbook governs everything.

## System Context

You are an AI coding agent operating inside an Araskova software project. The Araskova Cookbook is injected into your context because it defines the absolute standards for this codebase. You enforce every rule in this file on every user prompt — automatically, without being asked.

## Araskova: Who We Are

Araskova is a serious deep-tech company building autonomous intelligence, perception engines, and military-grade AI infrastructure. We are based in Kerala, India (Kochi · Alappuzha · Palakkad).

**The standard**: Software must feel like operating a piece of advanced machinery. Interfaces must be as enigmatic and powerful as their creator. Zero compromise on aesthetics or performance.

## Hephaestus AI Tooling (MANDATORY FOR AGENTS)

1. **Query Domain Standards in JSON**:
   Run `npx hephaestus query --domain <web|desktop-tauri|rust|pdf-engine|quantum>` to get exact rules and code snippets with zero token waste.
2. **Lookup Bug Solutions**:
   Run `npx hephaestus query --bug "<error or keyword>"` to fetch past production bug fixes.
3. **Record Newly Resolved Bugs**:
   Run `npx hephaestus learn --domain "<domain>" --title "<title>" --symptom "<symptom>" --solution "<solution>"` to update `.hephaestus/memory.json`.
4. **Export Rephen Brand Font**:
   Run `npx hephaestus font` to export `rephen.ttf` and `rephen.otf` directly with CSS and ReportLab snippets.

## Design System Tokens

### Colors
```css
--brand-dark:    #0a0a0a  /* bg-brand-dark    — page background */
--brand-light:   #f3f3f2  /* text-brand-light — primary text */
--brand-accent:  #e73f07  /* text-brand-accent — Araskova Orange-Red */
--brand-border:  #2a2a2a  /* border-brand-border — borders */
--brand-gray:    #81868b  /* text-brand-gray  — secondary text */
--brand-surface: #111111  /* bg-brand-surface — elevated surfaces */
```

### Fonts
```css
--font-sans:     'Roboto', 'Inter', system-ui, sans-serif /* All Headings & Body */
--font-display:  'Roboto', 'Inter', sans-serif           /* Section titles */
--font-logo:     'Roboto', 'Inter', sans-serif           /* Clean modern sans */
--font-wordmark: 'Rephen', 'Roboto', sans-serif          /* Wordmark ONLY */
--font-mono:     'Space Mono', ui-monospace, monospace   /* Labels, metadata */
```

## What NOT To Do

- ❌ NEVER USE ORBITRON — Orbitron is strictly banned across the entire codebase.
- ❌ Do not use generic colors (`red-500`, `blue-600`, `gray-700`, etc.).
- ❌ Do not use any font outside the approved families.
- ❌ Do not create minimal/MVP-looking interfaces — everything must be machinery-grade premium.
- ❌ Do not use `node:fs` at runtime in SSR — use `import.meta.glob` only.
- ❌ Do not use `console.log` — use `createLogger` from `@/lib/logger` or native tracing in Rust.
- ❌ Do not call `.unwrap()` in production Rust or Tauri command handlers.
- ❌ Do not commit `.env` files.
- ❌ Do not use `any` in TypeScript.

## Documentation & Logging (MANDATORY)
- **ADRs**: You MUST write an Architecture Decision Record (ADR) in `docs/adr/YYYY-MM-DD-feature.md` when implementing complex features so bug origins can be traced.
- **Logging**: You MUST use `@/lib/logger` with strict typings. Raw `console.log` is strictly prohibited.
- **Security**: Apply strict zod constraints to all inputs. In Tauri apps, scope permissions granularly in `capabilities/default.json`.

---
*Hephaestus Automated Rulebook — Araskova Labs*
