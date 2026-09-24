# ADR 2026-09-24: Quick Canvas Button Rectifications, Persistent Dual-Layer Architecture, and Canvas Re-Render Synchronization

## Status
Accepted

## Context
Following the rollout of Quick Canvas ("short notes") and background residency, users observed responsiveness issues across multiple controls inside the Quick Canvas modal:
1. Formatting chip buttons (`Todo`, `Idea`, `Link`, `Time`, `Code`) suffered from selection loss or focus drops due to browser click-blur events on `<textarea>`.
2. Switching between Text and Sketch unmounted the `<AerialCanvas>` component, causing the WASM engine to deallocate and re-boot, dropping active ref bindings, and resetting sketches before periodic autosave could capture them.
3. Canvas `Undo` and `Redo` methods invoked `engine.undo()` in Rust/WASM, but never triggered `engine.render()`, leaving canvas pixels visibly unchanged until another draw event occurred.
4. The header "Hide" button did not invoke `onHideWindow()` when `isOpenedFromBackground` was false.
5. Text stamping placed text at arbitrary default coordinates `(250, 250)` without theme contrast colors instead of the user's active viewport center.
6. Promoting a note to a board (`handleSaveQuickNoteAsBoard`) suffered from an async race condition where `switchBoard` wiped the board state before the text was inserted.

---

## Technical Architecture & Decisions

### 1. Persistent Dual-Layer Mounting (`src/components/QuickCanvasModal.tsx`)
- **Problem**: Conditional rendering `{activeTab === 'sketch' ? <AerialCanvas /> : <textarea />}` destroyed the canvas DOM and WASM instance whenever the user switched to Text mode.
- **Solution**: Both the `<AerialCanvas>` container and `<textarea>` container are mounted simultaneously in the DOM using CSS visibility and pointer events:
  - Sketch layer: `visibility: activeTab === 'sketch' ? 'visible' : 'hidden'`, `pointerEvents: activeTab === 'sketch' ? 'auto' : 'none'`, `zIndex: 10/0`.
  - Text layer: `visibility: activeTab === 'text' ? 'visible' : 'hidden'`, `pointerEvents: activeTab === 'text' ? 'auto' : 'none'`, `zIndex: 10/0`.
- **Outcome**: The WASM engine initializes once. Drawings and ink strokes are never wiped or discarded on tab switch. `canvasRef.current` is continuously valid and accessible to all toolbar actions.

### 2. Focus Retention on Markdown Action Chips (`src/components/QuickCanvasModal.tsx`)
- **Problem**: Clicking `Todo`, `Idea`, `Link`, `Time`, or `Code` blurred the `<textarea>`, resetting `selectionStart`/`selectionEnd`.
- **Solution**: Added `onMouseDown={(e) => e.preventDefault()}` on all chip buttons. Refactored `insertTextPrefix` to measure the active selection range, insert text, update state, and reposition the cursor using `requestAnimationFrame`.

### 3. Tool Auto-Switching on Color & Stroke Size Pick (`src/components/QuickCanvasModal.tsx`)
- If a user is on the `Eraser` tool and clicks a palette color swatch or stroke width (1.5, 2.5, 5, 8), the system automatically switches back to `freedraw` (Pen) and applies the new color/width immediately.

### 4. Engine Render Synchronization on Undo / Redo (`src/components/AerialCanvas.tsx`)
- Updated imperative ref methods (`undo`, `redo`, `deleteSelected`), keyboard shortcuts (`⌘Z`, `⌘⇧Z`, `⌘Y`), and `AerialZoomBar` callbacks to explicitly invoke `engineRef.current?.render()` after the engine modifies its stroke stack.

### 5. Explicit Window Hide Handler (`src/components/QuickCanvasModal.tsx`)
- Created a dedicated `handleHide` callback wired to the header "Hide" button (`Minimize2` icon) that calls `onClose()` and `onHideWindow?.()` regardless of invocation source.

### 6. Viewport-Centered Stamping & Contrast Theming (`src/App.tsx`)
- In `handleStampText`, the center of the viewport `(cx, cy)` is converted to world coordinates via `engine.screen_to_world_x` and `engine.screen_to_world_y`.
- Text is stamped in high-contrast theme color (`#f3f3f2` for dark mode, `#0a0a0a` for light mode).
- In `handleSaveQuickNoteAsBoard`, board creation awaits `switchBoard`, inserts text at `(100, 100)`, and immediately saves the new board state to the database.

### 7. Global Paste Conflict Guard (`src/App.tsx`)
- Prevented the global screenshot paste listener in `App.tsx` from executing if `showQuickCanvas`, `showDiagramModal`, or `showTranslatorModal` is active, preventing duplicate insertions behind open modals.

---

## Verification
- `cargo check --manifest-path src-tauri/Cargo.toml`: Finished in 2.64s with 0 errors.
- `bun run build`: Built production bundle in 7.22s with 0 errors.
- Araskova design invariants: Zero Orbitron, Roboto/Inter typography, Space Mono metadata, brutalist corner reticles intact.
- Remote release builds: Suppressed locally; no tags pushed.
