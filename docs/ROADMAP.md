# Aerial roadmap: closing the gap with Excalidraw, and going past it

Written for v3.0.0. Excalidraw's strength is a small set of editing features
done extremely well. Aerial already beats it on ink quality, native speed,
privacy and AI integration; it loses on everyday diagramming mechanics.

## Where Aerial already wins (lean into these)

- **Ink.** Pressure-sensitive pens, brush, marker, highlighter, and strokes
  that keep their shape. Ship the iPad build with Apple Pencil next.
- **Native and fast.** Rust/WASM engine, 120 Hz, large boards.
- **Private by default.** Local-first, encrypted at rest, password-protected
  `.aerial` files.
- **AI-native.** Claude can draw, write and see the board over MCP. No other
  whiteboard does this natively; it is the headline feature.
- **Documents on the canvas.** PDF import and diagrams from text.

## Remove or consolidate

| What | Why | Do |
|---|---|---|
| Text translator dialog **and** "Translate to" in the panel | Two entry points for one niche feature that sends text to third parties | Keep only the panel action on selected text |
| Magic pen via Google Input Tools | Sends handwriting off-device; breaks offline | Replace with on-device recognition (macOS Vision handwriting) |
| Aras DSL next to Mermaid | Two diagram languages to learn and maintain; Mermaid is the standard | Keep Mermaid; retire Aras DSL or keep it internal |
| Legacy library exports (`AerialToolbar`, `AerialDraggableTextBox`, `AerialSettingsPopover` in `src/index.ts`) | Old UI kept only for the npm API; duplicates the new chrome | Remove in a breaking release |
| Collab relay crate and engine CRDT hooks | Built but not wired into the app | Finish them (see P1) or drop them |
| Diagram "styles" beyond light/dark | Blueprint is rarely used and adds theme code | Keep light/dark, follow the app theme |

## Add — P0 (needed to replace Excalidraw day to day)

1. **Arrow binding.** Arrows attach to shapes and follow when shapes move; plus elbow (orthogonal) arrows.
2. **Text inside shapes.** Double-click a shape to type a centred label that moves and wraps with it.
3. **Group, align and distribute.** ⌘G, alignment and spacing buttons in the panel.
4. **Snapping and smart guides.** To other elements' edges and centres, and equal spacing.
5. **Copy and paste.** Between boards, and into other apps as PNG/SVG.
6. **Export the selection or a frame**, with transparent backgrounds and a scale option.
7. **Find on canvas (⌘F)** for text and diagram labels.
8. **Lock elements**, so backgrounds and templates stay put.

## Add — P1 (differentiate)

1. **Live collaboration** with end-to-end encryption (the relay already exists), plus cursors and follow mode.
2. **Frames and presentation mode.** Present frames in order and export frames to PDF.
3. **Shape libraries.** Save, reuse and share components (`.aerial` library files).
4. **iPad app with Apple Pencil**: pressure, tilt, hover, and Scribble to text.
5. **Comments and stickies** for async review.
6. **Image crop and masks**, and PDF annotation (pen on PDF pages).

## Add — P2

- Templates (retros, flows, wireframes) and a template gallery.
- A plugin API on top of the same tools the MCP server uses.
- Version history per board (the store already has per-element rows).
- Windows support for MCP (named-pipe transport).
