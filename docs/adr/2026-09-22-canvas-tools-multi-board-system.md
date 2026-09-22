# ADR 2026-09-22: Complete Canvas Tools Suite, Dynamic Multi-Board Persistence, and Expanded Side Menu

## Status
Accepted

## Context
Following the library extraction in v1.1.0, users required:
1. Complete, functional implementations of all creative drawing and composition tools, specifically:
   - Reliable inline text placement with keyboard submission (`Enter`) and dynamic canvas rendering.
   - AI Magic Pen tool integration in both the engine and UI.
   - Live Mermaid & Aras DSL Diagram Studio with preview, syntax validation, and canvas insertion.
   - Text Translation Studio with multilingual conversion (Malayalam, Tamil, Telugu, Hindi, Spanish, French, etc.) and canvas insertion.
   - Fix for line-drawing false erasures caused by over-eager scratch-to-erase heuristics.
2. Full visibility of tools in an expanded, scroll-safe side menu adhering to the Araskova design system:
   - Rounded aesthetics (`rounded-2xl`, `rounded-3xl`, `rounded-xl`).
   - Signature yellow-background badge (`#ffd000`) with high-contrast black monogram (`#0a0a0a`), alongside Araskova Orange accents (`#e73f07`).
   - Quick navigation grid displaying all 13 tools with active state indicators and keyboard shortcut cues.
   - Creative & insert tools (Diagram Studio, Image upload, PDF import, Multilingual text translator).
3. Canvas modification and dynamic canvas switching:
   - Real-time canvas background presets (Brand Dark `#0a0a0a`, OLED Black `#000000`, Blueprint Deep `#0d1b2a`, Terminal Forest `#0a1912`, Clean White `#ffffff`, Warm Canvas `#f8f9fa`).
   - Grid style toggles (None, Dots, Crosses, Engineering Grid).
   - Multi-board architecture with isolated persistence per board ID in Rust `redb` (`aerial.db`), allowing users to create, switch, rename, and delete independent whiteboards without data loss.

## Decision

1. **Rust Backend Multi-Board Storage (`src-tauri/src/lib.rs`)**:
   - Enhanced `save_board(state: Vec<u8>, board_id: Option<String>)` and `load_board(board_id: Option<String>)` to key payloads by `format!("aerial_board_state_{}", id)` in the embedded `redb` transactional key-value store.
   - Maintained full backward compatibility with the default `aerial_board_state` key when `board_id` is omitted.

2. **Multi-Board Management & UI State (`src/App.tsx`)**:
   - Implemented `BoardInfo` registry stored in `localStorage` (`aerial_boards_registry`), tracking board IDs, names, timestamps, and active state.
   - Built seamless board switching (`switchBoard`) with automatic state persistence before transitions.
   - Added in-place board renaming and deletion with fallback to the default board.

3. **Expanded Machinery Side Menu (`src/App.tsx`)**:
   - Engineered an accessible, non-clipped drawer (`w-80 max-h-[calc(100vh-4rem)] flex flex-col`) with a scrollable container (`overflow-y-auto overscroll-contain pr-1`).
   - Incorporated:
     - Section 1: Active Board Switcher & Management (create, rename, delete).
     - Section 2: Canvas Customization (6 background color presets + Grid Style selector).
     - Section 3: All 13 drawing tools in a 2-column quick-select grid with keyboard shortcut badges.
     - Section 4: Creative & Insert Tools (Image, PDF, Mermaid/Diagram Studio, Multilingual Translator).
     - Section 5: Canvas Actions (PNG/SVG export, Clear canvas with safety modal).
     - Section 6: Preferences & System (Dark/Light mode, Palm Rejection, Shortcuts Modal, Feedback, GitHub v1.2.0 link).

4. **Diagram & Mermaid Studio Modal (`DiagramStudioModal`)**:
   - Integrated live Mermaid rendering via `mermaid.render` and native Aras DSL rendering via Tauri `render_diagram` IPC.
   - Added 5 pre-built templates (Architecture, Sequence, Flowchart, State Machine, Aras DSL Flow).
   - Provided live syntax error feedback, copy-to-clipboard actions, and single-click insertion directly onto the canvas via `canvasRef.current?.addDiagram(code, svg)`.

5. **Multilingual Text Studio Modal (`TextTranslatorModal`)**:
   - Integrated multi-language translation supporting English, Malayalam, Tamil, Telugu, Hindi, Spanish, French, German, Japanese, Chinese, Arabic, and Russian.
   - Provided offline technical dictionary matching for instant latency-free translation, plus live API fallback.
   - Provided direct "Insert as Text" button placing text on the active canvas via `canvasRef.current?.addText(text)`.

6. **Canvas & Tool Ergonomics (`src/components/AerialCanvas.tsx` & `src/lib/types.ts`)**:
   - Registered `'magic_pen'` in `ToolId` union and engine dispatch.
   - Implemented dynamic `backgroundColor` prop propagation to canvas element style and drawing context.
   - Modernized the inline text input overlay with Araskova typography, Enter key commit, and immediate `engine.render()`.
   - Tuned stroke scratch-to-erase bounding box and aspect ratio filters in the Rust engine to prevent accidental erasure of parallel lines (`=`) and crossbars (`t`).

## Consequences

- **Positive**:
  - Every tool in Aerial is fully accessible, visible, and functional across desktop and library contexts.
  - Multi-canvas workflow allows users to organize complex architectures, diagrams, and notes into distinct boards.
  - The side menu adapts cleanly to all viewport heights without clipping or losing controls.
  - v1.2.0 release delivers comprehensive feature maturity across web, library, and desktop distributions.
