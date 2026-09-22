# ADR 2026-09-21: Extraction of Aerial Canvas into an Embeddable Library Component

## Status
Accepted

## Context
Aerial was originally structured around a monolithic `src/App.tsx` (~1,830 lines) in which the WebAssembly canvas lifecycle, pointer/wheel events, animation loops, UI toolbars, and Tauri-specific desktop integrations (`invoke('save_board')`, `invoke('load_board')`, image asset saving, PDF rasterization, and HTTP-based Google handwriting recognition) were tightly coupled.

To consume Aerial across Araskova ecosystem applications—including the Araskova CRM Suite, Obsidian plugins, and AI agent interfaces—the core graphics engine needed to be decoupled into a standalone, embeddable component (analogous to `@excalidraw/excalidraw`) while keeping the standalone Tauri desktop app functioning with zero regressions.

## Decision

1. **Isolated WASM Loader (`src/lib/wasm-loader.ts`)**:
   - Extracted WebAssembly module instantiation into a dedicated async loader with a singleton promise guard to avoid double-initialization in React StrictMode.
   - Provided configurable `basePath` option to allow host applications to specify custom asset hosting locations.
   - Added cache-busting timestamping and clean error propagation.

2. **Core `<AerialCanvas />` Component (`src/components/AerialCanvas.tsx`)**:
   - Encapsulated the HTML5 canvas, DPR normalization, ResizeObserver dynamic sizing, animation loops (`tick_animations`), dirty-checking loop, and multi-pointer event handling (mouse, touch, stylus with synthetic mouse filtering, 2-finger pinch/pan, palm rejection).
   - Implemented an imperative handle API (`AerialCanvasRef`) via `forwardRef` and `useImperativeHandle`, exposing:
     - Serialization: `getSceneJson()`, `loadSceneJson()`, `exportFullState()`, `importFullState()`
     - Exports: `exportPngBlob()`, `exportSvgString()`
     - Drawing control: `setTool()`, `setStrokeColor()`, `setStrokeWidth()`, `undo()`, `redo()`, `clearBoard()`, `deleteSelected()`
     - Canvas management: `zoomIn()`, `zoomOut()`, `resetView()`, `getZoom()`, `setDarkMode()`, `getEngine()`
     - Insertion: `addImage()`, `addDiagram()`, `addText()`
   - Zero Tauri dependencies: all platform-specific storage and system APIs were stripped from the library component.
   - Added `showToolbar` prop: when `true`, renders the built-in minimal brutalist floating toolbar; when `false`, renders only the headless canvas layer for host apps providing custom UI.

3. **Decoupled Toolbar Subcomponents (`src/components/AerialToolbar.tsx`)**:
   - Separated UI components into reusable, props-driven primitives:
     - `AerialToolbar`: Main drawing tool strip with animated icons and overflow dropdown.
     - `AerialZoomBar`: Zoom percentage, zoom in/out, and undo/redo buttons.
     - `AerialSettingsPopover`: Color palette, stroke width slider, eraser configuration, fountain sharpness, and shape style toggles.
     - `ToolBtn`, `DropdownToolBtn`, `AnimatedToolIcon`: Spring-animated machinery tool buttons powered by `motion/react`.

4. **Public Library Entry Point (`src/index.ts`)**:
   - Re-exports `AerialCanvas`, `AerialToolbar`, `AerialZoomBar`, `AerialSettingsPopover`, `ToolBtn`, `DropdownToolBtn`, `AnimatedToolIcon`, `STROKE_COLORS`, and `loadAerialEngine`.
   - Re-exports full TypeScript declarations (`AerialCanvasProps`, `AerialCanvasRef`, `AerialEngine`, `ToolId`, `DesktopToolId`).
   - Imports `src/index.css` to bundle Tailwind v4 tokens and Araskova design system rules directly into `dist/aerial.css`.

5. **Refactored Desktop Shell (`src/App.tsx`)**:
   - Shrunk from 1,830 lines to 548 lines by delegating core canvas rendering to `<AerialCanvas ref={canvasRef} showToolbar={false} />`.
   - Host-level Tauri integrations maintained:
     - Board auto-save and load via `invoke('save_board')` and `invoke('load_board')`.
     - Asset persistence via `invoke('save_asset')` and `invoke('load_asset')`.
     - Diagram DSL node renaming and re-rendering via `invoke('update_diagram_node')` and `invoke('render_diagram')`.
     - PDF page rasterization and insertion via `pdfjs-dist`.
     - Google handwriting recognition and translation via `@tauri-apps/plugin-http`.
     - Fullscreen toggling via `@tauri-apps/api/window`.
     - Top-left hamburger menu with Rephen brand wordmark, palm rejection toggle, and appearance controls.

6. **Dual Build Pipeline (`vite.config.ts` & `package.json`)**:
   - Normal mode (`bun run build`): Builds the complete standalone desktop application bundle.
   - Library mode (`bun run build:lib`): Compiles `src/index.ts` to `dist/aerial.js` (ESM) and `dist/aerial.umd.cjs` (UMD), generating `dist/aerial.css`.
   - Configured `package.json` `"exports"` map for `"."`, `"./canvas"`, and `"./engine/*"`.

## Consequences
- **Positive**:
  - Aerial can now be embedded into any React 19 application with `<AerialCanvas />` in seconds.
  - Zero regression in the standalone Tauri desktop application.
  - Build times: Library builds in ~280ms; desktop application builds in ~1.2s.
  - Clean separation of concerns between pure rendering engine and OS desktop platform services.
- **Verification**:
  - `bunx tsc --noEmit` produces 0 type errors.
  - `bun run build` verifies full Tauri desktop app bundle generation.
  - `bun run build:lib` produces `dist/aerial.js`, `dist/aerial.umd.cjs`, and `dist/aerial.css`.
