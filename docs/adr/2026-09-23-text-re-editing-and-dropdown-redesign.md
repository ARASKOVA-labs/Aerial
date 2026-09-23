# ADR 2026-09-23: Text Re-Editing Precision Engine and Machinery Brutalist More-Tools Dropdown Redesign

## Status
Accepted

## Context
Following testing of the draggable text box and canvas navigation, two critical UX and visual flaws were identified:
1. **Inability to Re-Edit Text After Creation**:
   - The user reported: *"i cant edithe text again after getting creatored"*.
   - Root Causes identified:
     - Serde enum serialization in Rust serialized `Element.kind` as `"Text"` (capital 'T'). The JavaScript check `el.kind === 'text'` evaluated to `false`, causing double-click to silently fall back to `window.prompt()`, which fails or is disabled in desktop webviews.
     - When the `text` tool was active, clicking an existing text element ignored the clicked element and spawned a new empty text box over it (`elementId: null`) instead of loading the existing element into the editor.
     - Text element hit-testing in the Rust engine had 0px tolerance, requiring clicking exact vector glyph paths rather than the text bounding box.
     - There was no keyboard trigger (`Enter`) to edit a selected text element, nor a quick floating action pill.
2. **More Tools (`...`) Dropdown Layout and Aesthetic Inconsistencies**:
   - The user provided a screenshot of the `...` menu and requested: *"fix this as well with the new design aesthetic and also responsivebess"*.
   - Issues in the existing menu:
     - Hardcoded `w-52` container width caused text items like `CALLIGRAPHY PEN (F)` to wrap awkwardly across two lines (`CALLIGRAPHY PEN\n(F)`).
     - Centered positioning `left-1/2 -translate-x-1/2` on a right-anchored toolbar button clipped the menu or caused off-screen overflow on smaller viewports.
     - Typography was plain monospace with raw concatenated parentheses `(F)` rather than structured design system badges.
     - Lacked machinery-grade brutalist styling, squircle icon badges, clear section status dots, and responsive viewport clamping.

## Decision

1. **Rust WebAssembly Hit-Testing & Text Re-Editing (`aerial-core/aerial-engine/src/lib.rs`)**:
   - Added `pub fn get_element_at(&self, raw_x: f64, raw_y: f64) -> Option<String>` to hit-test elements directly at screen coordinates with full matrix inversion and bounding box checks.
   - Added generous 16.0px click-padding around text elements in `Tool::Select` (`on_mouse_down`) and `on_double_click` for effortless selection and double-clicking.
   - Fixed case sensitivity in `src/components/AerialCanvas.tsx`: changed all checks to `el.kind && el.kind.toLowerCase() === 'text'`.

2. **Multi-Modal Text Editing Triggers (`src/components/AerialCanvas.tsx`)**:
   - **Click with Text Tool**: When `activeTool === 'text'`, clicking an existing text element hit-tests via `get_element_at`. If hit, opens `AerialDraggableTextBox` directly with the element's existing content, dimensions, and styling.
   - **Double-Click**: Uses `get_element_at` and `on_double_click` with case-insensitive `"text"` validation, opening `AerialDraggableTextBox` in-place.
   - **Keyboard Enter**: Pressing `Enter` when a text element is selected (or when `selectedTextEl` is active) immediately launches the text editor.
   - **Floating Quick Edit Action Pill**: When a text element is selected with the Select tool (`activeTool === 'select'`), renders a sleek floating pill `[✏️ EDIT TEXT  Press ↵ Enter]` above the element with Araskova Orange border and hover animation.

3. **Machinery Brutalist Dropdown Redesign (`src/components/AerialToolbar.tsx`, `src/App.tsx`)**:
   - Redesigned `DropdownToolBtn` component:
     - Automatically parses `title="Calligraphy Pen (F)"` into clean `displayLabel` and `displayShortcut`.
     - Left: Squircle icon badge (`w-7 h-7 rounded-lg bg-[var(--secondary)]`) with micro-hover scale and Araskova Orange active state.
     - Center: Clean sans-serif label (`font-sans font-medium text-xs`) with `whitespace-nowrap truncate` to guarantee zero awkward text wrapping.
     - Right: Dedicated machinery `<kbd>` shortcut badge (`px-1.5 py-0.5 rounded text-[10px] font-mono`).
     - Supports `variant="danger"` for destructive actions (Clear Board) and `variant="accent"` for high-impact tools (Magic Pen).
   - Container & Responsiveness:
     - Aligned `right-0 mt-2` on the `...` button so the menu opens inward from the right toolbar edge, preventing any clipping.
     - Width upgraded to `w-64 max-w-[calc(100vw-2rem)]` ensuring zero horizontal overflow on any mobile, tablet, or desktop viewport.
     - Added Araskova Orange section dots (`w-1.5 h-1.5 rounded-full bg-[#e73f07]`) and sleek divider borders for machinery aesthetics.

4. **Version and State Synchronization**:
   - Added `onToolChange={(tool) => setActiveTool(tool)}` to `<AerialCanvas>` in `App.tsx` ensuring canvas-initiated tool switches remain synchronized with toolbar UI state.
   - Bumped version string to `v1.2.2`.

## Consequences
- Text elements can now be edited effortlessly through 4 independent interaction vectors (Text tool click, double-click, keyboard Enter, and floating edit pill).
- The More Tools dropdown looks exceptional with squircle badges, dedicated `<kbd>` tags, zero wrapping, and full viewport responsiveness.
