//! Incremental painting of the stroke being drawn.
//!
//! The naive way to show a stroke in progress is to rebuild and refill its
//! whole outline every frame, which makes each frame cost as much as the
//! stroke is long: a long shading scribble gets slower the longer the pen
//! stays down. Here the settled part of the stroke is painted once into an
//! offscreen layer, in chunks, and only the last few samples up to the pen
//! tip (the part that can still change: the end taper and the un-lagged tip)
//! are rebuilt per frame. Frame cost is then constant however long the stroke.
//!
//! The centre line comes from the same `Sampler` that committed strokes use,
//! and settled samples never change, so the baked ink is exactly what a full
//! rebuild would draw.
//!
//! Chunks overlap by a few samples so their square-cut ends never show. That
//! is invisible for opaque ink; translucent or glowing ink (highlighter, laser,
//! partial opacity) is baked opaque and composited as a group, so overlaps —
//! and the stroke crossing itself — never double up.

use web_sys::{CanvasRenderingContext2d, Path2d};

use crate::element::Element;
use crate::freehand::{self, Opts, Sample, Sampler};
use crate::path::{smooth_closed, to_path};
use crate::render::{ink_opts, ink_style, Layer, Scratch, View};

/// Settled samples painted per baked chunk.
const CHUNK: usize = 48;
/// Samples a chunk reaches back into the previous one.
const OVERLAP: usize = 6;

#[derive(Default)]
pub struct LiveInk {
    layer: Option<Layer>,
    stroke_id: u64,
    sampler: Option<Sampler>,
    opts: Option<Opts>,
    /// The device reports varying pressure (see `freehand::has_real_pressure`).
    real_pressure: bool,
    /// Input points already checked for pressure variation.
    checked: usize,
    /// Coarsest step forced by the sample cap; never refined within a stroke.
    min_step: f64,
    /// Index of the last settled sample painted into `layer`.
    baked: usize,
    view: Option<View>,
    dark: bool,
    window: Vec<Sample>,
}

impl LiveInk {
    /// Settled samples of the current stroke.
    pub fn sample_count(&self) -> usize {
        self.sampler.as_ref().map(|s| s.samples().len()).unwrap_or(0)
    }

    /// Whether the layer holds stroke `id` painted for exactly this view, so
    /// its ink can be copied elsewhere pixel for pixel.
    pub fn holds(&self, id: u64, view: &View, is_dark: bool) -> bool {
        self.stroke_id == id && self.sampler.is_some() && self.view == Some(*view) && self.dark == is_dark
    }

    /// Brings the baked layer up to date with `stroke`. Returns false when
    /// the stroke cannot be painted incrementally (no offscreen canvas).
    pub fn advance(&mut self, stroke: &Element, view: &View, is_dark: bool, scratch: &Scratch) -> bool {
        if self.layer.is_none() {
            self.layer = Layer::new().ok();
        }
        if self.layer.is_none() || stroke.points.is_empty() {
            return false;
        }
        let opts = ink_opts(stroke);
        let fresh = self.stroke_id != stroke.id || self.sampler.is_none();
        if fresh {
            self.stroke_id = stroke.id;
            self.real_pressure = false;
            self.checked = 0;
            self.min_step = 0.0;
        }
        self.opts = Some(opts);

        // Pressure becomes "real" the first time it varies, and stays so.
        let has_pressures = stroke.pressures.len() == stroke.points.len();
        let mut restart = fresh;
        if has_pressures && !self.real_pressure {
            let first = stroke.pressures[0];
            if stroke.pressures[self.checked.min(stroke.pressures.len())..].iter().any(|&p| freehand::varies(p, first)) {
                self.real_pressure = true;
                restart = true;
            }
            self.checked = stroke.pressures.len();
        }

        let view_changed = self.view != Some(*view) || self.dark != is_dark;
        let step = freehand::step_for(&opts, view.zoom).max(self.min_step);
        if self.sampler.as_ref().is_some_and(|s| s.step() != step || s.consumed() > stroke.points.len()) {
            restart = true;
        }
        if restart {
            self.sampler = Some(Sampler::new(opts, step, !(self.real_pressure && has_pressures)));
        }
        self.feed(stroke, has_pressures);

        // Sample cap: an enormous stroke is re-sampled at twice the spacing.
        while self.sampler.as_ref().is_some_and(|s| s.samples().len() > freehand::MAX_SAMPLES) {
            let coarser = self.sampler.as_ref().map(|s| s.step() * 2.0).unwrap_or(step);
            self.min_step = coarser;
            self.sampler = Some(Sampler::new(opts, coarser, !(self.real_pressure && has_pressures)));
            self.feed(stroke, has_pressures);
            restart = true;
        }

        let Some(layer) = &self.layer else { return false };
        if restart || view_changed {
            layer.resize(view.w as u32, view.h as u32);
            let _ = layer.ctx.set_transform(1.0, 0.0, 0.0, 1.0, 0.0, 0.0);
            layer.ctx.clear_rect(0.0, 0.0, view.w, view.h);
            self.baked = 0;
            self.view = Some(*view);
            self.dark = is_dark;
        }

        let Some(sampler) = &self.sampler else { return false };
        let samples = sampler.samples();
        // Samples near the tip stay live: the end taper reshapes them.
        let reserve = (opts.taper_end / sampler.step()).ceil() as usize + OVERLAP + 2;
        if samples.len() > self.baked + CHUNK + reserve {
            let style = ink_style(stroke, is_dark);
            let ctx = &layer.ctx;
            ctx.save();
            view.apply(ctx);
            ctx.set_fill_style_str(&style.color);
            let mut poly = scratch.outline.borrow_mut();
            let mut segs = scratch.segs.borrow_mut();
            while samples.len() > self.baked + CHUNK + reserve {
                let end = self.baked + CHUNK;
                let a = self.baked.saturating_sub(OVERLAP);
                // One neighbour on each side supplies the directions at the cut.
                let (w0, w1) = (a.saturating_sub(1), end + 1);
                poly.clear();
                freehand::outline_span(&samples[w0..=w1], a - w0, end - w0, f64::INFINITY, &opts, a == 0, false, &mut poly);
                segs.clear();
                smooth_closed(&poly, &mut segs);
                if let Some(path) = to_path(&segs) {
                    ctx.fill_with_path_2d(&path);
                }
                self.baked = end;
            }
            ctx.restore();
        }
        true
    }

    fn feed(&mut self, stroke: &Element, has_pressures: bool) {
        let Some(sampler) = self.sampler.as_mut() else { return };
        for i in sampler.consumed()..stroke.points.len() {
            sampler.push(stroke.points[i], if has_pressures { stroke.pressures[i] } else { 0.5 });
        }
    }

    /// Outline of the still-changing end of the stroke (everything, while
    /// nothing has been baked yet).
    fn tip_path(&mut self, scratch: &Scratch) -> Option<Path2d> {
        let (sampler, opts) = (self.sampler.as_ref()?, self.opts.as_ref()?);
        let samples = sampler.samples();
        let a = self.baked.saturating_sub(OVERLAP);
        let w0 = a.saturating_sub(1);
        self.window.clear();
        self.window.extend_from_slice(&samples[w0.min(samples.len())..]);
        self.window.extend(sampler.tip());
        let last = self.window.last()?;
        let total = last.run;
        let mut poly = scratch.outline.borrow_mut();
        let mut segs = scratch.segs.borrow_mut();
        if a == 0 {
            freehand::outline_samples(&self.window, opts, &mut poly);
        } else {
            poly.clear();
            freehand::outline_span(&self.window, a - w0, self.window.len() - 1, total, opts, false, true, &mut poly);
        }
        segs.clear();
        smooth_closed(&poly, &mut segs);
        to_path(&segs)
    }

    /// Paints the stroke onto `ctx`, which must carry the world transform.
    /// `group` is a viewport-sized scratch layer for translucent ink.
    pub fn paint(&mut self, ctx: &CanvasRenderingContext2d, stroke: &Element, view: &View, is_dark: bool, group: &Layer, scratch: &Scratch) {
        let style = ink_style(stroke, is_dark);
        let tip = self.tip_path(scratch);
        let Some(layer) = &self.layer else { return };
        // Glow is blurred in device pixels, beyond the stroke's own bounds.
        let glow_pad = style.glow.map(|(_, blur)| blur * 2.5 / (view.zoom * view.dpr).max(1e-9)).unwrap_or(0.0);
        let Some(d) = view.device_rect(&stroke.visual_bounds().expand(glow_pad)) else { return };
        let (w, h) = (d.x1 - d.x0, d.y1 - d.y0);

        if style.is_plain() {
            if self.baked > 0 {
                ctx.save();
                let _ = ctx.set_transform(1.0, 0.0, 0.0, 1.0, 0.0, 0.0);
                let _ = ctx.draw_image_with_html_canvas_element_and_sw_and_sh_and_dx_and_dy_and_dw_and_dh(&layer.canvas, d.x0, d.y0, w, h, d.x0, d.y0, w, h);
                ctx.restore();
            }
            if let Some(path) = &tip {
                ctx.save();
                ctx.set_fill_style_str(&style.color);
                ctx.fill_with_path_2d(path);
                ctx.restore();
            }
            return;
        }

        // Translucent / glowing ink: assemble baked ink + tip opaquely, then
        // composite the result once so nothing doubles up.
        let g = &group.ctx;
        g.save();
        let _ = g.set_transform(1.0, 0.0, 0.0, 1.0, 0.0, 0.0);
        g.clear_rect(d.x0, d.y0, w, h);
        if self.baked > 0 {
            let _ = g.draw_image_with_html_canvas_element_and_sw_and_sh_and_dx_and_dy_and_dw_and_dh(&layer.canvas, d.x0, d.y0, w, h, d.x0, d.y0, w, h);
        }
        if let Some(path) = &tip {
            view.apply(g);
            g.set_fill_style_str(&style.color);
            g.fill_with_path_2d(path);
        }
        g.restore();

        ctx.save();
        let _ = ctx.set_transform(1.0, 0.0, 0.0, 1.0, 0.0, 0.0);
        ctx.set_global_alpha(style.alpha);
        if let Some(op) = style.composite {
            let _ = ctx.set_global_composite_operation(op);
        }
        if let Some((shadow, blur)) = style.glow {
            ctx.set_shadow_color(shadow);
            ctx.set_shadow_blur(blur);
        }
        let _ = ctx.draw_image_with_html_canvas_element_and_sw_and_sh_and_dx_and_dy_and_dw_and_dh(&group.canvas, d.x0, d.y0, w, h, d.x0, d.y0, w, h);
        ctx.restore();
    }
}
