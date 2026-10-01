# ADR 2026-10-01: Excalidraw-style Editor, Theme-true Colours and Pen Engine

## Status
Accepted

## Context

User feedback on v1.2.2:

- The UI felt crowded. There was a large floating toolbar, a settings popover, a dense hamburger side panel and several HUDs. Users asked for Excalidraw's look and behaviour: a centred tool island, a contextual properties panel, a minimal main menu and a welcome screen.
- **Bug:** switching between dark and light themes did not re-colour existing drawings. Ink stored as `#000000` disappeared on dark paper.
- Every pen looked the same. Strokes were uniform polylines.
- Shapes were plain geometric outlines. There were no hand-drawn styles, fills, dashes or sloppiness.
- The eraser deleted on touch, with no preview and no way to undo mid-gesture.
- Startup showed a blank window with three bouncing dots.

## Decision

### Colour model (fixes the theme bug)
Colours are stored in their **light-theme** form. Dark mode is a pure display transform applied per colour at paint time: `invert(93%) hue-rotate(180deg)`, the same transform Excalidraw uses.

- The engine side lives in `style.rs::themed`. The UI twin is `themedColor` in `src/ui/model.ts`, so the paper behind the canvas and the swatches match pixel for pixel.
- Paper `#ffffff` displays as `#121212`, and ink `#1e1e1e` as `#e3e3e3`.
- The theme switch no longer touches the stored background. Legacy dark papers (`#0a0a0a` and friends) map to `#ffffff` on load (`canonicalPaper`).
- The highlighter is the one deliberate exception. It multiplies on light paper and *screens in its true hue* on dark paper, so a yellow highlight glows instead of turning brown.

### Pen engine (`freehand.rs`)
Strokes are variable-width outlines in the style of perfect-freehand:

- **Width:** driven by real pen pressure, or by simulated pressure based on speed.
- **Path:** streamlined and Catmull-Rom smoothed, with tapers, round caps and round joins at reversals.

There are four presets:

| Preset | Character |
|---|---|
| Pen | Pressure-sensitive |
| Brush | Strong thinning and long tapers |
| Marker | Even width |
| Highlighter | Wide and translucent |

Simulated pressure depends on point spacing, so the simulated pressures are **baked per point before commit-time RDP simplification**. Otherwise a stroke would visibly change weight when the mouse is released.

### Hand-drawn shapes (`rough.rs`)
Shapes use a seeded double-stroke rough renderer (rough.js-style) with these options:

- **Sloppiness:** architect, artist or cartoonist.
- **Fill:** hachure, cross-hatch or solid.
- **Stroke style:** solid, dashed or dotted.
- **Edges:** sharp or round.

The seed derives from the element id, so jitter is stable across frames and machines. Legacy elements default to `roughness: 0` and keep their look.

### Interaction
- **Eraser (Excalidraw semantics):** touched elements fade while dragging and are deleted on release; holding Alt restores them. The *Partial* mode cuts freehand strokes exactly at the eraser circle using segment–circle clipping. It used to test vertices only, which missed simplified straight strokes.
- **Selection:** marquee, shift-toggle, dragging inside the selection box, duplicate, layer order and nudge.
- **Tool switching:** after drawing a shape the tool switches back to Selection (Q locks the tool).
- **Modifiers:** Shift constrains to squares and 15° angles; Alt draws from the centre.

### Editor chrome (`src/ui/*`)
- **Icons:** about 60 custom 20×20 SVGs, with no icon-font dependency in the editor.
- **Tool island:** the full Excalidraw keymap (H, V/1 … E/0), with number badges on the buttons. A "more tools" menu holds laser, magic pen, diagrams, translator, PDF, paste and quick note.
- **Properties panel:** shows only what applies to the active tool or selection. For pens it adds the pen type; for the eraser, the eraser mode and size.
- **Main menu:** boards, open/export, command palette, help, reset, theme, canvas background, grid, and palm rejection.
- **Text:** a WYSIWYG inline editor replaces the draggable text box. The edited element is hidden while the editor overlays it.
- **Theming:** tokens are scoped to `.ae-root[data-theme]`, so the chrome never leaks into a host app.
- **Library API:** `menu`, `extraTools`, `topRight`, `showWelcome`, `welcomeItems`, `logo`, `onHelp`, `onInsertImage`, `onSelectionChange` and `panelExtra`. Ref methods: `applyStyle`, `getSelectionInfo`, `selectAll`, `duplicateSelected`, `reorderSelected`, `setToolLocked` and `getUiStyle`.

### Boot screen
The boot screen is inline markup and CSS in `index.html`, painted on the first frame. It is driven by `public/boot.js`, a same-origin classic script, because the CSP forbids inline scripts.

- **Theme:** applied before first paint, so there is no white flash in dark mode.
- **Animation:** the mark sketches itself (outline, then fill, then chevron) and the wordmark rises in.
- **Progress:** the bar follows **real** phases (`engine → board → fonts → ready`).
- **Exit:** the screen fades out only after the app is ready *and* the intro has finished, so it never pops.
- **Safety:** it respects `prefers-reduced-motion`, reports errors, and dismisses itself after 20 s if the app never signals.

## Brand note
This intentionally departs from the CLAUDE.md "machinery brutalist" rules inside the editor chrome. The UI accent is Excalidraw's violet (`#6965db` / `#a8a5ff`) and labels use sentence case, because the request was for Excalidraw's aesthetics. The Araskova orange (`#e73f07`) is kept for the logo, the boot screen and diagram accents. If the brand rules should win, change `--ae-primary` in `src/ui/theme.css`; it is a one-token change.

## Consequences
- **Performance:** unchanged at 200k elements. Write about 1.3 ms, commit 1.3 ms, pan 4.7 ms, undo 1.8 ms. Outlines are computed into reusable scratch buffers.
- **Storage:** mouse strokes now store per-point pressures (`f32`), which adds about 4 bytes per point.
- **Library compatibility:** `AerialToolbar`, `AerialSettingsPopover` and `AerialDraggableTextBox` are still exported but no longer used by `<AerialCanvas />`.
- **Shortcuts:** they follow Excalidraw, so some old keys changed. Laser moved from Z to K, freehand is P/X/7, and board switching on Ctrl+[ / ] was removed because those keys now reorder layers. The help dialog (`?`) lists the full set.
