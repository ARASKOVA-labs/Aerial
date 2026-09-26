# Architecture Decision Record (ADR)

## Title
Diagram Studio Modal Responsive Layout Resilience, Scaled Preview Viewport Clipping Fix, and Startup Redb Lock SIGABRT Prevention

## Status
Accepted

## Date
2026-09-26

## Context
1. **Diagram Studio Modal Layout Clipping & Viewport Overflow**:
   - On compact laptop screens (e.g. 13"/14" Retina MacBooks, 1440x900 default display scaling), the Architecture & Mermaid Studio modal was vertically overflowing without an outer scroll container, causing `items-center` centering to clip both the top modal header and the bottom action buttons (`Cancel` and `Insert onto Canvas`).
   - The preview pane used `transform: scale(...)` without `overflow-hidden` on its container and with `items-center`, which caused tall state diagrams (such as order checkout lifecycle flows) to bleed past the preview card's bottom border and draw directly over the footer bar.
   - The bottom action buttons were pushed off-screen or rendered inaccessible, leaving users unable to insert diagrams or close the modal.
2. **macOS Crash on Launch (`did_finish_launching` SIGABRT / Abort trap 6)**:
   - When launching `/Applications/Aerial.app` while an existing dev server (`bun run tauri dev`) or previous process was active, `redb::Database::create(db_path)` encountered an exclusive file lock (`flock`) on `aerial_store.redb`.
   - Returning `Err(e)` from the Tauri `.setup(...)` closure caused Tao's `did_finish_launching` Cocoa delegate to invoke `std::process::abort()`, crashing with signal 6.

## Decision
1. **Diagram Studio Responsive Viewport Architecture**:
   - Bounded modal height: `h-[92vh] max-h-[880px] min-h-[500px]` with `my-auto` inside an `overflow-y-auto` backdrop to guarantee that on any screen size, the modal adapts gracefully without clipping.
   - Constrained layout columns: `flex-1 min-h-0` on both Editor and Preview panes with `shrink-0` on Header, AI Prompt Banner, Presets Bar, and Action Footer.
   - Viewport-Isolated Preview: Wrapped SVG container in `relative flex-1 min-h-0 w-full rounded-2xl border overflow-hidden` with dedicated inner scrollable area (`overflow-auto p-6 scrollbar-thin`) and `origin-top` scaling.
   - Integrated Zoom Toolbar: Added interactive zoom buttons (`-`, `100%`, `+`, `Fit`) directly into the preview header so users can zoom out to view large diagrams or zoom in for precision inspection.
   - Guaranteed Sticky Action Footer: Pinned at the bottom with high-contrast `Cancel` and `Insert onto Canvas` buttons that are permanently visible and clickable.
2. **Single-Instance Enforcement & Resilient Database Fallbacks**:
   - Integrated `tauri-plugin-single-instance`: Secondary launches now focus and unminimize the primary running instance rather than creating a competing process that attempts to re-lock the store.
   - Multi-tier Database initialization fallback: If the primary database is locked by another instance or file contention occurs, the backend falls back to an instance-isolated store (`aerial_store_inst_<pid>.redb`) and ephemeral memory fallback.
   - Setup closure safety: Ensured `.setup(...)` never returns an unhandled fatal error that aborts application launch.

## Consequences
- The Diagram Studio modal renders with machinery-grade polish on all resolutions, with zero clipping, smooth preview panning/scrolling, and responsive zoom controls.
- Launching the app under any concurrent execution environment is safe and crash-free.
