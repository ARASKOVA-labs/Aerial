# Architecture Decision Record (ADR)

## Title
Text Tool Dynamic Theme Contrast Synchronization and Quick Note Toolbox Relocation

## Status
Accepted

## Date
2026-09-27

## Context
1. **Black Text on Dark Mode Canvas (Text Tool Contrast Failure)**:
   - When entering Text mode (`activeTool === 'text'`) on a dark-mode canvas, the text being typed appeared as `#000000` (pitch black) on a `#111111` dark floating card.
   - The root cause was twofold:
     - `strokeColor` in both `App.tsx` and `AerialCanvas.tsx` was hardcoded to `#000000` regardless of the initial theme or subsequent theme toggles.
     - `AerialDraggableTextBox.tsx` initialized its local color to `initialColor || ...`, defaulting to black `#000000`. Furthermore, it lacked dynamic synchronization when `isDarkMode` changed, and the first color swatch in the toolbar was hardcoded to `#000000`.
   - On canvas theme toggling, typed text elements and the text tool editor did not react, leaving dark text illegible against dark backgrounds.
2. **Suboptimal Quick Note UI Placement**:
   - The Quick Note trigger existed as an isolated floating pill button (`✨ Quick Note ⌘⇧N`) pinned to the top-right corner of the viewport next to fullscreen controls.
   - This created awkward UI clutter outside the unified tool paradigm, disjointed from the main creation workflow.
   - Corner reticles inside the Quick Note modal produced boxy visual artifacts that clashed with the `rounded-2xl` curvature.

## Decision
1. **Dynamic Theme Contrast Resolution Helper (`resolveThemeContrastColor`)**:
   - Created `resolveThemeContrastColor(color, isDark)` in `src/components/AerialDraggableTextBox.tsx`.
   - In Dark Mode, any neutral dark color (`#000000`, `#0a0a0a`, `#111111`, `#18181b`, `#1a1a2e`, etc.) dynamically resolves to Araskova Brand Light (`#f3f3f2`).
   - In Light Mode, any neutral light color (`#ffffff`, `#f3f3f2`, `#f4f4f5`, etc.) resolves to Araskova Brand Dark (`#0a0a0a`).
   - Custom accent colors (e.g. Araskova Orange `#e73f07`, Blue `#3b82f6`, Green `#10b981`) are strictly preserved.
2. **Synchronized Theme-Aware `strokeColor`**:
   - `strokeColor` in `App.tsx` and `AerialCanvas.tsx` is initialized from the active theme (`isDark ? '#f3f3f2' : '#0a0a0a'`).
   - When the theme switches (via top nav or `⌘K`), `strokeColor`, the engine's stroke color, active text in `typingText`, and the color swatch palette (`getStrokeColors(isDarkMode)`) all flip automatically to high-contrast values.
   - Text editing on mouse down, double click, and Enter key now routes all initial colors through `resolveThemeContrastColor`.
3. **Editor Polish in `AerialDraggableTextBox`**:
   - Swatches dynamically prioritize the contrasting theme neutral first.
   - Textarea features `caretColor: '#e73f07'` and military-grade selection styling `selection:bg-[#e73f07]/30 selection:text-current`.
   - Added `useEffect` listening to `isDarkMode` to seamlessly update active text color unless a user explicitly chose an accent color.
4. **Relocation of Quick Note into Main Toolbox**:
   - Removed the floating `Quick Note` pill from the top-right viewport corner. Top right is simplified to a sleek, circular Fullscreen toggle button.
   - Moved `Quick Note (⌘⇧N)` as a dedicated, first-class `ToolBtn` directly into the top-center toolbox adjacent to `More Tools`.
   - Polished `QuickCanvasModal`: removed boxy corner reticles, standardized background tokens to `#0a0a0a` / `#111111`, set orange caret, and ensured full keyboard parity.

## Consequences
- Text tool typing is immediately crisp and high-contrast in both dark and light modes.
- Theme switching dynamically flips neutral text and tool strokes between `#f3f3f2` and `#0a0a0a` without leaving invisible black text.
- The UI is streamlined: all tool triggers reside exclusively in the main toolbox, eliminating awkward floating pill buttons.
