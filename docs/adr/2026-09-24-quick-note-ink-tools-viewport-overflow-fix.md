# ADR: Quick Note Viewport-Contained Sizing & Anti-Clipping Architecture

## Context
When switching to the "Ink" (canvas) tab in the Quick Note scratchpad, both the top header (mode tabs, close button) and bottom action strip (pens, highlighter, magic wand, eraser, color palette, stamp, board) disappeared completely, leaving only the canvas element visible with the user unable to access drawing tools or switch modes.

## Root Cause Analysis
1. **Dynamic Overflowing Card Height**:
   - In `QuickCanvasModal.tsx`, the card was set to dynamic dimensions:
     `activeTab === 'text' ? 'max-w-[490px] h-[285px]' : 'max-w-[580px] h-[380px]'`.
   - In `src-tauri/tauri.conf.json`, the native standalone `quicknote` window was configured to `width: 520, height: 300`.
   - When switching to `activeTab === 'sketch'`, the card grew to `380px` tall in a `300px` window.
   - Because `QuickNoteStandalone.tsx` centered the card using `flex items-center justify-center`:
     `(380px - 300px) / 2 = 40px` was pushed off-screen at the top, completely clipping the 34px header.
     `(380px - 300px) / 2 = 40px` was pushed off-screen at the bottom, completely clipping the 32px action bar.
2. **Missing Flexbox Constraints**:
   - The middle content container (`flex-1`) lacked `min-h-0`, allowing flex children to expand unchecked beyond parent bounds.
   - The standalone modal wrapper in `QuickCanvasModal.tsx` also imposed an redundant `w-screen h-screen p-2` centering layer.

## Decision & Implementation
1. **Adaptive Viewport-Contained Dimensions**:
   - In `QuickCanvasModal.tsx`, replaced the jumping height condition with a stable responsive layout:
     ```tsx
     className={`relative w-full flex flex-col rounded-2xl border shadow-2xl overflow-hidden transition-all duration-200 ${
       isStandalone
         ? 'w-full h-full max-w-full max-h-full'
         : 'max-w-[540px] h-[320px]'
     }`}
     ```
   - In standalone mode, the card strictly conforms to 100% of the window dimensions (`w-full h-full max-w-full max-h-full`).
   - In in-app modal mode, the card maintains a unified, stable `540px × 320px` footprint for both Text and Ink modes with zero layout shift.
2. **Pinned Header & Footer with `shrink-0` & `min-h-0`**:
   - Header is `shrink-0` pinned to top.
   - Footer action strip is `shrink-0` pinned to bottom.
   - Content area uses `flex-1 min-h-0 relative overflow-hidden`, ensuring the canvas or textarea fills exactly the available middle space without expanding the outer card.
3. **Optimized Window Defaults**:
   - In `tauri.conf.json`, updated the standalone `quicknote` window dimensions to `width: 560, height: 340`.
   - In `QuickNoteStandalone.tsx`, set `p-1 overflow-hidden` so borders and corner radii render crisply against desktop wallpaper without overflow.
4. **State Persistence**:
   - Saved mode selection (`text` vs `sketch`) to `localStorage.setItem('aerial_quick_note_mode', tab)`.

## Consequences
- Switching to Ink/Canvas retains the header and the bottom toolbar in view at all times.
- Pens, highlighters, eraser, colors, stamp, and board promotion buttons are immediately accessible.
- No clipping or layout jumps across laptop screens, standalone windows, or in-app modal mode.
