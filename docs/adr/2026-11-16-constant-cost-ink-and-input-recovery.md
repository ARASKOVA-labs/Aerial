# ADR 2026-11-16: Constant-Cost Ink, Input Recovery and Hardened File Access

## Status
Accepted

## Context

Measured in headless Chromium at 1600×1000 against `main` (`ca0afde`):

| Case | Before |
| --- | --- |
| Live stroke, 500 / 2,000 / 6,000 points | 0.35 / 1.24 / 3.94 ms per frame, growing with length |
| Pen-up of a long stroke | 15–19 ms frame (visible hitch) |
| Drawing at 9% / 1% zoom | 3.6 / 44.6 ms per frame |
| Zooming a page of 2,000 strokes | 43 ms per frame |
| Committing next to a 20,000-point stroke | 48 ms per commit |
| A two-point stroke spanning the world (crafted file) | engine crash (out of memory) |

The live stroke was rebuilt and refilled in full every frame, so a long
shading scribble got slower the longer the pen stayed down. Outlines were
regenerated on every repaint, and a stroke's sample count followed its length
in world units with no upper bound.

Input had gaps too: a lost `pointerup` (window blur, alt-tab, a stylus leaving
range, OS gestures) left a stroke stuck "down"; `pointercancel` committed
half-strokes; right and middle buttons drew; a stylus's eraser end drew ink;
and the canvas size was rounded from CSS pixels, which blurred ink on
fractional device-pixel ratios.

## Decision

### Rendering (`aerial-engine`)

1. **Causal sampler** (`freehand::Sampler`). The centre line is re-spaced to a
   fixed arc length and streamlined with smoothing defined per unit of length,
   so a sample never changes once emitted and the shape is the same at any
   sample spacing. Live and committed strokes use the same code.
2. **Zoom-quantised spacing** (`step_for`): never finer than about one screen
   pixel, in powers of two of the base step, so cached outlines stay valid
   across zoom ranges.
3. **Incremental live ink** (`ink::LiveInk`). Settled samples are baked into an
   offscreen layer in overlapping chunks; only the tip (end taper and un-lagged
   point) is rebuilt per frame. Translucent and glowing ink is assembled
   opaque and composited once so overlaps never double up.
4. **Promotion on pen-up.** A long stroke's baked ink is copied into the
   static layer pixel for pixel; the exact repaint happens after 20 quiet
   frames (`SETTLE_QUIET_FRAMES`), never on the pen-up frame.
5. **Outline cache** (`render::PathCache`): one `Path2d` per committed stroke,
   invalidated by the scene's dirty feed, LRU-evicted by segment budget.
6. **Deferred zoom.** When a full repaint would cost more than 4 ms the painted
   layer is scaled during the gesture and repainted sharp once it settles.
7. **Repaint budget.** Each repaint may generate at most
   `FRAME_SAMPLE_BUDGET` outline samples; strokes beyond it are drawn as plain
   lines until the next repaint.
8. **Leaps over long segments.** On a segment much longer than the sample
   spacing, once the lag has settled the centre line is straight and pressure
   a straight ramp, so the sampler jumps across it using the lag filter's
   closed form, in strides that grow away from the segment ends. Samples land
   exactly where single steps would (test `leaps_land_on_the_dense_centre_line`),
   and cost follows the number of input points, not the distance between them.
   `MAX_SAMPLES` stays as a hard cap.
9. `visual_pad` for pen strokes now covers the full-pressure radius
   (`freehand::max_radius`); thick fountain-pen ink was clipped at high zoom.

### Input (`usePointerInput`, engine `interact`)

- New engine calls: `pointer_cancel` (rolls the gesture back through
  `History::rollback`), `pointer_finish` (commits what was drawn),
  `pan_begin`, `is_gesture_active`.
- Lost pointer capture, window blur and hidden tabs finish the gesture.
  `pointercancel` cancels it. Pinching cancels a touch stroke.
- Behaviour changes: only the primary button draws; the middle button pans;
  a stylus's eraser end erases; switching tools mid-stroke commits the stroke.
- Palm rejection: fingers draw until a pen has been used on this canvas;
  after that (with palm rejection on) a lone touch is treated as a resting
  hand and ignored, except with the hand tool. A touch stroke that a pen
  interrupts is rolled back. Synthetic mouse events within 700 ms of pen
  input are ignored, so pen drivers that emit both never draw twice.
- Non-finite coordinates are ignored and repeated points skipped; a pen that
  stops reporting pressure keeps its last reading.
- The canvas is sized from `devicePixelContentBoxSize` when the browser
  provides it.

### Security

- Engine: crafted files can no longer exhaust memory or stall rendering
  (sample cap, segment leaps, non-finite guards, repaint budget).
- Tauri: reads are capped by what is actually read, not by metadata checked
  first (`security::read_capped`); atomic writes create their temporary file
  with `create_new` so a planted symlink is never followed; the app data
  directory is owner-only (0700) on Unix; a dropped image is read through the
  canonical path that was granted, not the path the webview passed.
- Dependencies: `dompurify`, `vite` and `source-map-js` raised past their
  advisories; Rust `quinn-proto`, `quinn-udp`, `rustls`, `rustls-webpki`,
  `webpki-roots`, `tokio` and `chacha20` updated. `cargo audit` reports no
  vulnerabilities.

## Consequences

Measured after the change, same setup:

| Case | After |
| --- | --- |
| Live stroke, any length or zoom | 0.03–0.07 ms per frame |
| Pen-up of a 22,000 px stroke (in app) | 1.0 ms frame, identical pixels before and after |
| Zooming a page of 2,000 strokes | ~0.02 ms per frame, one sharp repaint after |
| Committing next to a 20,000-point stroke | ~1 ms per commit |
| 1 / 5,000 world-spanning strokes (crafted file) | 24 ms / 427 ms first paint, 0.02 ms pan |

- Remaining: `bun audit` reports one low-severity KaTeX advisory reached only
  through Mermaid; `cargo audit` lists warnings for unmaintained crates that
  Tauri pulls in on Linux. Neither has a fix available from this repository.
- The settle repaint after a promoted stroke can differ from the promoted
  pixels by sub-pixel antialiasing only.
