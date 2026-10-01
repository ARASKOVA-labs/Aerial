# ADR 2026-10-01: Scalable Render Engine — Spatial Index, Density-Pyramid LOD, Cached Layers, Diff Undo

## Status
Accepted

## Context

Users reported lag that grows with the amount of content on a board. Profiling
the v1.2.2 engine showed every cost scaled with **total board size**:

| Cost | v1.2.2 behaviour |
|---|---|
| Each pointer move while writing | Full redraw of every element, every frame |
| Each committed stroke / edit | `save_state()` cloned the entire element list (undo, 50 deep) |
| Freehand stroke bounds | Rescanned all points on every move — O(n²) per stroke |
| Hit testing / eraser | Linear scan of all elements |
| Zoomed out | Every element drawn individually, however small |
| Autosave (every 500 ms) | Full scene JSON serialised and written as one blob |

Measured in headless Chromium (software raster; relative numbers, frame time
includes rasterisation):

| | 10k strokes | 50k strokes | 200k strokes |
|---|---|---|---|
| Frame while writing | 36.9 ms | 164 ms | **674 ms** |
| Stroke commit | 39.7 ms | 254 ms | 2,195 ms |
| Undo | 205 ms | 562 ms | 4,675 ms |
| Pan frame (zoom 1) | 36 ms | 188 ms | 750 ms |

Two further correctness bugs surfaced during the work: undo after a drag or
resize restored the *post*-move state (it was saved on mouse-up), and resizing
re-scaled already-scaled points on every move, compounding error.

## Decision

Restructure the engine (`aerial-core/aerial-engine/src/`) so per-frame and
per-action cost depends on **what is visible or what changed**, never on board
size.

1. **Scene store (`scene.rs`).** Elements in an id map (boxed, so table growth
   moves pointers), paint order in a `(z, id)` B-tree set, and change feeds:
   world-space dirty rects for the renderer, upsert/delete sets for persistence,
   and a monotonic `version` (replacing the shared dirty flag that three
   consumers raced on, which made autosave unreliable).

2. **Hierarchical spatial hash (`spatial.rs`).** Each element is filed in the
   finest grid level whose cells (`64·4ˡ` world units) are at least its size,
   so it touches ≤ 2×2 cells: O(1) insert/remove for any element size. Queries
   walk either the query's cell range or the level's occupied cells, whichever
   is smaller, so zoomed-out queries over sparse levels stay cheap. Size
   classes are explicit, which the LOD system relies on.

3. **Density pyramid LOD (`pyramid.rs`).** Each pyramid cell at level *p*
   aggregates count and mean colour of elements with size class ≤ *p*. When
   zoomed out, the renderer picks the level *p\** whose cells are ≤ 2 CSS px,
   paints those cells as blocks by writing pixels straight into an `ImageData`
   buffer (one upload, no per-cell canvas calls), and draws only elements of
   class > *p\** exactly. The two sets partition the scene — nothing is drawn
   twice — and block count is bounded by screen pixels, not content.

4. **Layer cache (`render.rs`).** Committed content lives on an offscreen
   static layer. Each frame composites it and draws only the dynamic overlay
   (active stroke, dragged element, laser, selection). The static layer is
   updated by the cheapest applicable path:
   - scene edits → clip-and-repaint only the dirty rectangles;
   - pure pans → blit existing pixels by the delta and repaint only the exposed
     L-shaped strips (sub-pixel residual is composited and refined once idle);
   - zoom/theme → full repaint, bounded by culling and LOD.

5. **Batching.** Consecutive same-style stroke-only elements are appended to
   one `Path2D` and stroked once (exact — never reorders). Strokes < 24 px on
   screen are batched by style regardless of order (an invisible reordering).
   Long strokes are decimated to sub-pixel tolerance at render time and
   simplified with iterative Ramer–Douglas–Peucker on commit.

6. **Diff-based history (`history.rs`).** Transactions record before/after
   only for touched elements (`begin → touch → mutate → commit`). Drag/resize
   capture state at mouse-down (fixes the undo bug); resize scales from points
   captured at start (fixes compounding).

7. **Validation (`element.rs`).** Every element entering the scene — drawn,
   loaded, or received — passes `sanitize`: known kinds, finite geometry,
   ±1e9 world bounds, size caps. Crafted boards cannot poison the index.

8. **Incremental persistence.** `take_changes()` returns only upserts/deletes;
   the desktop store writes one redb row per element (see the security ADR).

The JS API is backward compatible; additions: `scene_version`,
`take_changes`, `has_pending_changes`, `element_count`, `get_asset_refs`,
`get_render_stats`, `set_lod_threshold`, `can_undo/can_redo`; React props
`onChanges` and ref methods `takeChanges`, `getElementCount`,
`getRenderStats`, `setLodThreshold`.

## Results

Same benchmark, same machine:

| | 10k | 50k | 200k |
|---|---|---|---|
| Frame while writing | **1.2 ms** | **1.1 ms** | **1.1 ms** |
| Stroke commit | 1.3 ms | 1.0 ms | 1.0 ms |
| Undo | 1.6 ms | 1.1 ms | 1.1 ms |
| Pan frame (zoom 1) | 2.5 ms | 2.4 ms | 4.6 ms |
| Fully zoomed out | 2.7 ms | 2.4 ms | 2.5 ms |

Native data-structure benchmark with **1,000,000 strokes**
(`cargo test -p aerial-engine --release --test scale -- --ignored`):
viewport query 57 µs (999 visible), hit-test 0.24 µs, insert 5 µs,
zoomed-out LOD 3.4 ms.

Browser e2e (real mouse input) and the real Tauri app verified drawing,
undo/redo, drag + undo-of-drag, eraser, zoom, pan, and diagram insertion.

## Limits and next steps ("billions")

Frame cost is now independent of board size, but **memory and load time are
still O(n)**: a 200k-stroke board is ~260 MB of JSON and takes ~1.6 s to load
(v1.2.2: 2.7 s), dominated by JSON transport. Boards of billions of elements
cannot be held in a client at all. The path there builds on this design:

1. Persist elements keyed by spatial cell (the storage layer already writes
   per-element rows) and **page cells in and out by viewport**.
2. Persist the density pyramid so the overview renders before, or without,
   loading detail.
3. Binary element encoding (f32 deltas) instead of JSON — roughly 10× smaller.
4. Move rendering to `OffscreenCanvas` in a worker or to WebGPU.

## Consequences

- Engine code grew from one 1.7k-line file to focused modules with 26 unit
  tests plus scale tests.
- The WASM binary went from 691 KB to 745 KB (release profile now uses LTO).
- `check_and_clear_dirty` is kept for compatibility but deprecated in favour of
  `scene_version`.
