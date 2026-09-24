# ADR: Quick Note Pointer Isolation, Strict Non-Dismissal, and Full Emoji Elimination

## Context
When interacting with the Quick Note modal in the application (typing in the textarea, clicking tabs, switching colors, clicking formatting chips, stamping, or copying), the modal was unexpectedly disappearing on the very first mouse/trackpad down event. Additionally, user standards strictly forbid the usage of unicode emojis across the UI, mandating Lucide React vector icons.

## Root Cause Analysis
1. **Unstopped Event Bubbling to Root `onPointerDown`**:
   - The DOM event lifecycle triggers `pointerdown` -> `mousedown` -> `pointerup` -> `mouseup` -> `click`.
   - The Quick Note card container (`cardContent`) previously only had `onClick={(e) => e.stopPropagation()}`.
   - When a user clicked anywhere inside the Quick Note (e.g. clicking the textarea or a button), the `pointerdown` event bubbled up through the modal, through the backdrop, directly to the root application `div` (`<div ... onPointerDown={...}>` in `App.tsx`).
   - The root application `onPointerDown` handler executed `closeAllPopups()`.
2. **`showQuickCanvas` Bound to `closeAllPopups`**:
   - `closeAllPopups()` contained `if (showQuickCanvas) setShowQuickCanvas(false)`.
   - Consequently, on the initial `pointerdown` of any click interaction, `showQuickCanvas` was immediately set to `false`, unmounting the modal before `click` could even register.
   - Furthermore, tapping anywhere on the canvas or outside triggered `closeAllPopups()`, violating the user's explicit invariant that Quick Notes must only close when clicking the Close (`X`) button.
3. **Residual Unicode Emojis**:
   - In `App.tsx`, raw characters `✓` and section header emojis (`⚡`, `📋`, `💾`, `✏️`) were present in modal headers.

## Decision & Implementation
1. **Remove `showQuickCanvas` from `closeAllPopups`**:
   - In `src/App.tsx`, completely removed `showQuickCanvas` state and setter from `closeAllPopups()`. Quick Notes is now decoupled from ephemeral popups.
2. **Dedicated `quickCanvasModalRef` Guard**:
   - Added a ref `quickCanvasModalRef` in `src/App.tsx` and wrapped `<QuickCanvasModal />`.
   - Added `quickCanvasModalRef.current?.contains(target)` guards to both the root `onPointerDown` and `window.addEventListener('pointerdown', ..., true)` listeners.
3. **Comprehensive Event Propagation Interception**:
   - On `cardContent`, the standalone window wrapper, and the backdrop container in `src/components/QuickCanvasModal.tsx` and `src/components/QuickNoteStandalone.tsx`:
     - Added `onPointerDown={(e) => e.stopPropagation()}`
     - Added `onMouseDown={(e) => e.stopPropagation()}`
     - Added `onPointerUp={(e) => e.stopPropagation()}`
     - Added `onMouseUp={(e) => e.stopPropagation()}`
     - Added `onClick={(e) => e.stopPropagation()}`
4. **Complete Emoji Elimination**:
   - Replaced all section header emojis and checkmarks with Lucide React vector components: `<Zap />`, `<ClipboardList />`, `<Save />`, `<Pen />`, and `<Check />`.
   - Verified zero unicode emojis remain in `src/` via automated scanning.

## Consequences
- Clicking anywhere inside Quick Notes (typing, buttons, color pickers, tabs, stamp, board) remains permanently stable without disappearing.
- Quick Notes only closes upon explicit user intent: clicking the Close (`X`) button or pressing `Escape`.
- Full compliance with Araskova brutalist design standards and zero emoji policy.
