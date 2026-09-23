# ADR 2026-09-23: Quick Canvas Instant Note Taking, Background Residency, Menu Bar Tray, and macOS Shortcut Suite

## Status
Accepted

## Context
As Aerial evolves into a primary ideation and deep-work workspace on macOS, users requested an ultra-fast, shortcut-driven note taking workflow tailored specifically for laptop users:
> *"but right now it wont pop up like i think aerial has to run it the background without consuming a lot of memory to be able to act as a shortcut and also for people who are using laptop this will be hard as what they want is smthg that they cant type notes into quick and also that goes away so yeah can we tweak it so that it behaves like that"*

Desktop creative tools frequently suffer from modal friction: when working in other apps (browser, terminal, editor, Slack), users need a lightweight, frictionless capture tool that pops up on demand, autofocuses text input immediately, auto-saves their thoughts, and goes away without lingering or consuming heavy system memory.

---

## Technical Architecture & Decisions

### 1. Zero-Memory Background Residency & Window Close Intercept (`src-tauri/src/lib.rs`)
- **Native macOS Close Intercept**:
  - Attached `.on_window_event` listener in Tauri:
    ```rust
    if let tauri::WindowEvent::CloseRequested { api, .. } = event {
        let _ = window.hide();
        api.prevent_close();
    }
    ```
  - Closing the window via `⌘W` or the red window button no longer terminates the process. Aerial remains resident in the background with near-zero CPU and RAM overhead (UI rendering halted, WASM engine idle).
- **Global Hotkey Awakening**:
  - When `alt+space` or `super+shift+a` is pressed anywhere in macOS, Aerial immediately unminimizes, shows the window, grabs focus, and emits `quick-canvas:open` with `isOpenedFromBackground = true`.
- **Command `hide_window`**:
  - Added safe IPC command `hide_window` allowing frontend modals to smoothly hide the window back to the background on dismiss.

### 2. macOS Menu Bar System Tray Integration (`src-tauri/src/lib.rs`)
- Integrated `tauri` feature `tray-icon` with `TrayIconBuilder`:
  - Adds an unobtrusive tray icon in the macOS menu bar (top right next to clock).
  - Left-click or menu click opens **Quick Note** directly.
  - Native menu items:
    - `Quick Note (⌥Space / ⌘⇧N)`
    - `Open Aerial Canvas`
    - `Quit Aerial`
  - Zero `unwrap()` calls; robust error handling throughout tray registration.

### 3. Laptop-First Quick Note Scratchpad (`src/components/QuickCanvasModal.tsx`)
- **Laptop-First Defaults**:
  - Defaults to **Text Note Mode** (`activeTab = 'text'`) for keyboard-first capture without requiring a stylus.
  - **Instant Autofocus**: The textarea is automatically focused upon opening; the user hits the hotkey and begins typing immediately with zero mouse/trackpad interaction.
  - **Sleek Floating Card Geometry**:
    - Compact `max-w-2xl h-[520px]` in text mode, avoiding full-screen takeover.
    - Smoothly expands to `max-w-4xl h-[78vh]` when user switches to Sketch mode (`⌘2`).
- **"Goes Away" Auto-Dismiss Architecture**:
  - `⎋ (Escape)` or clicking the backdrop: Dismisses the note and calls `onHideWindow()`, instantly tucking Aerial back into the background and returning focus to the user's previous app.
  - `⌘↵ (Stamp & Hide)`: Stamps the note to the active board and immediately dismisses/hides.
  - Dedicated on-screen `Dismiss (⎋)` and `Hide (⌘H)` buttons.
- **Recent Quick Notes Archive Drawer**:
  - Manages a recent scratchpad history (`aerial_quick_notes_archive`) so past transient thoughts are preserved across sessions.
  - `⌘N` starts a fresh note, archiving the previous one automatically.
- **Rapid Syntax Insertion Chips**:
  - `[+ Todo]` (`- [ ] `)
  - `[+ Idea]` (`💡 `)
  - `[+ Link]` (`[title](url)`)
  - `[+ Code]` (```` ``` ````)
  - `[+ Time]` (`[HH:MM] `)

### 4. Mac Spotlight Command Palette (`src/components/CommandPaletteModal.tsx`)
- **Omnibox Launcher (`⌘K`)**:
  - Instant live fuzzy search across all application tools, boards, actions, and settings.
  - Full keyboard navigation with `↑`/`↓`, `Enter`, and `Escape`.

### 5. Comprehensive macOS Keyboard Shortcuts Suite (`src/App.tsx`)
| Shortcut | Action | Description |
|---|---|---|
| `⌥Space` / `⌘⇧A` | System Global Hotkey | Pop up Quick Note from any app across macOS |
| `⌘⇧N` / `⌘J` | Quick Note | Open instant scratchpad in-app |
| `⌘K` | Command Palette | Open Spotlight-style command launcher |
| `⌘1` / `⌘2` | Note Mode Switch | Switch between Text mode and Sketch mode |
| `⌘↵` | Stamp & Dismiss | Stamp note to active canvas and dismiss/hide |
| `⌘S` | Save as Board | Save note as dedicated board in sidebar |
| `⌘N` | New Note | Start blank quick note |
| `⌘H` / `⎋` | Dismiss & Hide | Dismiss scratchpad and hide Aerial to background |
| `⌘⇧S` | Export PNG | Export full visible board as PNG |
| `⌘B` | Toggle Sidebar | Show/hide board management sidebar |
| `⌘,` | Canvas Settings | Open canvas background & color palette menu |
| `⌃⌘F` | Toggle Fullscreen | Enter or exit native macOS fullscreen |
| `⌘0` | Reset Zoom | Reset zoom to 100% and center origin |
| `⌘+` / `⌘-` | Zoom In/Out | Step zoom level |

---

## Verification
- `cargo check --manifest-path src-tauri/Cargo.toml`: Finished in 1.61s with 0 errors.
- `bun run build`: TypeScript compiler and Vite bundler passed with 0 errors.
- `bun run build:lib`: Distribution and type declarations built with 0 errors.
- Hephaestus compliance audit passed (zero Orbitron, zero raw logs).
