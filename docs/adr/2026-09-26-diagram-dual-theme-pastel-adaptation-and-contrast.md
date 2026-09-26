# ADR: Mermaid Diagram Dual-Theme Pastel Adaptation & Dynamic Contrast Guard

## Context
When users designed diagrams in Light Mode with custom pastel class definitions (e.g. `fill:#e1f5fe`, `fill:#f3e5f5`, `fill:#fff3e0`, `fill:#e8f5e9`) and switched to Dark Mode, the diagrams broke visually:
1. Mermaid and Aerial dark mode themes set default text color to `#f4f4f5` (white). Because the user's `classDef` omitted an explicit `color:`, white text was rendered directly over bright pastel fills (~94% lightness), causing total contrast collapse (1.1:1 ratio) and rendering the text unreadable.
2. In `themeCSS`, `.node .label { fill: ${textPrimary} !important; color: ${textPrimary} !important; }` prevented any user-specified `color:` from taking effect.
3. The glaring bright pastel boxes clashed harshly with the pitch-black Araskova brutalist canvas.

## Decision & Implementation

1. **Intelligent Dark-Mode Pastel Adaptation (`src/lib/diagram-theme.ts`)**:
   - Added color conversion utilities (`hexToHsl`, `hslToHex`, `parseColorToHsl`).
   - When in Dark Mode (`isDark === true`), `applyAraskovaDiagramAesthetics` inspects SVG `<style>` rules and node inline styles for light pastel fills (`lightness >= 0.55`).
   - Automatically adapts light-mode pastel fills into rich, machinery dark-tinted surfaces (`lightness = 0.12`, preserving original hue and saturation):
     - Light Blue (`#e1f5fe`) → Deep Ocean Blue (`#0a232e`)
     - Light Purple (`#f3e5f5`) → Deep Twilight Violet (`#251029`)
     - Light Peach/Orange (`#fff3e0`) → Deep Bronze/Amber (`#2e200a`)
     - Light Mint/Green (`#e8f5e9`) → Deep Cyber Emerald (`#112713`)
   - Keeps original saturated strokes (`#0288d1`, `#8e24aa`, `#f57c00`, `#388e3c`) intact.
   - Text color (`textPrimary = #f4f4f5`) now achieves a 14:1 contrast ratio against the deep dark surfaces.

2. **Dynamic Text Contrast Guard**:
   - Removed `!important` from `fill:` and `color:` on `.node .label` in `themeCSS`, allowing user-specified `classDef ... color:#...` to take precedence.
   - In SVG DOM processing, inspects each node's effective shape fill:
     - If the background fill is light (`lightness > 0.50`), text is automatically forced to `#0a0a0a` with `font-weight: 700`.
     - If the background fill is dark (`lightness <= 0.50`), text is set to `textPrimary` (`#f4f4f5`).

## Consequences
- Diagrams with light-mode pastel fills automatically adapt to high-contrast, machinery-grade dark mode surfaces when switching themes.
- White-on-pastel contrast collapse is 100% eliminated.
- Light mode retains full daylight pastel contrast and dark text.
