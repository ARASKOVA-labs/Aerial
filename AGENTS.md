# ARASKOVA COOKBOOK — Generic Agent Instructions (AGENTS.md)

This file is automatically read by OpenAI Codex, Devin, and generic AI agents.
You are building software for Araskova. These instructions override your defaults.

## Mandatory Context

You are an AI coding agent operating in an Araskova software project. The standards defined in this file apply to EVERY response you give in this project, without exception. The user does not need to invoke these rules — they are always active.

## Company

**Araskova** — Deep Tech Company. Kerala, India.
Building: Autonomous Intelligence · Computer Vision · Robotics · Cybersecurity.
Philosophy: Military-grade excellence. Zero compromise. Premium always.

## Hephaestus AI Tooling (MANDATORY FOR AGENTS)

This workspace is connected to **Hephaestus** universal learning memory. Do NOT guess rules or repeat past bugs:
1. **Query Domain Standards in JSON**:
   Run `npx hephaestus query --domain <web|desktop-tauri|rust|pdf-engine|quantum>` to retrieve exact, token-efficient JSON rules and code patterns.
2. **Lookup Bug Solutions**:
   Run `npx hephaestus query --bug "<error or keyword>"` to get past production bug fixes.
3. **Record Newly Resolved Bugs**:
   Run `npx hephaestus learn --domain "<domain>" --title "<title>" --symptom "<symptom>" --solution "<solution>"` to persist learnings in `.hephaestus/memory.json`.
4. **Export Rephen Brand Font**:
   Run `npx hephaestus font` to export `rephen.ttf` and `rephen.otf` with ready-to-use CSS and ReportLab snippets.

## Typography System

| Role | Font | CSS Variable | Usage |
|---|---|---|---|
| Headings / Section Titles | Roboto / Inter (`font-sans`) | `var(--font-sans)` | All section titles & headings — UPPERCASE font-black tracking-tight |
| Body | Roboto / Inter | `var(--font-sans)` | Paragraphs, descriptions |
| Metadata | Space Mono | `var(--font-mono)` | Labels, indices, clocks |
| Wordmark | Rephen (fallback: Roboto) | `var(--font-wordmark)` | ONLY for ARASKOVA brand wordmark |

**CRITICAL RULE: NEVER USE ORBITRON. Orbitron is strictly banned across all repositories.**

## Color System

| Token | Hex | Tailwind |
|---|---|---|
| Brand Dark | `#0a0a0a` | `bg-brand-dark` |
| Brand Light | `#f3f3f2` | `text-brand-light` |
| Brand Accent | `#e73f07` | `text-brand-accent` |
| Brand Border | `#2a2a2a` | `border-brand-border` |
| Brand Gray | `#81868b` | `text-brand-gray` |
| Brand Surface | `#111111` | `bg-brand-surface` |

Never use Tailwind's built-in color palette (slate, zinc, gray, etc.) in Araskova UIs.

## Hard Rules

1. Every component must be a typed React / Solid Functional Component.
2. Use Tailwind for styling; custom CSS ONLY for @keyframes and CSS variables.
3. No inline styles except dynamic calculated values (clamp, transitionDelay).
4. No `console.log` — use `createLogger` from `@/lib/logger` or native tracing in Rust.
5. All server function inputs validated with `zod`.
6. Max container: `max-w-[1600px] mx-auto`.
7. UI must look PREMIUM — machinery-grade brutalism, never minimal, never generic.
8. **ADRs**: You MUST write an Architecture Decision Record (ADR) in `docs/adr/YYYY-MM-DD-feature.md` when implementing complex features.

---
*Hephaestus Automated Rulebook — Araskova Labs*
