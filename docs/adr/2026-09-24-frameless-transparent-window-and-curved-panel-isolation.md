# ADR: Frameless Transparent Window Architecture & Boxy Border Elimination

## Context
When opening Quick Notes on macOS in standalone mode, a sharp rectangular border and dark rectangular background ("boxy border") was visibly rendered around the inner rounded ("curvy") card panel. The user requested removing this outer rectangular box completely so that only the curvy, rounded panel remains permanently visible against the desktop wallpaper.

## Root Cause Analysis
1. **Opaque `body` Background Color**:
   - In `src/index.css`, `body { background-color: var(--color-background); }` painted the entire webview window (560×340px) with solid `#0a0a0a`.
   - Even though the native window had `"transparent": true`, WebKit rendered an opaque black rectangular background over the whole window.
2. **Container Padding Exposing Background**:
   - In `QuickNoteStandalone.tsx`, the outer wrapper had `p-1` (4px padding).
   - This 4px gap between the `rounded-2xl` card and the rectangular window edges exposed the solid black background of `body`, creating sharp 90-degree black corners.
3. **macOS Native Window Shadow**:
   - By default in Tauri, windows have `"shadow": true`. On macOS, frameless windows receive a 1px border outline and drop shadow around the rectangular window perimeter, forming the visible boxy border.

## Decision & Implementation
1. **Explicit Window Transparency (`shadow: false` & `set_shadow(false)`)**:
   - In `src-tauri/tauri.conf.json`, added `"shadow": false` to the `quicknote` window configuration.
   - In `src-tauri/src/lib.rs`, called `q_win.set_shadow(false)` during Tauri setup to prevent macOS from drawing any native rectangular window border or shadow.
2. **Transparent HTML/Body/Root Rules**:
   - In `src/index.css`, added strict transparency rules:
     ```css
     html.quicknote-window,
     body.quicknote-window,
     body.quicknote-window #root {
       background: transparent !important;
       background-color: transparent !important;
       box-shadow: none !important;
       border: none !important;
       outline: none !important;
     }
     ```
   - In `src/main.tsx` and `QuickNoteStandalone.tsx`, immediately applied `quicknote-window` and set inline `backgroundColor = 'transparent'` to both `document.documentElement` and `document.body`.
3. **Elimination of Container Inset**:
   - In `QuickNoteStandalone.tsx`, removed `p-1` and set `p-0`.
   - The card now maps directly to the window boundaries with its own `rounded-2xl border border-[#2a2a2a]`.
   - Outside the curved corner radius of the card, all pixels are 100% transparent alpha (`rgba(0,0,0,0)`), allowing the macOS desktop wallpaper to show through cleanly without any boxy artifacts.

4. **WKWebView Native Transparency (`macos-private-api` & `macOSPrivateApi: true`)**:
   - In macOS WebKit, WKWebView defaults to `drawsBackground = YES` (solid white background). On frameless transparent windows with rounded borders, any transparent pixels outside the corner radius displayed as white wedges ("weird white corners").
   - Added `"macOSPrivateApi": true` in `tauri.conf.json` under `"app"` and enabled the `"macos-private-api"` feature flag on `tauri` in `src-tauri/Cargo.toml`. This activates `wry/transparent`, allowing Tauri to set WKWebView `drawsBackground = NO`.
   - Programmatically set `q_win.set_background_color(Some(tauri::window::Color(0, 0, 0, 0)))` in `lib.rs`.
5. **Pure Pitch-Black Invariant (`#000000`)**:
   - Replaced all translucent/greyish backgrounds (`bg-[#111111]/95`, `backdrop-blur-2xl`, `bg-[#0c0c0c]/80`) with solid pitch black (`bg-[#000000]`) on the card frame, header bar, textarea layer, and bottom action strip.
6. **Native Window Dragging**:
   - Attached `data-tauri-drag-region` and `onMouseDown={handleHeaderMouseDown}` (`getCurrentWindow().startDragging()`) to the header bar.
   - Added a tactical drag grip (`GripHorizontal`) with `cursor-grab active:cursor-grabbing` on the header, while properly exempting interactive controls (buttons, mode pills, inputs) so clicking tools remains responsive.

## Consequences
- The sharp rectangular outer border, black corner wedges, and WKWebView white corners are 100% eliminated.
- The panel renders in pure pitch black (`#000000`), with zero greyish bleedthrough.
- The Quick Note window is fully draggable anywhere on the screen by its header bar.
- Fully compliant with Araskova brutalist design standards.
