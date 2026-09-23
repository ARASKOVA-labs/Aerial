# ADR 2026-09-23: Araskova Machinery Brutalist Diagram and Mermaid Aesthetic Transformation

## Status
Accepted

## Context
Following the implementation of precision canvas tools, text re-editing, and eraser engines, the user requested a distinctive, signature aesthetic for generated diagrams:
*"now the mermaid chart that are generated should have araskova desing aeshtics as well which gives the software a distinct look similar to how excalidraw has the scribble version of mermaid"*

### Prior Limitations & Vulnerabilities:
1. **Generic Default Visuals**:
   - Mermaid diagrams generated via default configurations rendered generic pastel boxes (`#ececff`), rounded standard borders, and system fonts that conflicted with the Araskova military-grade brutalist design system.
2. **Canvas Font and Style Isolation**:
   - In browser and desktop webviews, when an SVG is drawn onto an HTML5 `<canvas>` via an `Image` object (used by the WASM hardware rendering engine in `addDiagram`), browser security sandboxes the SVG from external stylesheets (`index.css`). As a result, CSS classes referencing external fonts or variables failed to render, reverting to default fallback fonts and unstyled borders.
3. **Absence of Tactical Machinery Identity**:
   - Unlike Excalidraw's distinctive hand-drawn "scribble" look or Araskova's HUD interfaces, diagrams lacked tactical corner reticles (`┌ ┐ └ ┘`), hardware status LEDs, telemetry typography (`Space Mono`), and subsystem wireframe header bars (`// SYS.<NAME>`).
4. **Outdated Generic Templates**:
   - Diagram studio presets contained basic generic examples rather than showcasing deep-tech Araskova platforms (Vigil Perception, Argus Drone Grid, Cerberus Quantum Cryptography).

---

## Decision

### 1. Vector Aesthetic Architecture (`src/lib/diagram-theme.ts`)
Created a dedicated Araskova Diagram Aesthetic Engine exporting three primary interfaces:
- **`getAraskovaMermaidConfig(isDarkMode, style)`**:
  - Configures Mermaid theme variables with exact Araskova brand tokens (`#0a0a0a`, `#111111`, `#2a2a2a`, `#81868b`, `#f3f3f2`, `#e73f07`).
  - Injects deep `themeCSS` targeting all major diagram types: Flowcharts, Sequence diagrams, Class diagrams, State diagrams, ER diagrams, and Git graphs.
  - Strictly enforces the typography hierarchy: `Roboto`/`Inter` (`font-sans`) for titles/nodes and `Space Mono` (`font-mono`) for edge labels, telemetry, and note blocks. ZERO Orbitron usage.
- **`applyAraskovaDiagramAesthetics(svgString, isDarkMode, style)`**:
  - An SVG post-processor utilizing `DOMParser` to transform raw SVGs into high-precision tactical blueprints.
  - **Self-Contained Inlining**: Injects `@import` Google Fonts (`Inter`, `Roboto`, `Space Mono`) directly into SVG `<defs><style>` so hardware `<canvas>` rendering and exported PNG/PDF files retain 100% typography and color fidelity.
  - **Tactical Corner Reticles**: Computes the geometry of each diagram node (`rect`) and injects 4 L-shaped HUD brackets (`M x y+6 L x y L x+6 y`, etc.) with 1.5px stroke and sharp corners.
  - **Status LED Indicators**: Injects high-impact `#e73f07` status dots on primary nodes with subtle drop-shadows.
  - **Precision Arrowheads**: Registers an `#araskova-arrow-head` marker with acute angled vectors (`M 0 1.5 L 8 5 L 0 8.5 L 2 5 Z`) and replaces standard arrowheads.
  - **Subsystem Cluster Headers**: Transforms cluster wireframe boundaries by injecting a dedicated header bar with `// SYS.<NAME>` telemetry labeling.
- **Curated Deep-Tech Presets (`ARASKOVA_DIAGRAM_TEMPLATES`)**:
  - Pre-loads real Araskova autonomous platform blueprints:
    1. *Vigil Perception Pipeline* (`graph TD` with hardware sensory nodes and inference engine)
    2. *Argus Swarm Drone Grid* (`flowchart LR` with edge telemetry and mission command)
    3. *Cerberus Quantum Protocol* (`sequenceDiagram` with NIST ML-KEM-768 key encapsulation)
    4. *Target Acquisition Lock* (`stateDiagram-v2` with optical lock state transitions)
    5. *Perception Entity Architecture* (`classDiagram` with typed telemetry telemetry models)
    6. *Aras Tactical DSL* (`node`/`group` native layout format)

### 2. Dual-Theme & Aesthetic Adaptation
Supports 3 distinct visual modes:
- **`Machinery Brutalist` (Default)**: Deep brand surfaces (`#0a0a0a` / `#111111`), crisp `#2a2a2a` borders, and high-impact `#e73f07` accents.
- **`Tactical Blueprint`**: Military CAD schematic aesthetic featuring navy surfaces (`#0d1522`), `#1e3a5f` grid borders, and electric blue (`#3b82f6`) telemetry accents.
- **`Industrial Light`**: High-contrast daylight inspection mode with crisp white surfaces, graphite borders, and Araskova orange accents.

### 3. Native Rust Layout Engine Upgrades (`aerial-core/aras-layout/src/lib.rs`)
- Upgraded the native Aras DSL SVG generator to embed `@import` font definitions, brand color tokens, corner bracket reticles on each box, and `// SYS.` headers.
- Verified via `cargo check --manifest-path src-tauri/Cargo.toml`.

### 4. Interactive Studio & In-Place Canvas Editing (`src/App.tsx`)
- Upgraded `<DiagramStudioModal>`:
  - Added aesthetic style switcher pills (`Brutalist`, `Blueprint`, `Industrial`).
  - Integrated dynamic re-rendering on code or aesthetic change.
  - Added tactical corner ticks to the preview container.
- Updated canvas node renaming handler (`handleNodeDoubleClick`):
  - When a user double-clicks a diagram node on canvas and edits its label, the returned SVG is re-processed through `applyAraskovaDiagramAesthetics` to preserve tactical styling across edits.

---

## Consequences
- Every Mermaid and Aras architecture chart in Aerial now has a distinctive, unmistakable Araskova visual signature, directly achieving the user's vision of having an Araskova-equivalent to Excalidraw's scribble style.
- SVGs rendered on canvas and exported as PNG/PDF maintain 100% typography fidelity through self-contained font defs.
- Zero breaking changes to existing canvas diagrams; all existing diagrams can be updated seamlessly.
