# ADR 2026-09-24: Supersonic Delta Brand Identity, Native Template Tray Icon, and Dedicated Lightweight Quick Note Window Architecture

## Status
Accepted

## Context
User identified three critical usability and aesthetic pain points:
1. **Brand Identity**: "we need to redsing the logo man its like it deosnt have life what do you thnk" — The existing monogram lacked energy, dynamic personality, and aeronautical character.
2. **Tray Stencil Bug**: The macOS menu bar displayed a solid black box (`l-monogram-1024.png`) without alpha transparency or template mode adaptation.
3. **Quick Note Overcrowding & Process Heaviness**: "also th ui klook too crouwded now quick note are supposed ot be simpel and short size and not open the entire applaiction and make sure evryhting working" — The Quick Note dialog was 520px tall with redundant toolbars and large footer buttons, and triggered the full heavy 1600px main canvas process window.

---

## Technical Architecture & Decisions

### 1. Supersonic Delta Brand Identity (`src/AerialLogo.tsx`, `public/`)
- **Aesthetic Overhaul**: Designed the **Aerial Supersonic Delta** emblem — an aerodynamic faceted stealth chevron merging the letter 'A' with supersonic flight dynamics.
- **Colorway**: Rich Araskova flame gradient (`#c02602` deep ember $\rightarrow$ `#e73f07` signature orange-red $\rightarrow$ `#ff6b35` luminous afterburner) with a precision delta core cutout.
- **Implementations**:
  - `src/AerialLogo.tsx`: Production React vector component with glowing ambient filter and dual-theme adaptation.
  - `public/aerial-logo.svg`, `public/favicon.svg`, `public/favicon.png`: Modern web & favicon assets.
  - `src-tauri/icons/`: Generated multi-resolution application icons (32x32, 128x128, 512x512) via `scripts/generate-icons.py`.

### 2. Native macOS Menu Bar Stencil Tray Icon (`src-tauri/src/lib.rs`, `src-tauri/icons/`)
- **Problem**: Tauri defaulted to `app.default_window_icon()`, rendering a solid opaque black square in macOS menu bar without adapting to dark/light wallpaper contrast.
- **Solution**:
  - Generated pure transparent alpha stencil `tray-icon.rgba` (32x32, 4096 bytes) and corresponding PNG assets.
  - In `src-tauri/src/lib.rs`, loaded raw buffer into `tauri::image::Image::new(TRAY_RGBA, 32, 32)` and configured `.icon_as_template(true)` on macOS.
- **Outcome**: The macOS menu bar displays a razor-sharp, monochromatic vector stencil that dynamically adapts to system light mode, dark mode, menu item clicks, and macOS tinting.

### 3. Dedicated Lightweight Quick Note Window Architecture (`src-tauri/tauri.conf.json`, `src/main.tsx`)
- **Problem**: Opening quick notes in the single-window architecture forced the full canvas application to unhide, consuming memory and visually overwhelming users with a heavy 1600px whiteboard.
- **Solution**:
  - Registered a second window `"quicknote"` in `src-tauri/tauri.conf.json`:
    - Dimensions: `width: 520, height: 300`
    - Window styles: `transparent: true, decorations: false, alwaysOnTop: true, visible: false, skipTaskbar: true`
    - Target URL: `index.html?quicknote=true`
  - In `src/main.tsx`, parsed URL search parameters: if `quicknote=true`, mounts `<QuickNoteStandalone>` directly, skipping `<App>` and its heavy dependencies (Mermaid, WASM canvas, toolbars, diagram modals).
  - In `src-tauri/src/lib.rs`:
    - Tray click and global shortcuts (`⌥Space`, `⌘⇧A`) specifically target `app.get_webview_window("quicknote")`.
    - Main canvas window remains completely hidden during note taking.
    - Added Tauri IPC command `open_main_canvas` for when the user decides to promote or view their canvas.

### 4. Compact, Streamlined Quick Note UI (`src/components/QuickCanvasModal.tsx`)
- **Height Reduction**: Reduced text mode modal height from 520px down to ~285px (~380px in sketch mode) with max-width 490px.
- **Removed Visual Clutter**:
  - Eliminated the redundant stacked secondary header bar and oversized 5-button 70px footer block.
  - Implemented a unified 32px bottom action strip containing:
    - Markdown micro-chips: `[ ]` (Todo), `💡` (Idea), `</>` (Code), `🕒` (Timestamp) with `onMouseDown` focus protection.
    - Action buttons: `clear`, word count badge, `Board` (save as new board), `Stamp` (primary action).
    - Sketch tools: Pen, Highlighter, Magic Pen, Eraser, color swatches, and stroke width pills (`1.5`, `3`, `6`).
  - Added collapsible Recent Archive drawer accessed via the clock icon in the header.

### 5. Cross-Window Stamping Ingestion (`src/App.tsx`)
- When `onStampText` or `onStampSketch` is executed in the standalone window, the text or sketch data URL is stored in `localStorage` (`aerial_quick_stamp_text`, `aerial_quick_stamp_sketch`) and `open_main_canvas` is invoked.
- `src/App.tsx` listens to `focus` and `storage` events: upon activation, it consumes the pending stamp, calculates the active viewport center, stamps the item, and clears the storage keys.

---

## Verification & Metrics
- `bun run build`: Built production bundle in 3.90s with 0 errors.
- `cargo check --manifest-path src-tauri/Cargo.toml`: Compiled in 1.83s with 0 warnings/errors.
- Design Tokens: Verified adherence to Araskova brutalist design standards (`#0a0a0a`, `#111111`, `#e73f07`), Roboto/Inter typography, and Space Mono metadata.
- Orbitron Ban: Checked and verified zero Orbitron font occurrences.
- Release safety: All changes kept local; no tags or remote CI/CD release builds triggered.
