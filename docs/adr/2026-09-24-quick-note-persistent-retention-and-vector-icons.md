# ADR 2026-09-24: Quick Note Persistent Retention Policy and Vector Icon Migration

## Status
Accepted

## Context
Users identified two usability frustrations with the Quick Note / Quick Canvas experience:
1. **Unwanted Auto-Dismissal / Premature Disappearance**:
   - Clicking outside the card on the backdrop invoked `onClick={handleDismiss}`.
   - Clicking "Stamp" (`⌘↵`) or "Board" (`⌘S`) automatically triggered `handleDismiss()` / `handleClose()`, vanishing the note before the user was ready to exit.
   - Users wanted the Quick Note to remain open and persistent while interacting with tools, formatting, stamping, and promoting boards, closing **only** when explicitly clicking the Close (`X`) button or pressing Escape.
2. **Emoji Artifacts in UI**:
   - The formatting micro-chips utilized emoji characters (`💡`, `🕒`), violating Araskova brutalist design standards and creating platform-dependent emoji rendering inconsistencies.

---

## Technical Architecture & Decisions

### 1. Explicit-Only Dismissal Policy (`QuickCanvasModal.tsx`, `QuickNoteStandalone.tsx`)
- **Removed Backdrop Auto-Dismiss**: Removed `onClick={handleDismiss}` from the backdrop container. Clicks anywhere outside the modal boundary will no longer collapse the scratchpad.
- **Persistent Stamping & Promoting**:
  - In `handleStamp`, removed `handleDismiss()`; upon stamping to canvas, the button renders visual success feedback (`Stamped!`) for 1500ms while keeping the editor active and open.
  - In `handlePromoteToBoard`, removed `handleDismiss()`; the board is created in the database and sidebar, but the user's active quick note workspace remains intact.
  - In `QuickNoteStandalone.tsx`, removed `handleClose()` from `handleStampText`, `handleStampSketch`, and `handleSaveAsBoard`.
- **Dedicated Close Controller**: The quick note now dismisses **only** when the user clicks the dedicated Close button (`X` icon in the header) or presses the `Escape` key.

### 2. Lucide React Vector Icon Migration (`QuickCanvasModal.tsx`)
- **Replaced Emojis with React Icons**:
  - `💡` (Bulb emoji) $\rightarrow$ `<Lightbulb className="w-3.5 h-3.5" />` (inserts `* Idea: `).
  - `[ ]` $\rightarrow$ `<CheckSquare className="w-3.5 h-3.5" />` (inserts `- [ ] `).
  - `< />` $\rightarrow$ `<Code className="w-3.5 h-3.5" />` (inserts ```` ```\n\n``` ````).
  - `🕒` (Clock emoji) $\rightarrow$ `<Clock className="w-3.5 h-3.5" />` (inserts `[HH:MM] `).
  - `clear` text $\rightarrow$ `<Trash2 className="w-3.5 h-3.5 text-red-500/70" />`.
- All icons render as clean, sharp SVG vectors with zero external emoji font dependencies.

---

## Verification & Metrics
- `bun run build`: Built production bundle in 3.77s with 0 errors.
- `cargo check --manifest-path src-tauri/Cargo.toml`: Compiled in 1.81s with 0 warnings/errors.
- Hephaestus Compliance: 100% compliant.
- Release safety: Kept local; no remote release tags pushed.
