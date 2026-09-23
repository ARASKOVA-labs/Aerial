# ADR 2026-09-23: Magic Pen Straight-Line Handwriting Alignment and Universal Draggable Readjustable Text Box

## Status
Accepted

## Context
In feedback following the v1.2.1 release, two critical ergonomics and interaction capabilities were requested:
1. **Magic Pen Straight-Line Writing & Guidelines**:
   - The user requested refining the Magic Pen logic:
     - Render clear writing guidelines so that everything the user writes comes in **one straight line**.
     - Automatically convert handwriting strokes into recognized text aligned accurately along that baseline.
     - Prevent drooping, slanting, or fragmented text placement across multi-stroke words and sentences.
2. **Universal Draggable, Droppable & Readjustable Text Box**:
   - The user requested that the typed text box can be **dragged and dropped anywhere** across the canvas with comprehensive **readjustment features** (resizing, font size adjustments, font family selection, repositioning, and editing existing text elements).
   - Previously, the text tool relied on a basic inline `<textarea>` fixed to the initial click coordinates with no dragging, resizing, or font controls, and editing existing text used an unstyled `window.prompt()`.

## Decision

1. **Rust WebAssembly Engine Magic Guidelines & Baseline Snapping (`aerial-core/aerial-engine/src/lib.rs`)**:
   - Added `magic_baseline_y: Option<f64>` to `AerialCanvas` engine struct.
   - In `on_mouse_down`: dynamically anchor `magic_baseline_y = Some(wy + 15.0)` on the first stroke of a writing session. Subsequent strokes within an 80px vertical window lock to the exact same baseline, grouping words and phrases onto a single line.
   - In `on_mouse_move`: applied a magnetic baseline snap (within 4px of the anchored baseline) to eliminate drooping letters and cursive drift.
   - In `render()`: implemented illuminated machinery-grade writing guidelines for `Tool::MagicPen`:
     - **Baseline**: Glowing solid Araskova Orange (`#e73f07`, shadow glow, stroke width 1.5).
     - **Midline (x-height)**: Subtle dashed guide 20px above the baseline.
     - **Topline (cap-height)**: Clean solid guide 34px above the baseline.
     - **Descender line**: Faint dotted guide 14px below the baseline.
     - **Notebook rules**: Subtle horizontal guidelines rendered across the viewport when idle to aid handwriting alignment before the first stroke begins.
   - In `extract_magic_strokes()`: computes bounding boxes `(min_x, min_y, max_x, max_y)` and returns JSON containing both stroke ink coordinates and `{ bounds: { min_x, min_y, max_x, max_y, baseline_y } }`.
   - Added `world_to_screen_x` and `world_to_screen_y` coordinate conversion helpers and `update_text_element` in Rust engine for full undo/redo state preservation.

2. **Handwriting Recognition Pipeline (`src/components/AerialCanvas.tsx`)**:
   - Implemented an intelligent debounce loop: on `onPointerUp` with `magic_pen`, a 1.2-second debounce timer starts. If the user continues writing more letters, the timer resets so multi-stroke words and sentences are recognized together.
   - When the timer fires, `convertMagicStrokes()` parses the strokes and sends ink coordinates to Google Input Tools Handwriting API (`itc=${magicLanguage}-t-i0-handwrit`).
   - Inserts recognized text aligned precisely to `(bounds.min_x, bounds.baseline_y - 28.0)` using the selected font family and current stroke color.
   - Rendered a floating status badge (`Magic Pen · [LANG] · Straight-Line Guide`) with live conversion pulse indicator.

3. **Draggable & Droppable Text Box (`src/components/AerialDraggableTextBox.tsx`)**:
   - Built a dedicated Araskova-themed floating text box with:
     - **Draggable Header**: Header bar with `GripHorizontal` drag handle and pointer tracking allowing fluid drag-and-drop repositioning anywhere across the canvas.
     - **Font Size Stepper**: Live `[-]` and `[+]` buttons adjusting font size from 12px to 120px with immediate real-time canvas preview.
     - **Font Family Selector**: Supports `Inter` (Clean Sans), `Space Grotesk` (Modern Tech), `Caveat` (Handwritten), and `Rephen` (Araskova Brand).
     - **Color Swatches**: Instant color switching between Araskova Orange, Brand Light, Brand Dark, Blue, Green, and Amber.
     - **Corner Resize Handle**: Bottom-right diagonal resize handle to adjust width and height interactively.
     - **Keyboard Shortcuts**: `Enter` (without Shift) commits, `Shift+Enter` inserts newlines, and `Escape` cancels.
   - Connected `onDoubleClick` on existing text elements to open the `<AerialDraggableTextBox>` directly over the clicked element with its coordinates, text, and styling, completely replacing `window.prompt()`.

4. **Public Library Export & App Wiring (`src/index.ts`, `src/App.tsx`, `src/lib/types.ts`)**:
   - Exported `AerialDraggableTextBox` and `AerialDraggableTextBoxProps` from the core library.
   - Wired `magicLanguage` and `magicFont` props from `App.tsx` down to `AerialCanvas`.
   - Bumped version to `1.2.2` in `package.json`, `src-tauri/Cargo.toml`, and `src-tauri/tauri.conf.json`.

## Consequences
- Magic Pen handwriting now stays strictly aligned on one straight line with visual notebook guidelines and automatic text conversion.
- Text boxes can be dragged and dropped anywhere on the canvas, resized freely, and reconfigured on-the-fly with font and color controls.
- Double-clicking any existing text element brings up the interactive editor for seamless in-place editing.
