# ADR 2026-09-23: Quick Canvas Instant Note Taking, Global Desktop Shortcuts, and macOS Command Suite

## Status
Accepted

## Context
As Aerial evolves into a primary ideation and deep-work workspace on macOS, users requested an ultra-fast, shortcut-driven note taking workflow and comprehensive desktop shortcuts:
> *"also after that is one then comes a new implementaion of shortcut based notetaking primarly focus on mac so that users can if they want take instant notes like the canvas will open up quick canvas and other shortuvts for desktop app uses"*

Desktop creative tools frequently suffer from modal friction: when an engineer, researcher, or designer needs to capture a transient thought or sketch a quick diagram, launching a heavyweight new board or interrupting their current layout breaks flow state.

---

## Technical Architecture & Decisions

### 1. Quick Canvas (Instant Note Taking Scratchpad) (`src/components/QuickCanvasModal.tsx`)
- **Dual-Mode Scratchpad**:
  - **Sketch Mode**: Embeds a zero-overhead `AerialCanvas` instance for freehand ink, highlighters, magic pen, text, and eraser strokes.
  - **Text Note Mode**: Minimalist markdown scratchpad with one-tap syntax helpers (Checklist, Bullets, Timestamp, Code Block).
- **Frictionless Stamping & Persistence**:
  - **Stamp to Main Canvas (`⌘↵`)**:
    - For sketches: Captures high-res canvas PNG blob, saves into local asset cache via Tauri `save_asset` IPC, and places it as a draggable image element directly at the main canvas viewport center.
    - For text: Adds a typography element directly onto the active canvas.
  - **Save as Board (`⌘S`)**:
    - Converts the scratchpad directly into a persistent Redb-backed board in the project sidebar with timestamped naming, immediately activating it.
  - **Auto-Persistence**:
    - Continuous auto-save of both sketch binary state and text notes to local storage (`aerial_quick_note_sketch`, `aerial_quick_note_text`), ensuring zero data loss across app launches.
  - **Direct Export**:
    - 1-click clipboard copy (`Copy PNG`) for instant pasting into Slack, Figma, Linear, or Xcode.

### 2. Tauri 2.0 Global Desktop Shortcuts (`src-tauri/src/lib.rs`)
- **System-Level Capture (`tauri-plugin-global-shortcut`)**:
  - Integrated `tauri-plugin-global-shortcut = "2.3.2"` into `src-tauri/Cargo.toml` and authorized `global-shortcut:default` in `migrated.json`.
  - Registered global shortcuts: `alt+space` (Option+Space) and `super+shift+a` (Cmd+Shift+A).
  - When pressed anywhere across macOS (even when Aerial is minimized or in the background):
    1. Unminimizes the main application window (`window.unminimize()`).
    2. Brings Aerial to the foreground with focus (`window.show()`, `window.set_focus()`).
    3. Emits `quick-canvas:open` IPC event to the React frontend, instantly opening the scratchpad.
  - **Safety & Resilience**:
    - Zero `unwrap()` calls. Uses `if let Ok(shortcut) = "alt+space".parse(...)` to gracefully handle cases where another application has already registered the shortcut.

### 3. Mac Spotlight Command Palette (`src/components/CommandPaletteModal.tsx`)
- **Omnibox Launcher (`⌘K`)**:
  - Instant live fuzzy search across all application tools, boards, actions, and settings.
  - Keyboard navigation with Arrow keys (`↑`/`↓`), `Enter` to execute, and `Escape` to close.
  - Categorized actions:
    - **Quick Note**: Quick Sketch Note, Quick Markdown Note.
    - **Tools**: Pen, Highlighter, Magic Pen, Text, Eraser, Rectangle, Ellipse, Diamond, Arrow, Line.
    - **Boards**: Search and jump directly to any board across the workspace.
    - **Actions**: Toggle Theme, Toggle Fullscreen, Diagram Studio, Keyboard Shortcuts, Clear Board.

### 4. Comprehensive macOS Keyboard Shortcuts Suite (`src/App.tsx`)
- Overhauled global keyboard dispatch matrix in `App.tsx` with standard Apple human interface guidelines:
  | Shortcut | Action | Description |
  |---|---|---|
  | `⌘⇧N` / `⌘J` | Quick Canvas Note | Open instant floating sketch & text scratchpad |
  | `⌘K` | Command Palette | Open Spotlight-style command launcher |
  | `⌘S` | Save Board | Save current canvas state to `.aerial` file |
  | `⌘⇧S` | Export PNG | Export full visible board as PNG |
  | `⌘N` | New Board | Create blank new board in sidebar |
  | `⌘O` | Open File | Open `.aerial` file picker dialog |
  | `⌘⇧O` | Diagram Studio | Open Mermaid diagram generator |
  | `⌘B` | Toggle Sidebar | Show/hide board management sidebar |
  | `⌘,` | Canvas Settings | Open canvas background & color palette menu |
  | `⌘1` .. `⌘9` | Switch Board | Jump directly to boards 1 through 9 |
  | `⌘[` / `⌘]` | Previous/Next Board | Cycle through workspace boards |
  | `⌃⌘F` | Toggle Fullscreen | Enter or exit native macOS fullscreen |
  | `⌘0` | Reset Zoom | Reset zoom to 100% and center origin |
  | `⌘+` / `⌘=` | Zoom In | Step zoom level in by 10% |
  | `⌘-` | Zoom Out | Step zoom level out by 10% |
  | `⌘⇧⌫` | Clear Canvas | Clear all elements from the active board |
  | `⌘/` / `?` | Shortcuts Cheat Sheet | Open macOS keyboard cheat sheet modal |

### 5. Keyboard Shortcuts Modal Redesign
- Upgraded cheat sheet modal with authentic macOS key glyphs (`⌘`, `⇧`, `⌥`, `⌃`, `↵`, `⎋`, `⌫`).
- Categorized into clear machinery brutalist sections with strict Araskova tokens (`#0a0a0a`, `#111111`, `#2a2a2a`, `#81868b`, `#f3f3f2`, `#e73f07`).
- Zero Orbitron, strictly Roboto / Inter and Space Mono.

---

## Verification
- `cargo check --manifest-path src-tauri/Cargo.toml`: Finished in 2.57s with 0 errors.
- `bun run build`: TypeScript compiler (`tsc`) and Vite bundler completed with 0 errors.
- `bun run build:lib`: Built library distribution and declaration files with 0 errors.
