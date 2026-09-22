---
name: araskova-design-system
description: Enforces Araskova military-grade brutalist design tokens, typography invariants, dual-theme luminance, and machinery UI blueprints across all products.
---

# Araskova Universal Design System Skill

## Core Aesthetic: Machinery-Grade Brutalism
Every Araskova product must feel like operating advanced military or aerospace hardware. High visual density, laser precision, and dark-mode default with luminance-inverted light mode.

## 1. Typography Hierarchy
- **Headings**: Roboto / Inter via `var(--font-sans)`. Classes: `font-sans font-black uppercase tracking-tight text-brand-light leading-[0.9-1.0]`.
  - **CRITICAL**: Orbitron is strictly banned. Never use Orbitron in any heading, copy, or logo.
- **Body**: Roboto / Inter via `var(--font-sans)`. Classes: `font-sans font-light leading-relaxed text-brand-gray`.
- **Metadata / Telemetry**: Space Mono via `var(--font-mono)`. Classes: `font-mono text-xs uppercase tracking-[0.25em] text-brand-accent`.
- **Wordmark**: Rephen via `var(--font-wordmark)`. Strictly reserved for the ARASKOVA wordmark.

## 2. Color Tokens
| Token | Dark Mode (Default) | Light Mode (Inverted) |
|---|---|---|
| Background | `bg-brand-dark` (`#0a0a0a`) | `bg-brand-dark` (`#ffffff`) |
| Surface | `bg-brand-surface` (`#111111`) | `bg-brand-surface` (`#f5f5f5`) |
| Text Primary | `text-brand-light` (`#f3f3f2`) | `text-brand-light` (`#0a0a0a`) |
| Accent | `text-brand-accent` (`#e73f07`) | `text-brand-accent` (`#e73f07`) |
| Border | `border-brand-border` (`#2a2a2a`) | `border-brand-border` (`#e0e0e0`) |
| Muted Gray | `text-brand-gray` (`#81868b`) | `text-brand-gray` (`#6b7280`) |

## 3. UI Component Blueprints
- **Container**: `<div className="mx-auto w-full max-w-[1600px] px-4 md:px-12">`
- **Section Index**: `<p className="font-mono text-xs uppercase tracking-[0.25em] text-brand-gray">· 001 — Core Systems</p>`
- **Heading**:
  ```tsx
  <h2 className="font-sans font-black uppercase tracking-tight text-brand-light leading-[0.9]"
      style={{ fontSize: 'clamp(3rem, 7vw, 6rem)' }}>
    Autonomous <span className="text-brand-accent">Infrastructure.</span>
  </h2>
  ```
- **Dot Grid Background**:
  ```tsx
  <div className="pointer-events-none absolute inset-0 opacity-40"
       style={{ backgroundImage: 'radial-gradient(circle, var(--brand-border) 1px, transparent 1px)',
                backgroundSize: '24px 24px' }} />
  ```
- **Corner Ticks**: `<div className="hero-tick-tl hero-tick-tr hero-tick-bl hero-tick-br relative p-8">...</div>`
- **Magnetic Button**: Use class `.btn-magnetic` with minimum `transition-all duration-300`.

## 4. Real Platforms Only
Never fabricate imaginary product names. Only reference verified Araskova platforms:
- **VIGIL**: Autonomous Computer Vision & Defect Inspection
- **ARGUS**: Physical Security Intelligence & RTSP CCTV Analytics
- **CERBERUS**: Autonomous Application Security & Skill Book Engine
- **AERIAL CANVAS**: 120 FPS Local-First Infinite Canvas
- **AXIS**: Facility & Operations Software Suite
- **QR GOD**: 100% Client-Side Vector QR Engine
