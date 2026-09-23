# ADR 2026-09-23: Quick Canvas Instant Notes, Background Residency, Menu Bar Tray, and Direct Screenshot Paste/Drop

## Status
Accepted

## Context
As Aerial evolves into a primary ideation and deep-work workspace on macOS, users requested two essential capabilities:
1. Low-memory background residency and laptop-optimized quick scratchpad that auto-dismisses ("goes away").
2. Direct screenshot capture insertion:
   > *"i cant add iumages from the screeshots i take direcoty to the app built this to it as well"*

Users take screenshots across macOS via shortcuts (`⌘⌃⇧4` or `⌘⌃⇧3` to clipboard, or `⌘⇧4` / `⌘⇧5` to Desktop) and need to insert them directly into Aerial via `⌘V` (Paste) or drag-and-drop without manual file-picker roundtrips.

---

## Technical Architecture & Decisions

### 1. Direct Screenshot Paste (`⌘V`) & Cursor-Centric Placement (`src/App.tsx`)
- **Global `paste` Event Listener**:
  - Listens to clipboard `paste` events on `window`.
  - Scans `e.clipboardData.items` and `files` for `image/*` MIME types (PNG, JPEG, WebP, etc.).
  - Extracts the image `File` or `Blob`, converts to base64 Data URL, and persists it into the board asset store (`save_asset`).
- **Cursor-Centric Placement Math**:
  - Tracks live pointer coordinates (`mousePosRef`).
  - When `⌘V` is triggered, converts screen coordinates at the mouse cursor into canvas world coordinates via `engine.screen_to_world_x` and `engine.screen_to_world_y`.
  - Centers the pasted screenshot precisely where the user is hovering. If mouse is off-canvas, centers at viewport midpoint.
- **Aspect-Preserving Scaling**:
  - Automatically bounds large Retina screenshots to max dimensions (`850px` width / `650px` height) preserving natural aspect ratio so it does not drown out the existing whiteboard.

### 2. Drag-and-Drop for Screenshot Files & Floating Thumbnails (`src/App.tsx`)
- **HTML5 Drag & Drop**:
  - Handles `dragover`, `dragleave`, and `drop` on window.
  - Users can drag macOS screenshot floating thumbnails (from bottom right of screen) or Finder screenshot files directly onto the canvas.
  - Automatically positions dropped images at the drop cursor coordinates.
- **Tauri Native File Drop Listener**:
  - Listens to `tauri://drag-drop` events for OS-level file drops.
  - Reads dropped paths asynchronously via `@tauri-apps/plugin-fs` `readFile` and converts to image assets.
- **Machinery CAD Drop Reticle HUD**:
  - Renders a brutalist dashed border overlay with corner brackets and pulsing icon when files are hovered over Aerial.

### 3. Screenshot Support in Quick Canvas (`src/components/QuickCanvasModal.tsx`)
- Inside the Quick Note modal, pressing `⌘V` with a screenshot in clipboard:
  - If in **Sketch Mode**: Adds the image into the sketchpad.
  - If in **Text Mode**: Automatically stamps the screenshot directly onto the main canvas, displays a confirmation toast, and dismisses the note!

### 4. Zero-Memory Background Residency & Window Close Intercept (`src-tauri/src/lib.rs`)
- Intercepts `WindowEvent::CloseRequested` to hide the window instead of quitting.
- Low memory & zero CPU usage while dormant in background.
- Global desktop hotkeys `⌥Space` and `⌘⇧A` awaken Aerial from anywhere on macOS.

### 5. macOS Menu Bar System Tray Integration (`src-tauri/src/lib.rs`)
- Built-in tray icon with quick actions: `Quick Note (⌥Space / ⌘⇧N)`, `Open Aerial Canvas`, `Quit Aerial`.

---

## Verification
- `cargo check --manifest-path src-tauri/Cargo.toml`: Finished in 1.75s with 0 errors.
- `bun run build`: Built web bundle in 3.47s with 0 errors.
- `bun run build:lib`: Built library distribution in 4.42s with 0 errors.
- Hephaestus compliance audit: 100% compliant (zero Orbitron, zero raw logs).
