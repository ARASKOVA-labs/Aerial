# ADR 2026-09-23: Canvas Tap Dismissal for Menus and Dynamic Diagram Theme Synchronization

## Status
Accepted

## Context
Following the deployment of the Araskova machinery brutalist diagram aesthetic, the user identified two critical UX and graphical synchronization issues:
1. *"the marid chart is not switching based on the theme of the canvas which is problamatic and need to be fixed"*
2. *"when an option is selcted and a menu open up we should be able to exit it by just tapping anywhere on the canvas same for all the pop up menus also the menu that appead for colour palatter selection of eahc brush and eraser that as well"*

### Technical Root Causes:
1. **Mermaid Diagram Theme Desynchronization**:
   - In previous iterations, when the canvas theme switched between dark (`#0a0a0a`) and light (`#ffffff`), existing diagram elements on the canvas retained their pre-rendered rasterized images in the WASM engine image cache (`image_cache`).
   - SVG styling in `applyAraskovaDiagramAesthetics` did not dynamically rewrite DOM node fills, borders, and text colors based on the current theme (`isDarkMode` and `style`), relying solely on Mermaid's internal theme variables which cached previous runs.
   - When converting SVG strings into `Image` instances for canvas rasterization in WebKit (macOS Tauri WKWebView), SVGs without explicit pixel `width` and `height` attributes or loaded via unhandled Blob URLs failed silently without updating the engine cache.
2. **Menu and Popover Canvas Tap Dismissal & Stray Mark Bug**:
   - The `<canvas>` element consumed pointerdown events, preventing clicks on the canvas from bubbling up to React containers.
   - When popovers (Settings popover with brush palettes/eraser sizes, More Tools dropdown, and Hamburger sidebar) were open, tapping on the canvas did not close them reliably, or when it did, the tap immediately triggered an unwanted stroke, dot, or selection on the canvas because the canvas event handler didn't suppress drawing on dismissal.
   - The toolbar lacked dedicated buttons for opening brush color palettes or eraser settings directly, forcing users to discover non-obvious secondary clicks.

---

## Decision

### 1. Dynamic On-Canvas Diagram Re-Theming (`src/components/AerialCanvas.tsx` & `src/lib/diagram-theme.ts`)
- **Deep SVG DOM Synchronization**:
  - Enhanced `applyAraskovaDiagramAesthetics` to accept `isDarkMode` and `style`, explicitly injecting a scoped `<style id="araskova-theme-override">` tag and directly mutating SVG DOM attributes (`fill`, `stroke`, `color`) for all `.node rect`, `.node circle`, `.node polygon`, `.node text`, `.cluster rect`, and `.edgePath .path`.
  - In light mode: nodes adopt `#ffffff` background with `#18181b` border and `#09090b` text.
  - In dark mode: nodes adopt `#18181b` background with `#3f3f46` border and `#f4f4f5` text.
  - Subgraph cluster wireframes dynamically switch between `#101012` (dark) and `#fafafa` (light).
  - Explicit pixel dimensions are calculated and enforced directly on `<svg width="..." height="...">` based on the SVG `viewBox`.
- **Dual Rasterization Pipeline (`renderSvgToImage`)**:
  - Implemented a unified helper that converts sanitized SVGs into base64 data URLs (`data:image/svg+xml;base64,...`) with an automatic Blob URL fallback and full `onload`/`onerror` handling.
- **Engine Image Cache Synchronization**:
  - Created `rethemeDiagrams(isDark)` in `AerialCanvas.tsx`:
    1. Queries the current scene via `engine.get_scene_json()`.
    2. Identifies all elements of kind `Diagram`.
    3. Resets Mermaid's internal configuration state via `(mermaid as any).mermaidAPI?.reset?.()`.
    4. Re-renders the Mermaid / Aras DSL code with `getAraskovaMermaidConfig(isDark, style)`.
    5. Post-processes the SVG via `applyAraskovaDiagramAesthetics`.
    6. Converts to image and calls `engine.set_cached_image(BigInt(el.id), img)` and `engine.render()`.
  - Hooked into both the `useEffect([isDarkMode])` lifecycle and the imperative `setDarkMode(isDark)` API.

### 2. Universal Tap-to-Dismiss with Accidental Mark Suppression (`src/App.tsx` & `src/lib/types.ts`)
- **Return-Value Contract for `onCanvasPointerDown`**:
  - Updated `AerialCanvasProps.onCanvasPointerDown` to `() => boolean | void`.
  - In `App.tsx`, `closeAllPopups` returns `true` if any menu or popover (`showSettings`, `showMoreTools`, `isMenuOpen`, `showWelcome`) was open.
  - In `AerialCanvas.tsx`, `onPointerDown` calls `const dismissed = onCanvasPointerDown?.()`. If `dismissed === true`, it immediately returns, suppressing drawing, selection, and accidental marks.
- **Window Capture Listener**:
  - Added capture-phase pointerdown listener (`window.addEventListener('pointerdown', ..., true)`) verifying element containment across `settingsRef`, `settingsBtnRef`, `moreToolsRef`, `moreToolsBtnRef`, `sidebarRef`, and `sidebarBtnRef`.
- **Dedicated Toolbar Buttons for Palettes & Eraser Settings**:
  - Added dedicated reactive toolbar buttons:
    - For drawing tools: a color swatch indicator showing the active stroke color and width, with `ref={settingsBtnRef}` to toggle the color palette and stroke size popover.
    - For the eraser: an eraser mode button (`stroke`, `precision`, `element`) with `ref={settingsBtnRef}` to toggle eraser settings.
  - Allowed clicking the active tool button to toggle its settings popover.

### 3. DiagramStudioModal Adaptive Aesthetics (`src/App.tsx`)
- Synchronized initial and runtime `diagramStyle` with `isDarkMode ? 'brutalist' : 'industrial_light'`.
- Computed `effectiveDark` for accurate rendering regardless of style selection.
- Adapted the modal container card, header, editor, preview box, and buttons to seamless dark and light theme styles.

---

## Consequences & Verification
- **Aesthetic Integrity**: Switching canvas themes immediately re-themes all diagrams on the board in real time, eliminating hardcoded dark-on-dark or light-on-light illegibility.
- **Flawless Interaction**: Menus and popovers dismiss instantly upon tapping anywhere on the canvas or background without causing unwanted strokes or board clutter.
- **Build & Check**: `bun run build`, `bun run build:lib`, and `cargo check --manifest-path src-tauri/Cargo.toml` all pass with zero errors.
- **Typography & Brand Standards**: Zero Orbitron usage, strictly adhering to Araskova brand guidelines (`#0a0a0a`, `#111111`, `#2a2a2a`, `#81868b`, `#f3f3f2`, `#e73f07`).
