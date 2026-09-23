# ADR 2026-09-23: Removal of Scratch-to-Erase Logic, Precision Eraser Architecture, and Tauri Dependency Resolution

## Status
Accepted

## Context
1. **Accidental Deletions from Scratch-to-Erase**:
   - The user reported: *"also remove the scrach to erase logic as that is makinit so har dto write"*.
   - In rapid handwriting, cursive writing (e.g. the letters `w`, `m`, `u`), math symbols, and quick sketches, the algorithm detected continuous sharp direction changes (3 or more reversals within 80px) and classified the writing stroke as an intentional "scratch" gesture.
   - This triggered `erase_by_scratch()`, deleting strokes the user was currently writing, making natural note-taking frustrating.
2. **Eraser Customization and Ergonomics**:
   - The user requested: *"so also upgrade the eraser logic so that i becomes easy to get different type of eraser and also there is a small lag when selecting gtools fix that as well partilucalry eraser as the cursor get sstuff"*.
   - Issues identified:
     - Only whole-stroke and whole-element erasure was supported. Slicing paths or doing surgical point-level trimming was not possible.
     - Changing eraser types required opening nested menus.
     - Moving the cursor in eraser mode felt frozen/stuck because `onPointerMove` returned early if `activeDrawingPointerIdRef.current !== e.pointerId`. When hovering without holding down the mouse, the custom SVG cursor position never updated, while native cursor had `cursor-none`, causing the cursor to freeze in place.
     - `setEraserPos` used React `useState`, causing continuous component re-renders at 120 FPS on every mouse move.
     - Selecting tools triggered dual re-renders between `App.tsx` and `AerialCanvas.tsx` due to circular `onToolChange` callbacks.
3. **CI / Tauri Build Mismatch**:
   - The GitHub Actions release workflow failed:
     ```
     Found version mismatched Tauri packages:
     tauri-plugin-http (v2.7.0) : @tauri-apps/plugin-http (v2.5.9)
     Error: Command "bun ["tauri","build"]" failed with exit code 1
     ```
   - `Cargo.lock` was in `.gitignore`, so cargo resolution in GitHub Actions pulled `tauri-plugin-http 2.7.0` while `bun.lock` had `@tauri-apps/plugin-http@2.5.9`.

## Decision

1. **Complete Removal of Scratch-to-Erase Gesture**:
   - In `aerial-core/aerial-engine/src/lib.rs`, completely removed `is_scratch_gesture()`, `erase_by_scratch()`, `check_is_scratch_gesture()`, and `point_to_segment_dist_sq()`.
   - Removed scratch-gesture invocations in `on_mouse_down` and `on_mouse_up`.
   - Drawing now never triggers accidental erasures regardless of writing speed or pen direction changes.

2. **Three-Tier Eraser Engine in Rust WASM (`aerial-core/aerial-engine/src/lib.rs`)**:
   - Added `EraserType` enum (`Stroke`, `Precision`, `Element`) and field `eraser_type: EraserType` on `AerialCanvas`.
   - Exported `pub fn set_eraser_type(&mut self, t: &str)` and `pub fn get_eraser_type(&self) -> String` to WASM.
   - Upgraded `erase_at_world`:
     - **Stroke Mode**: Touches a stroke and removes it in its entirety.
     - **Precision Mode**: Surgically trims and removes points within the circular eraser radius (`dx*dx + dy*dy <= r2`), recalculates bounding boxes, and retains the remaining partial stroke paths.
     - **Element Mode**: Erases whole objects (shapes, text, diagram nodes, and images) upon touch.

3. **High-Performance DOM-Ref Eraser Cursor and Stuck-Cursor Elimination**:
   - Replaced React `useState` `eraserPos` with a direct DOM `eraserCursorRef`.
   - In `onPointerMove`, updated `eraserCursorRef.current.style.transform = translate3d(...)` at the very beginning of the handler before any pointer-capture or drawing checks. This ensures continuous, silky smooth 120 FPS cursor tracking even when hovering without clicking.
   - Handled `onPointerEnter` and `onPointerLeave` to show/hide the cursor cleanly.
   - Visualized mode-specific SVG cursors:
     - `Precision`: Accent crosshair with center dot (`#e73f07`).
     - `Stroke`: Dashed circle with center cross.
     - `Element`: Square object selector.

4. **Instant-Access Canvas Eraser HUD & Keyboard Cycling**:
   - Rendered a floating glassmorphic Araskova HUD at `bottom-6` whenever `activeTool === 'eraser'`:
     - 1-click mode switching: `[STROKE] [PRECISION] [OBJECT]`.
     - 1-click size presets: `[S: 14px] [M: 24px] [L: 40px] [XL: 64px]`.
     - Keybind helper: `(Tap E to cycle)`.
   - Added keyboard shortcut `E` / `9`: pressing when eraser is already selected cycles between `Stroke` -> `Precision` -> `Object`.
   - Prevented redundant circular tool-change re-renders by decoupling internal `applyTool(tool, notifyParent = false)` on ref calls.

5. **Tauri Plugin Semver Pinning and Cargo Lock Tracking**:
   - In `src-tauri/Cargo.toml`, pinned `tauri-plugin-http = "~2.5.0"` (matching `@tauri-apps/plugin-http@2.5.9`).
   - Pinned `tauri-plugin-dialog = "~2.7.0"`, `tauri-plugin-fs = "~2.5.0"`, and `tauri-plugin-shell = "~2.3.0"`.
   - Removed `Cargo.lock` from `.gitignore` so dependency locks are deterministically committed and used by GitHub Actions runners.

## Consequences
- Fast handwriting, cursive writing, and sketches are 100% stable with zero accidental erasures.
- Eraser switching is instantaneous via the floating HUD, popover, or keyboard shortcut `E`.
- Cursor motion is buttery smooth with zero lag or freezing.
- Tauri builds succeed both locally and on GitHub Actions CI.
