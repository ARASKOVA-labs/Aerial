//! Rendering: layer cache, level of detail, and element painting.
//!
//! Frame anatomy
//! ─────────────
//!   static layer   bg + grid + committed elements, cached between frames
//!   main canvas    composite of the static layer + dynamic overlay
//!                  (active stroke, dragged element, laser, selection UI)
//!
//! The static layer is never fully repainted unless it must be:
//!   * scene edits  → repaint only the dirty rectangles (clip + redraw)
//!   * pure panning → blit the existing pixels by the pan delta, then repaint
//!     only the newly exposed strips
//!   * zoom / theme → full repaint, bounded by visible content and LOD
//!
//! So drawing a new stroke on a board with millions of elements costs the same
//! as on an empty board: the static layer is reused and only the stroke itself
//! is painted each frame.

use std::cell::RefCell;
use std::collections::HashMap;

use wasm_bindgen::{Clamped, JsCast, JsValue};
use web_sys::{CanvasRenderingContext2d, HtmlCanvasElement, HtmlImageElement, ImageData, Path2d};

use crate::element::Element;
use crate::geom::{decimate_into, Rect};
use crate::pyramid::{lod_level, DensityPyramid};
use crate::scene::Scene;
use crate::spatial::Hit;

/// Strokes smaller than this on screen (CSS px) are drawn as batched polylines.
pub const SMALL_STROKE_PX: f64 = 24.0;
/// Dirty regions covering more than this fraction of the viewport → full repaint.
const PARTIAL_AREA_LIMIT: f64 = 0.45;
const MAX_REGIONS: usize = 48;

// ── View transform ──────────────────────────────────────────────────────────

#[derive(Clone, Copy, Debug, PartialEq)]
pub struct View {
    pub off_x: f64,
    pub off_y: f64,
    pub zoom: f64,
    pub dpr: f64,
    pub w: f64,
    pub h: f64,
}

/// Device-pixel rectangle [x0, x1) × [y0, y1).
#[derive(Clone, Copy, Debug, PartialEq)]
pub struct DevRect {
    pub x0: f64,
    pub y0: f64,
    pub x1: f64,
    pub y1: f64,
}

impl DevRect {
    fn area(&self) -> f64 {
        (self.x1 - self.x0).max(0.0) * (self.y1 - self.y0).max(0.0)
    }
    fn overlaps(&self, o: &DevRect) -> bool {
        self.x0 <= o.x1 && self.x1 >= o.x0 && self.y0 <= o.y1 && self.y1 >= o.y0
    }
    fn union(&self, o: &DevRect) -> DevRect {
        DevRect { x0: self.x0.min(o.x0), y0: self.y0.min(o.y0), x1: self.x1.max(o.x1), y1: self.y1.max(o.y1) }
    }
}

impl View {
    pub fn world_rect(&self, d: &DevRect) -> Rect {
        let s = self.zoom * self.dpr;
        Rect::new(
            (d.x0 - self.off_x * self.dpr) / s,
            (d.y0 - self.off_y * self.dpr) / s,
            (d.x1 - self.off_x * self.dpr) / s,
            (d.y1 - self.off_y * self.dpr) / s,
        )
    }

    /// World rect → device rect, snapped outward to whole pixels and clipped
    /// to the viewport. None when entirely off-screen.
    pub fn device_rect(&self, r: &Rect) -> Option<DevRect> {
        let s = self.zoom * self.dpr;
        let d = DevRect {
            x0: (r.min_x * s + self.off_x * self.dpr).floor().max(0.0) - 1.0,
            y0: (r.min_y * s + self.off_y * self.dpr).floor().max(0.0) - 1.0,
            x1: (r.max_x * s + self.off_x * self.dpr).ceil().min(self.w) + 1.0,
            y1: (r.max_y * s + self.off_y * self.dpr).ceil().min(self.h) + 1.0,
        };
        let d = DevRect { x0: d.x0.max(0.0), y0: d.y0.max(0.0), x1: d.x1.min(self.w), y1: d.y1.min(self.h) };
        if d.x1 <= d.x0 || d.y1 <= d.y0 { None } else { Some(d) }
    }

    pub fn full(&self) -> DevRect {
        DevRect { x0: 0.0, y0: 0.0, x1: self.w, y1: self.h }
    }

    pub fn apply(&self, ctx: &CanvasRenderingContext2d) {
        let s = self.zoom * self.dpr;
        let _ = ctx.set_transform(s, 0.0, 0.0, s, self.off_x * self.dpr, self.off_y * self.dpr);
    }
}

// ── Theme ───────────────────────────────────────────────────────────────────

#[derive(Clone, Debug, PartialEq)]
pub struct Theme {
    pub is_dark: bool,
    pub bg: String,
    pub grid: String,
    pub lod_px: f64,
}

pub fn effective_color(c: &str, is_dark: bool) -> &str {
    if is_dark {
        if c == "#1a1a2e" || c == "#000000" {
            return "#f8fafc";
        }
    } else if c == "#f8fafc" || c == "#ffffff" {
        return "#000000";
    }
    c
}

// ── Offscreen layers ────────────────────────────────────────────────────────

pub struct Layer {
    pub canvas: HtmlCanvasElement,
    pub ctx: CanvasRenderingContext2d,
}

impl Layer {
    pub fn new() -> Result<Layer, JsValue> {
        let document = web_sys::window().and_then(|w| w.document()).ok_or("No global document")?;
        let canvas: HtmlCanvasElement = document.create_element("canvas")?.dyn_into()?;
        let ctx: CanvasRenderingContext2d = canvas.get_context("2d")?.ok_or("Failed to get 2d context")?.dyn_into()?;
        Ok(Layer { canvas, ctx })
    }

    fn resize(&self, w: u32, h: u32) {
        if self.canvas.width() != w {
            self.canvas.set_width(w);
        }
        if self.canvas.height() != h {
            self.canvas.set_height(h);
        }
    }
}

#[derive(Default, Clone, Copy, serde::Serialize)]
pub struct RenderStats {
    pub elements: usize,
    pub drawn: usize,
    pub batched: usize,
    pub aggregated_cells: usize,
    pub lod_level: i32,
    pub full_repaints: u64,
    pub partial_repaints: u64,
    pub blits: u64,
    pub last_static_ms: f64,
    pub last_frame_ms: f64,
}

pub struct LayerCache {
    front: Layer,
    back: Layer,
    agg: Layer,
    agg_buf: Vec<u8>,
    valid: bool,
    view: Option<View>,
    theme: Option<Theme>,
    exclude: Option<u64>,
    hits: Vec<Hit>,
    pub stats: RenderStats,
}

/// Everything the painter needs that is not the scene itself.
pub struct PaintEnv<'a> {
    pub images: &'a HashMap<u64, HtmlImageElement>,
    pub fountain_sharpness: f64,
    pub is_dark: bool,
    pub zoom: f64,
    pub scratch: &'a RefCell<Vec<(f64, f64)>>,
}

fn now_ms() -> f64 {
    web_sys::window().and_then(|w| w.performance()).map(|p| p.now()).unwrap_or(0.0)
}

impl LayerCache {
    pub fn new() -> Result<LayerCache, JsValue> {
        Ok(LayerCache {
            front: Layer::new()?,
            back: Layer::new()?,
            agg: Layer::new()?,
            agg_buf: Vec::new(),
            valid: false,
            view: None,
            theme: None,
            exclude: None,
            hits: Vec::new(),
            stats: RenderStats { lod_level: -1, ..Default::default() },
        })
    }

    pub fn invalidate(&mut self) {
        self.valid = false;
    }

    /// Sub-pixel offset between where the static layer was painted and where
    /// the view is now (device px). Non-zero only mid-pan.
    pub fn residual(&self, view: &View) -> (f64, f64) {
        match &self.view {
            Some(v) => ((view.off_x - v.off_x) * view.dpr, (view.off_y - v.off_y) * view.dpr),
            None => (0.0, 0.0),
        }
    }

    /// The static layer canvas, for compositing.
    pub fn canvas(&self) -> &HtmlCanvasElement {
        &self.front.canvas
    }

    /// Brings the static layer up to date for `view`, repainting as little as
    /// possible.
    pub fn update(&mut self, scene: &mut Scene, view: View, theme: &Theme, exclude: Option<u64>, env: &PaintEnv) {
        let t0 = now_ms();
        let (wu, hu) = (view.w as u32, view.h as u32);
        let resized = self.front.canvas.width() != wu || self.front.canvas.height() != hu;
        if resized {
            self.front.resize(wu, hu);
            self.back.resize(wu, hu);
            self.agg.resize(wu, hu);
        }
        let (scene_full, dirty) = scene.take_dirty();
        let prev = self.view;
        let mut full = resized
            || !self.valid
            || scene_full
            || self.theme.as_ref() != Some(theme)
            || prev.is_none_or(|p| p.zoom != view.zoom || p.dpr != view.dpr || p.w != view.w || p.h != view.h);

        let mut regions: Vec<DevRect> = Vec::new();
        let mut painted_view = prev.unwrap_or(view);

        // Pan: shift existing pixels instead of repainting them.
        if !full {
            let sx = ((view.off_x - painted_view.off_x) * view.dpr).round();
            let sy = ((view.off_y - painted_view.off_y) * view.dpr).round();
            if sx.abs() >= view.w * 0.5 || sy.abs() >= view.h * 0.5 {
                full = true;
            } else if sx != 0.0 || sy != 0.0 {
                self.back.ctx.set_global_composite_operation("copy").ok();
                let _ = self.back.ctx.set_transform(1.0, 0.0, 0.0, 1.0, 0.0, 0.0);
                let _ = self.back.ctx.draw_image_with_html_canvas_element(&self.front.canvas, sx, sy);
                self.back.ctx.set_global_composite_operation("source-over").ok();
                std::mem::swap(&mut self.front, &mut self.back);
                painted_view.off_x += sx / view.dpr;
                painted_view.off_y += sy / view.dpr;
                if sx > 0.0 {
                    regions.push(DevRect { x0: 0.0, y0: 0.0, x1: sx, y1: view.h });
                } else if sx < 0.0 {
                    regions.push(DevRect { x0: view.w + sx, y0: 0.0, x1: view.w, y1: view.h });
                }
                // Horizontal strip excludes the columns the vertical strip
                // already covers, so the two form an L and never merge into a
                // full-viewport box.
                let (hx0, hx1) = if sx > 0.0 { (sx, view.w) } else { (0.0, view.w + sx) };
                if sy > 0.0 {
                    regions.push(DevRect { x0: hx0, y0: 0.0, x1: hx1, y1: sy });
                } else if sy < 0.0 {
                    regions.push(DevRect { x0: hx0, y0: view.h + sy, x1: hx1, y1: view.h });
                }
                self.stats.blits += 1;
            }
        }

        if !full {
            // Element being dragged lives in the dynamic layer. While it stays
            // excluded its intermediate positions never touch the static layer.
            let exclusion_changed = exclude != self.exclude;
            if exclusion_changed {
                for id in [self.exclude, exclude].into_iter().flatten() {
                    if let Some(b) = scene.visual_bounds(id) {
                        regions.extend(painted_view.device_rect(&b));
                    }
                }
            }
            for (id, r) in &dirty {
                if !exclusion_changed && Some(*id) == exclude {
                    continue;
                }
                regions.extend(painted_view.device_rect(r));
            }
            regions = merge_regions(regions);
            let area: f64 = regions.iter().map(|r| r.area()).sum();
            if area > view.w * view.h * PARTIAL_AREA_LIMIT {
                full = true;
            }
        }

        self.exclude = exclude;
        self.theme = Some(theme.clone());
        self.stats.elements = scene.len();
        self.stats.drawn = 0;
        self.stats.batched = 0;
        self.stats.aggregated_cells = 0;

        if full {
            painted_view = view;
            self.paint_region(scene, &painted_view, theme, painted_view.full(), false, env);
            self.stats.full_repaints += 1;
        } else {
            for r in &regions {
                self.paint_region(scene, &painted_view, theme, *r, true, env);
            }
            if !regions.is_empty() {
                self.stats.partial_repaints += 1;
            }
        }
        self.view = Some(painted_view);
        self.valid = true;
        if full || !regions.is_empty() {
            self.stats.last_static_ms = now_ms() - t0;
        }
    }

    fn paint_region(&mut self, scene: &Scene, view: &View, theme: &Theme, d: DevRect, clip: bool, env: &PaintEnv) {
        let ctx = &self.front.ctx;
        ctx.save();
        let _ = ctx.set_transform(1.0, 0.0, 0.0, 1.0, 0.0, 0.0);
        let (w, h) = (d.x1 - d.x0, d.y1 - d.y0);
        if clip {
            ctx.begin_path();
            ctx.rect(d.x0, d.y0, w, h);
            ctx.clip();
        }
        ctx.clear_rect(d.x0, d.y0, w, h);
        if theme.bg != "transparent" {
            ctx.set_fill_style_str(&theme.bg);
            ctx.fill_rect(d.x0, d.y0, w, h);
        }

        let world = view.world_rect(&d);
        view.apply(ctx);
        paint_grid(ctx, &world, view.zoom, &theme.grid, theme.is_dark);

        let lod = lod_level(view.zoom, theme.lod_px);
        self.stats.lod_level = lod.map(|l| l as i32).unwrap_or(-1);
        if let Some(p) = lod {
            self.stats.aggregated_cells +=
                splat_aggregates(&self.agg, &mut self.agg_buf, ctx, scene.pyramid(), p, view, &d, &world, theme.is_dark);
        }

        let min_level = lod.map(|p| p + 1).unwrap_or(0);
        scene.query_sorted(&world, min_level, &mut self.hits);
        let mut batches = Batches::default();
        let mut run = Run::default();
        for hit in &self.hits {
            if Some(hit.key.1) == self.exclude {
                continue;
            }
            let Some(el) = scene.get(hit.key.1) else { continue };
            if run.try_append(ctx, el, env) {
                self.stats.batched += 1;
                continue;
            }
            run.flush(ctx);
            if paint_element_lod(ctx, el, env, &mut batches) {
                self.stats.batched += 1;
            } else {
                self.stats.drawn += 1;
            }
        }
        run.flush(ctx);
        batches.flush(ctx);
        ctx.restore();
    }
}

/// Coalesces overlapping rects when their union is not much bigger than the
/// pair (so an L-shaped pair stays two strips). Collapses past a cap.
fn merge_regions(mut rs: Vec<DevRect>) -> Vec<DevRect> {
    if rs.len() > MAX_REGIONS {
        let all = rs.iter().skip(1).fold(rs[0], |a, r| a.union(r));
        return vec![all];
    }
    let mut merged = true;
    while merged {
        merged = false;
        'outer: for i in 0..rs.len() {
            for j in (i + 1)..rs.len() {
                let (a, b) = (rs[i], rs[j]);
                if a.overlaps(&b) && a.union(&b).area() <= (a.area() + b.area()) * 1.25 {
                    rs[i] = rs[i].union(&rs[j]);
                    rs.swap_remove(j);
                    merged = true;
                    break 'outer;
                }
            }
        }
    }
    rs
}

// ── Grid ────────────────────────────────────────────────────────────────────

pub fn paint_grid(ctx: &CanvasRenderingContext2d, world: &Rect, zoom: f64, grid: &str, is_dark: bool) {
    if grid != "dots" && grid != "lines" {
        return;
    }
    // Adaptive spacing: grow the step ×5 until it is ≥ 12 CSS px apart so the
    // grid never degenerates into tens of thousands of sub-pixel marks.
    let mut step = 30.0;
    while step * zoom < 12.0 {
        step *= 5.0;
    }
    let (sx, ex) = ((world.min_x / step).floor() as i64, (world.max_x / step).ceil() as i64);
    let (sy, ey) = ((world.min_y / step).floor() as i64, (world.max_y / step).ceil() as i64);
    let count = (ex - sx + 1).max(0) as f64 * (ey - sy + 1).max(0) as f64;
    if count > 400_000.0 {
        return;
    }
    if grid == "dots" {
        ctx.set_fill_style_str(if is_dark { "#333333" } else { "#cbd5e1" });
        let r = (1.05 * zoom).clamp(0.6, 1.6) / zoom;
        ctx.begin_path();
        for gx in sx..=ex {
            for gy in sy..=ey {
                ctx.rect(gx as f64 * step - r, gy as f64 * step - r, r * 2.0, r * 2.0);
            }
        }
        ctx.fill();
    } else {
        ctx.set_stroke_style_str(if is_dark { "#222222" } else { "#e2e8f0" });
        ctx.set_line_width(1.0 / zoom);
        ctx.begin_path();
        for gx in sx..=ex {
            ctx.move_to(gx as f64 * step, sy as f64 * step);
            ctx.line_to(gx as f64 * step, ey as f64 * step);
        }
        for gy in sy..=ey {
            ctx.move_to(sx as f64 * step, gy as f64 * step);
            ctx.line_to(ex as f64 * step, gy as f64 * step);
        }
        ctx.stroke();
    }
}

// ── Level-of-detail aggregates ──────────────────────────────────────────────

/// Paints density-pyramid cells as solid blocks by writing pixels directly into
/// a buffer and uploading it once — no per-cell canvas calls. Cost is bounded
/// by the pixel area of the region, independent of element count.
#[allow(clippy::too_many_arguments)]
fn splat_aggregates(
    agg: &Layer,
    buf: &mut Vec<u8>,
    target: &CanvasRenderingContext2d,
    pyramid: &DensityPyramid,
    p: usize,
    view: &View,
    d: &DevRect,
    world: &Rect,
    is_dark: bool,
) -> usize {
    let (x0, y0) = (d.x0 as i64, d.y0 as i64);
    let (rw, rh) = ((d.x1 - d.x0) as i64, (d.y1 - d.y0) as i64);
    if rw <= 0 || rh <= 0 {
        return 0;
    }
    buf.clear();
    buf.resize((rw * rh * 4) as usize, 0);
    let mut cells = 0usize;
    pyramid.for_each_cell(p, world, |cell, agg_cell| {
        let Some(c) = view.device_rect(&cell) else { return };
        // device_rect pads by 1px for repaint safety; undo that for blocks.
        let cx0 = ((c.x0 + 1.0).max(d.x0) as i64 - x0).clamp(0, rw);
        let cy0 = ((c.y0 + 1.0).max(d.y0) as i64 - y0).clamp(0, rh);
        let mut cx1 = ((c.x1 - 1.0).min(d.x1) as i64 - x0).clamp(0, rw);
        let mut cy1 = ((c.y1 - 1.0).min(d.y1) as i64 - y0).clamp(0, rh);
        if cx1 <= cx0 {
            cx1 = (cx0 + 1).min(rw);
        }
        if cy1 <= cy0 {
            cy1 = (cy0 + 1).min(rh);
        }
        let (mut r, mut g, mut b) = agg_cell.mean_rgb();
        let lum = (r as u32 * 3 + g as u32 * 6 + b as u32) / 10;
        if is_dark && lum < 60 {
            (r, g, b) = (248, 250, 252);
        } else if !is_dark && lum > 235 {
            (r, g, b) = (0, 0, 0);
        }
        let a = (70 + agg_cell.count.min(4) * 45) as u8;
        for yy in cy0..cy1 {
            let row = (yy * rw) as usize * 4;
            for xx in cx0..cx1 {
                let i = row + xx as usize * 4;
                buf[i] = r;
                buf[i + 1] = g;
                buf[i + 2] = b;
                buf[i + 3] = a;
            }
        }
        cells += 1;
    });
    if cells == 0 {
        return 0;
    }
    if let Ok(img) = ImageData::new_with_u8_clamped_array_and_sh(Clamped(&buf[..]), rw as u32, rh as u32) {
        let _ = agg.ctx.put_image_data(&img, 0.0, 0.0);
        target.save();
        let _ = target.set_transform(1.0, 0.0, 0.0, 1.0, 0.0, 0.0);
        let (fw, fh) = (rw as f64, rh as f64);
        let _ = target.draw_image_with_html_canvas_element_and_sw_and_sh_and_dx_and_dy_and_dw_and_dh(
            &agg.canvas, 0.0, 0.0, fw, fh, d.x0, d.y0, fw, fh,
        );
        target.restore();
    }
    cells
}

// ── Batched small strokes ───────────────────────────────────────────────────

#[derive(Default)]
struct Batches {
    items: Vec<(String, i64, Path2d)>,
}

impl Batches {
    fn path(&mut self, ctx: &CanvasRenderingContext2d, color: &str, width: f64) -> Option<&Path2d> {
        let wq = (width * 4.0).round() as i64;
        let idx = match self.items.iter().position(|(c, w, _)| c == color && *w == wq) {
            Some(i) => i,
            None => {
                if self.items.len() >= 64 {
                    self.flush(ctx);
                }
                self.items.push((color.to_string(), wq, Path2d::new().ok()?));
                self.items.len() - 1
            }
        };
        self.items.get(idx).map(|(_, _, p)| p)
    }

    fn flush(&mut self, ctx: &CanvasRenderingContext2d) {
        ctx.set_line_cap("round");
        ctx.set_line_join("round");
        ctx.set_global_alpha(1.0);
        for (color, wq, path) in self.items.drain(..) {
            ctx.set_stroke_style_str(&color);
            ctx.set_line_width(wq as f64 / 4.0);
            ctx.stroke_with_path(&path);
        }
    }
}

// ── Same-style runs ─────────────────────────────────────────────────────────

/// Consecutive (in paint order) opaque stroke-only elements sharing colour and
/// width are appended to one Path2D and stroked once. Unlike `Batches` this
/// never reorders anything, so it is exact at any size. Real drawings are
/// mostly long runs of one pen, so this collapses thousands of canvas calls.
#[derive(Default)]
struct Run {
    key: Option<(String, i64)>,
    path: Option<Path2d>,
}

impl Run {
    fn runnable(el: &Element, zoom: f64) -> bool {
        match el.kind.as_str() {
            "FreeDraw" => el.w.max(el.h) * zoom >= SMALL_STROKE_PX,
            "Rectangle" | "Ellipse" | "Line" | "Arrow" => el.fill_color == "transparent" || el.fill_color.is_empty(),
            _ => false,
        }
    }

    fn try_append(&mut self, ctx: &CanvasRenderingContext2d, el: &Element, env: &PaintEnv) -> bool {
        if !Self::runnable(el, env.zoom) || el.points.is_empty() {
            return false;
        }
        let color = effective_color(&el.stroke_color, env.is_dark);
        let wq = (el.stroke_width * 4.0).round() as i64;
        let same = self.key.as_ref().is_some_and(|(c, w)| c == color && *w == wq);
        if !same {
            self.flush(ctx);
            self.key = Some((color.to_string(), wq));
            self.path = Path2d::new().ok();
        }
        let Some(path) = &self.path else { return false };
        append_geometry(path, el, env);
        true
    }

    fn flush(&mut self, ctx: &CanvasRenderingContext2d) {
        if let (Some((color, wq)), Some(path)) = (self.key.take(), self.path.take()) {
            ctx.set_global_alpha(1.0);
            ctx.set_line_cap("round");
            ctx.set_line_join("round");
            ctx.set_stroke_style_str(&color);
            ctx.set_line_width(wq as f64 / 4.0);
            ctx.stroke_with_path(&path);
        }
    }
}

/// Appends an element's outline to a path using the same geometry as
/// `paint_element`, so batched and individual drawing look identical.
fn append_geometry(path: &Path2d, el: &Element, env: &PaintEnv) {
    let first = el.points[0];
    let last = el.points[el.points.len() - 1];
    match el.kind.as_str() {
        "Rectangle" => {
            let (x, y) = (first.0.min(last.0), first.1.min(last.1));
            path.rect(x, y, (last.0 - first.0).abs().max(1.0), (last.1 - first.1).abs().max(1.0));
        }
        "Ellipse" => {
            let (cx, cy) = ((first.0 + last.0) / 2.0, (first.1 + last.1) / 2.0);
            let (rx, ry) = (((last.0 - first.0).abs() / 2.0).max(1.0), ((last.1 - first.1).abs() / 2.0).max(1.0));
            path.move_to(cx + rx, cy);
            let _ = path.ellipse(cx, cy, rx, ry, 0.0, 0.0, std::f64::consts::TAU);
        }
        "Line" | "Arrow" => {
            path.move_to(first.0, first.1);
            path.line_to(last.0, last.1);
            if el.kind == "Arrow" && el.points.len() >= 2 {
                let angle = (last.1 - first.1).atan2(last.0 - first.0);
                let head = (el.stroke_width * 5.0).max(12.0);
                path.move_to(last.0, last.1);
                path.line_to(last.0 - head * (angle - 0.45).cos(), last.1 - head * (angle - 0.45).sin());
                path.move_to(last.0, last.1);
                path.line_to(last.0 - head * (angle + 0.45).cos(), last.1 - head * (angle + 0.45).sin());
            }
        }
        _ => {
            let mut scratch = env.scratch.borrow_mut();
            let pts: &[(f64, f64)] = if el.points.len() > 16 {
                decimate_into(&el.points, 0.35 / env.zoom, &mut scratch);
                &scratch
            } else {
                &el.points
            };
            let (Some(&a), Some(&z)) = (pts.first(), pts.last()) else { return };
            path.move_to(a.0, a.1);
            if pts.len() == 1 {
                path.line_to(a.0 + 0.001, a.1); // round cap renders the dot
            } else if pts.len() == 2 || !el.is_curved {
                for p in &pts[1..] {
                    path.line_to(p.0, p.1);
                }
            } else {
                for w in pts[1..].windows(2) {
                    let (p, q) = (w[0], w[1]);
                    path.quadratic_curve_to(p.0, p.1, (p.0 + q.0) / 2.0, (p.1 + q.1) / 2.0);
                }
                path.line_to(z.0, z.1);
            }
        }
    }
}

/// Paints one committed element with level-of-detail rules. Returns true when
/// the element went into a batch rather than being drawn individually.
fn paint_element_lod(ctx: &CanvasRenderingContext2d, el: &Element, env: &PaintEnv, batches: &mut Batches) -> bool {
    let zoom = env.zoom;
    let screen = el.w.max(el.h) * zoom;
    match el.kind.as_str() {
        "Text" if el.font_size * zoom < 3.0 => {
            // Greeking: text too small to read becomes a faint bar.
            ctx.set_global_alpha(0.3);
            ctx.set_fill_style_str(effective_color(&el.stroke_color, env.is_dark));
            ctx.fill_rect(el.x, el.y + el.h * 0.2, el.w, el.h * 0.6);
            ctx.set_global_alpha(1.0);
            false
        }
        "Image" | "Diagram" if screen < 4.0 => {
            ctx.set_fill_style_str(if env.is_dark { "#3a3a3a" } else { "#cbd5e1" });
            ctx.fill_rect(el.x, el.y, el.w, el.h);
            false
        }
        "FreeDraw" | "FountainPen" if screen < SMALL_STROKE_PX && el.points.len() > 1 => {
            let color = effective_color(&el.stroke_color, env.is_dark);
            let width = if el.kind == "FountainPen" { el.stroke_width * 1.2 } else { el.stroke_width };
            let mut scratch = env.scratch.borrow_mut();
            decimate_into(&el.points, 0.75 / zoom, &mut scratch);
            if let Some(path) = batches.path(ctx, color, width) {
                if let Some(first) = scratch.first() {
                    path.move_to(first.0, first.1);
                    if scratch.len() == 1 {
                        path.line_to(first.0 + 0.01, first.1);
                    }
                    for p in scratch.iter().skip(1) {
                        path.line_to(p.0, p.1);
                    }
                }
            }
            true
        }
        _ => {
            paint_element(ctx, el, env, true);
            false
        }
    }
}

/// Full-fidelity element painter (shared by the static layer and the dynamic
/// overlay). `decimate` drops sub-pixel points from long freehand strokes.
pub fn paint_element(ctx: &CanvasRenderingContext2d, el: &Element, env: &PaintEnv, decimate: bool) {
    if el.points.is_empty() {
        return;
    }
    ctx.save();
    let stroke = effective_color(&el.stroke_color, env.is_dark);
    let fill = effective_color(&el.fill_color, env.is_dark);
    let has_fill = el.fill_color != "transparent" && !el.fill_color.is_empty();
    ctx.set_stroke_style_str(stroke);
    ctx.set_fill_style_str(fill);
    ctx.set_line_width(el.stroke_width);
    ctx.set_line_cap("round");
    ctx.set_line_join("round");

    let first = el.points[0];
    let last = el.points[el.points.len() - 1];

    match el.kind.as_str() {
        "Rectangle" => {
            let (x, y) = (first.0.min(last.0), first.1.min(last.1));
            let (w, h) = ((last.0 - first.0).abs().max(1.0), (last.1 - first.1).abs().max(1.0));
            if has_fill {
                ctx.fill_rect(x, y, w, h);
            }
            ctx.stroke_rect(x, y, w, h);
        }
        "Ellipse" => {
            let (cx, cy) = ((first.0 + last.0) / 2.0, (first.1 + last.1) / 2.0);
            let (rx, ry) = (((last.0 - first.0).abs() / 2.0).max(1.0), ((last.1 - first.1).abs() / 2.0).max(1.0));
            ctx.begin_path();
            let _ = ctx.ellipse(cx, cy, rx, ry, 0.0, 0.0, std::f64::consts::TAU);
            if has_fill {
                ctx.fill();
            }
            ctx.stroke();
        }
        "Line" if el.points.len() >= 2 => {
            ctx.begin_path();
            ctx.move_to(first.0, first.1);
            ctx.line_to(last.0, last.1);
            ctx.stroke();
        }
        "Arrow" if el.points.len() >= 2 => {
            let angle = (last.1 - first.1).atan2(last.0 - first.0);
            let head = (el.stroke_width * 5.0).max(12.0);
            ctx.begin_path();
            ctx.move_to(first.0, first.1);
            ctx.line_to(last.0, last.1);
            ctx.move_to(last.0, last.1);
            ctx.line_to(last.0 - head * (angle - 0.45).cos(), last.1 - head * (angle - 0.45).sin());
            ctx.move_to(last.0, last.1);
            ctx.line_to(last.0 - head * (angle + 0.45).cos(), last.1 - head * (angle + 0.45).sin());
            ctx.stroke();
        }
        "Line" | "Arrow" => {}
        "Text" => {
            ctx.set_font(&format!("{:.0}px {}", el.font_size, el.font_family));
            ctx.set_fill_style_str(stroke);
            let line_height = el.font_size * 1.2;
            for (i, line) in el.text.split('\n').enumerate() {
                let _ = ctx.fill_text(line, el.x, el.y + el.font_size + i as f64 * line_height);
            }
        }
        "Image" | "Diagram" => {
            if let Some(img) = env.images.get(&el.id) {
                let _ = ctx.draw_image_with_html_image_element_and_dw_and_dh(img, el.x, el.y, el.w, el.h);
            } else {
                // Asset still decoding / missing: show a frame so it stays selectable.
                ctx.set_stroke_style_str(if env.is_dark { "#2a2a2a" } else { "#cbd5e1" });
                ctx.set_line_width(1.0 / env.zoom);
                ctx.stroke_rect(el.x, el.y, el.w, el.h);
            }
        }
        kind => paint_freehand(ctx, el, env, kind, stroke, decimate),
    }
    ctx.restore();
}

fn paint_freehand(ctx: &CanvasRenderingContext2d, el: &Element, env: &PaintEnv, kind: &str, stroke: &str, decimate: bool) {
    let is_fountain = kind == "FountainPen";
    match kind {
        "Highlighter" => {
            ctx.set_global_alpha(0.35);
            ctx.set_line_cap("square");
            ctx.set_line_width(el.stroke_width * 6.0);
        }
        "LaserPen" => {
            ctx.set_stroke_style_str("#ff0000");
            ctx.set_shadow_color("#ff0000");
            ctx.set_shadow_blur(15.0);
            ctx.set_global_alpha(el.font_size.clamp(0.0, 1.0));
            ctx.set_line_width(el.stroke_width * 1.5);
        }
        "MagicPen" => {
            ctx.set_stroke_style_str("#a855f7");
            ctx.set_shadow_color("#a855f7");
            ctx.set_shadow_blur(8.0);
        }
        _ => {}
    }

    let mut scratch = env.scratch.borrow_mut();
    let pts: &[(f64, f64)] = if decimate && el.points.len() > 16 {
        decimate_into(&el.points, 0.35 / env.zoom, &mut scratch);
        &scratch
    } else {
        &el.points
    };
    let Some(&first) = pts.first() else { return };
    let Some(&last) = pts.last() else { return };

    if pts.len() == 1 {
        ctx.begin_path();
        let _ = ctx.arc(first.0, first.1, (el.stroke_width / 2.0).max(1.0), 0.0, std::f64::consts::TAU);
        ctx.set_fill_style_str(stroke);
        ctx.fill();
    } else if pts.len() == 2 || !el.is_curved {
        ctx.begin_path();
        ctx.move_to(first.0, first.1);
        for p in &pts[1..] {
            ctx.line_to(p.0, p.1);
        }
        ctx.stroke();
    } else if is_fountain {
        // Calligraphic flat nib: several parallel thin strokes on a diagonal.
        ctx.set_line_join("miter");
        ctx.set_line_cap("square");
        let offset = el.stroke_width * 0.25 * env.fountain_sharpness.clamp(0.5, 3.0);
        ctx.set_line_width(el.stroke_width * 0.4);
        for i in -2..=2 {
            let (ox, oy) = (offset * i as f64, -offset * i as f64);
            ctx.begin_path();
            ctx.move_to(first.0 + ox, first.1 + oy);
            for w in pts[1..].windows(2) {
                let (a, b) = (w[0], w[1]);
                ctx.quadratic_curve_to(a.0 + ox, a.1 + oy, (a.0 + b.0) / 2.0 + ox, (a.1 + b.1) / 2.0 + oy);
            }
            ctx.line_to(last.0 + ox, last.1 + oy);
            ctx.stroke();
        }
    } else {
        // Smooth quadratic through midpoints.
        ctx.begin_path();
        ctx.move_to(first.0, first.1);
        for w in pts[1..].windows(2) {
            let (a, b) = (w[0], w[1]);
            ctx.quadratic_curve_to(a.0, a.1, (a.0 + b.0) / 2.0, (a.1 + b.1) / 2.0);
        }
        ctx.line_to(last.0, last.1);
        ctx.stroke();
    }
}
