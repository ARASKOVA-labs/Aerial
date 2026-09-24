# ADR 2026-09-24: Canvas Element Proportional Resize and Anti-Collapse Point Scaling

## Status
Accepted

## Context
When selecting and resizing elements on the infinite canvas (via the 4 corner tactical reticles):
1. **Compounding Point Explosion/Collapse Bug**:
   During `on_mouse_move` while `self.is_resizing` was true, the engine executed:
   ```rust
   for p in el.points.iter_mut() {
       p.0 = new_x + (p.0 - orig_x) * sx;
       p.1 = new_y + (p.1 - orig_y) * sy;
   }
   ```
   Because `p.0` and `p.1` were mutated in-place across every mouse-move event (60–120 Hz) while `sx` and `sy` represented the total scale factor from mouse-down, points were subjected to compounding exponential scaling:
   $p_n = p_{orig} \times sx^n$.
   - Dragging larger: Points exploded into billions of pixels within half a second, flying off-screen and disappearing completely.
   - Dragging smaller: Points collapsed into sub-pixel singularities ($0.8^{60} \approx 10^{-6}$) or NaN, causing all stroke geometry, shapes, or diagrams to vanish while leaving an empty selection box.
2. **Text / Character Scaling Omission**:
   When resizing a `Text` element, `el.font_size` was never updated. The selection box expanded or contracted while characters remained frozen at their initial size or disappeared due to corrupted point coordinates.

---

## Technical Architecture & Decisions

### 1. Pristine Initial Point Snapshot (`aerial-core/aerial-engine/src/lib.rs`)
- Added `resize_orig_points: Vec<(f64, f64)>` and `resize_orig_font_size: f64` to `AerialCanvas`.
- On `on_mouse_down` when a resize handle (`hit_h > 0`) is clicked:
  ```rust
  self.resize_orig_points = el.points.clone();
  self.resize_orig_font_size = if el.font_size > 0.0 { el.font_size } else { 24.0 };
  self.resize_orig_w = el.w.max(16.0);
  self.resize_orig_h = el.h.max(16.0);
  ```
- All subsequent frames in `on_mouse_move` compute vector points **directly from `self.resize_orig_points`**:
  ```rust
  el.points = self.resize_orig_points.iter().map(|orig_p| {
      (
          new_x + (orig_p.0 - orig_x) * sx,
          new_y + (orig_p.1 - orig_y) * sy,
      )
  }).collect();
  ```
  This eliminates compounding errors and ensures 100% deterministic, linear coordinate transformation.

### 2. Live Font Size Scaling for Text Elements
- When `el.kind == "Text"`, aspect ratio is preserved and font size scales smoothly with the bounding box:
  ```rust
  let new_font_size = (self.resize_orig_font_size * scale).clamp(8.0, 500.0);
  el.font_size = new_font_size;
  el.points = vec![(new_x, new_y)];
  ```
- Text characters scale dynamically in real time without clipping or disappearing.
- When opening the text editor or inspecting element metadata, the new font size is immediately reflected.

### 3. Aspect Ratio Preservation & Dominant Axis Calculation
- For `Diagram`, `Image`, and `Text`, scale is calculated based on the dominant dragged dimension:
  ```rust
  let scale = if (scale_x - 1.0).abs() > (scale_y - 1.0).abs() {
      scale_x
  } else {
      scale_y
  }.max(min_dim / orig_w.min(orig_h));
  ```
  This ensures intuitive behavior whether dragging diagonally, horizontally, or vertically.

### 4. Zero-Size & Negative Dimension Clamping
- Enforced `min_dim = 16.0` on all resize calculations.
- Prevents division by zero (`new_w / orig_w`), negative width/height, and canvas `IndexSizeError` exceptions during `drawImage`.

---

## Verification & Metrics
- `wasm-pack build aerial-core/aerial-engine --target web`: Compiled in 1.25s with 0 errors.
- `bun run build`: Built production bundle in 3.82s with 0 errors.
- `cargo check --manifest-path src-tauri/Cargo.toml`: Compiled in 1.68s with 0 errors / warnings.
- Hephaestus Compliance: 100% compliant.
- Release safety: Kept local; no remote release tags pushed.
