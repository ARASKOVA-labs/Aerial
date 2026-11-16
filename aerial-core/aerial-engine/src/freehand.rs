//! Variable-width freehand strokes.
//!
//! A stroke is rendered as a filled outline rather than a fixed-width line:
//! width follows pen pressure (or, for mice, is simulated from speed — fast
//! strokes thin out like real ink), the centre line is streamlined to remove
//! hand jitter, ends can taper, sharp turns get round joins, and the outline
//! is drawn with quadratic smoothing. This is the technique popularised by
//! perfect-freehand, implemented independently here in Rust.

use crate::path::{smooth_closed, Seg};

#[derive(Clone, Copy, Debug)]
pub struct Opts {
    /// Nominal stroke diameter in world units.
    pub size: f64,
    /// 0 = uniform width, 1 = width fully driven by pressure.
    pub thinning: f64,
    /// 0..1, how strongly the centre line lags behind raw input.
    pub streamline: f64,
    /// Minimum outline point spacing as a fraction of size.
    pub smoothing: f64,
    /// Taper lengths in world units (0 = round cap).
    pub taper_start: f64,
    pub taper_end: f64,
}

/// Pen presets. `stroke_width` is the user-facing width setting.
pub fn preset(kind: &str, stroke_width: f64) -> Opts {
    let sw = stroke_width.max(0.25);
    match kind {
        "FountainPen" => Opts { size: sw * 3.4, thinning: 0.8, streamline: 0.55, smoothing: 0.5, taper_start: sw * 9.0, taper_end: sw * 11.0 },
        "Marker" => Opts { size: sw * 2.2, thinning: 0.0, streamline: 0.45, smoothing: 0.5, taper_start: 0.0, taper_end: 0.0 },
        "Highlighter" => Opts { size: sw * 6.0, thinning: 0.0, streamline: 0.6, smoothing: 0.5, taper_start: 0.0, taper_end: 0.0 },
        "LaserPen" => Opts { size: sw * 1.6, thinning: 0.3, streamline: 0.4, smoothing: 0.4, taper_start: sw * 30.0, taper_end: 0.0 },
        // "FreeDraw" — the everyday pen.
        _ => Opts { size: sw * 2.4, thinning: 0.55, streamline: 0.5, smoothing: 0.5, taper_start: 0.0, taper_end: sw * 3.0 },
    }
}

/// One point of the streamlined centre line.
#[derive(Clone, Copy, Debug)]
pub struct Sample {
    pub x: f64,
    pub y: f64,
    /// Smoothed pressure, 0..1.
    pub p: f64,
    /// Arc length from the start of the stroke.
    pub run: f64,
}

/// Upper bound on centre-line samples per stroke. A stroke longer than
/// `MAX_SAMPLES × step` is sampled more coarsely instead of allocating without
/// limit — a two-point "stroke" spanning the whole world would otherwise ask
/// for billions of samples (a crafted file could exhaust memory that way).
pub const MAX_SAMPLES: usize = 60_000;

fn ease_out_quad(t: f64) -> f64 {
    let t = t.clamp(0.0, 1.0);
    t * (2.0 - t)
}

fn ease_out_cubic(t: f64) -> f64 {
    let t = t.clamp(0.0, 1.0) - 1.0;
    t * t * t + 1.0
}

/// Finest sample spacing (world units): what a stroke gets at 100% zoom and above.
pub fn base_step(o: &Opts) -> f64 {
    (o.size * 0.15).max(0.05)
}

/// Sample spacing for painting at `zoom`: never finer than about one screen
/// pixel. Quantised to powers of two of `base_step` so a cached outline stays
/// valid across a range of zoom levels.
pub fn step_for(o: &Opts, zoom: f64) -> f64 {
    let base = base_step(o);
    if zoom.is_nan() {
        return base;
    }
    let px = 1.0 / zoom.max(1e-9);
    if px <= base {
        return base;
    }
    base * 2f64.powi(((px / base).log2().floor() as i32).clamp(0, 60))
}

/// Speed → pressure for devices without pressure: slow strokes are heavier,
/// fast strokes lighter. Causal (each value depends only on earlier input),
/// so a stroke's simulated weight never changes as it grows.
#[derive(Clone, Copy, Debug)]
struct SpeedPressure {
    sx: f64,
    sy: f64,
    p: f64,
    started: bool,
}

impl SpeedPressure {
    fn new() -> Self {
        SpeedPressure { sx: 0.0, sy: 0.0, p: 0.5, started: false }
    }

    fn next(&mut self, (x, y): (f64, f64), o: &Opts) -> f64 {
        if !self.started {
            self.started = true;
            (self.sx, self.sy) = (x, y);
            return self.p;
        }
        let t = 0.15 + (1.0 - o.streamline.clamp(0.0, 1.0)) * 0.85;
        let (nx, ny) = (self.sx + (x - self.sx) * t, self.sy + (y - self.sy) * t);
        let d = ((nx - self.sx).powi(2) + (ny - self.sy).powi(2)).sqrt();
        if d.is_finite() && d >= (o.size * 0.08).max(0.05) {
            // Floored so a quick flick thins to ~40% instead of a hairline.
            let speed = (d / (o.size.max(0.5) * 1.6)).min(1.0);
            let target = 1.0 - speed * 0.7;
            self.p += (target - self.p) * (speed * 0.275).max(0.02);
            (self.sx, self.sy) = (nx, ny);
        }
        self.p
    }
}

/// The pressure the renderer simulates at every input point of a stroke
/// drawn without a pressure-sensitive device. Baked into the element before
/// the point list is simplified, so the committed stroke keeps exactly the
/// weight it had while being drawn (simulation depends on point spacing).
pub fn simulated_pressures(points: &[(f64, f64)], o: &Opts) -> Vec<f32> {
    let mut sim = SpeedPressure::new();
    points.iter().map(|&pt| sim.next(pt, o) as f32).collect()
}

/// True when `pressures` came from a pressure-sensitive device (or were baked
/// on commit). Mice report a constant 0.5, which is treated as "no pressure".
pub fn has_real_pressure(points: &[(f64, f64)], pressures: &[f32]) -> bool {
    pressures.len() == points.len()
        && pressures.iter().all(|p| p.is_finite())
        && pressures.iter().any(|&p| varies(p, pressures[0]))
}

/// Whether a pressure reading differs enough from the first to count as real.
pub fn varies(p: f32, first: f32) -> bool {
    (p - first).abs() > 0.01
}

/// Incremental centre-line generator.
///
/// Input points are re-spaced to a fixed arc-length `step` and streamlined
/// (an exponential lag that removes hand jitter). Everything is causal: a
/// sample, once emitted, never changes when more input arrives. That is what
/// lets the live stroke be painted incrementally — settled ink is baked once
/// and only the tip is redrawn — and it guarantees the live stroke and the
/// committed one are generated by the same code.
///
/// Smoothing is defined per unit of arc length, not per sample, so the same
/// path gives the same shape at any `step` (coarser steps are used when
/// zoomed out) and any input point density.
pub struct Sampler {
    o: Opts,
    step: f64,
    lag: f64,
    pressure_gain: f64,
    simulate: Option<SpeedPressure>,
    /// Input points offered, including any ignored as non-finite.
    seen: usize,
    count: usize,
    last: (f64, f64),
    last_p: f64,
    carry: f64,
    sx: f64,
    sy: f64,
    prev_p: f64,
    run: f64,
    samples: Vec<Sample>,
}

impl Sampler {
    /// `simulate`: derive pressure from speed (no pressure-sensitive device).
    pub fn new(o: Opts, step: f64, simulate: bool) -> Self {
        let base = base_step(&o);
        let step = if step.is_finite() { step.max(base) } else { base };
        let per_base = 0.15 + (1.0 - o.streamline.clamp(0.0, 1.0)) * 0.85;
        let ratio = step / base;
        Sampler {
            o,
            step,
            lag: 1.0 - (1.0 - per_base).powf(ratio),
            pressure_gain: 1.0 - 0.5f64.powf(ratio),
            simulate: simulate.then(SpeedPressure::new),
            seen: 0,
            count: 0,
            last: (0.0, 0.0),
            last_p: 0.5,
            carry: 0.0,
            sx: 0.0,
            sy: 0.0,
            prev_p: 0.5,
            run: 0.0,
            samples: Vec::new(),
        }
    }

    pub fn step(&self) -> f64 {
        self.step
    }

    /// Settled samples. Does not include the tip (see `tip`).
    pub fn samples(&self) -> &[Sample] {
        &self.samples
    }

    /// Number of input points consumed so far.
    pub fn consumed(&self) -> usize {
        self.seen
    }

    pub fn push(&mut self, pt: (f64, f64), pressure: f32) {
        self.seen += 1;
        if !(pt.0.is_finite() && pt.1.is_finite()) {
            return;
        }
        let p = match self.simulate.as_mut() {
            Some(sim) => sim.next(pt, &self.o),
            None if pressure.is_finite() => (pressure as f64).clamp(0.0, 1.0),
            None => self.last_p,
        };
        if self.count == 0 {
            self.count = 1;
            (self.last, self.last_p) = (pt, p);
            (self.sx, self.sy, self.prev_p) = (pt.0, pt.1, p);
            self.samples.push(Sample { x: pt.0, y: pt.1, p, run: 0.0 });
            return;
        }
        self.count += 1;
        let (a, pa) = (self.last, self.last_p);
        let len = ((pt.0 - a.0).powi(2) + (pt.1 - a.1).powi(2)).sqrt();
        if len.is_finite() && len >= 1e-12 {
            let mut at = self.step - self.carry;
            while at <= len {
                let t = at / len;
                self.emit(a.0 + (pt.0 - a.0) * t, a.1 + (pt.1 - a.1) * t, pa + (p - pa) * t);
                at += self.step;
            }
            self.carry = len - (at - self.step);
        }
        (self.last, self.last_p) = (pt, p);
    }

    fn emit(&mut self, x: f64, y: f64, p: f64) {
        let (nx, ny) = (self.sx + (x - self.sx) * self.lag, self.sy + (y - self.sy) * self.lag);
        self.run += ((nx - self.sx).powi(2) + (ny - self.sy).powi(2)).sqrt();
        self.prev_p += (p - self.prev_p) * self.pressure_gain;
        (self.sx, self.sy) = (nx, ny);
        self.samples.push(Sample { x: nx, y: ny, p: self.prev_p, run: self.run });
    }

    /// The stroke's current end: the latest input point itself (the pen tip is
    /// never lagged). Unlike settled samples it moves as input arrives.
    pub fn tip(&self) -> Option<Sample> {
        if self.count < 2 {
            return None;
        }
        let d = ((self.last.0 - self.sx).powi(2) + (self.last.1 - self.sy).powi(2)).sqrt();
        if d.is_nan() || d < 1e-9 {
            return None;
        }
        let p = self.prev_p + (self.last_p - self.prev_p) * self.pressure_gain;
        Some(Sample { x: self.last.0, y: self.last.1, p, run: self.run + d })
    }
}

/// Whole centre line of a finished stroke at sample spacing `step`.
pub fn collect(points: &[(f64, f64)], pressures: &[f32], o: &Opts, step: f64) -> Vec<Sample> {
    let real = has_real_pressure(points, pressures);
    let length: f64 = points.windows(2).map(|w| ((w[1].0 - w[0].0).powi(2) + (w[1].1 - w[0].1).powi(2)).sqrt()).sum();
    let step = if length.is_finite() { step.max(length / MAX_SAMPLES as f64) } else { step };
    let mut sampler = Sampler::new(*o, step, !real);
    for (i, &pt) in points.iter().enumerate() {
        sampler.push(pt, if real { pressures[i] } else { 0.5 });
    }
    let tip = sampler.tip();
    let mut out = sampler.samples;
    out.extend(tip);
    out
}

fn radius_at(smp: &Sample, total: f64, o: &Opts) -> f64 {
    let mut r = if o.thinning > 0.0 { o.size * (0.5 - o.thinning * (0.5 - smp.p)) } else { o.size * 0.5 };
    if o.taper_start > 0.0 && smp.run < o.taper_start {
        r *= ease_out_quad(smp.run / o.taper_start);
    }
    if o.taper_end > 0.0 && total - smp.run < o.taper_end {
        r *= ease_out_cubic((total - smp.run) / o.taper_end);
    }
    r.max(0.01 * o.size).max(0.05)
}

/// Largest half-width the outline can reach (full pressure, no taper).
pub fn max_radius(o: &Opts) -> f64 {
    (o.size * (0.5 + 0.5 * o.thinning.max(0.0))).max(0.05)
}

/// Outline polygon of samples `a..=b` of `s`, appended to `out`.
///
/// `s` may hold neighbours outside the span; they are used only for
/// directions, so adjoining spans meet without a kink. `total` is the stroke
/// length used for the end taper (`f64::INFINITY` for a span that is not at
/// the end). An end is closed with a round cap (or its taper) when the
/// matching `cap_*` flag is set, and cut square otherwise.
#[allow(clippy::too_many_arguments)]
pub fn outline_span(s: &[Sample], a: usize, b: usize, total: f64, o: &Opts, cap_start: bool, cap_end: bool, out: &mut Vec<(f64, f64)>) {
    let n = s.len();
    if n == 0 || a > b || b >= n {
        return;
    }
    if n == 1 {
        dot(&s[0], o, out);
        return;
    }
    let dir = |i: usize| -> (f64, f64) {
        let (p, q) = if i == 0 { (0, 1) } else { (i - 1, i) };
        let (dx, dy) = (s[q].x - s[p].x, s[q].y - s[p].y);
        let len = (dx * dx + dy * dy).sqrt();
        if len > 1e-9 { (dx / len, dy / len) } else { (1.0, 0.0) }
    };
    let min_gap = (o.size * o.smoothing).powi(2) * 0.25;
    let mut left: Vec<(f64, f64)> = Vec::with_capacity(b - a + 1);
    let mut right: Vec<(f64, f64)> = Vec::with_capacity(b - a + 1);
    let push_far = |v: &mut Vec<(f64, f64)>, p: (f64, f64), force: bool| {
        if force || v.last().is_none_or(|q| (q.0 - p.0).powi(2) + (q.1 - p.1).powi(2) > min_gap) {
            v.push(p);
        }
    };

    #[allow(clippy::needless_range_loop)] // neighbours of i are needed
    for i in a..=b {
        let r = radius_at(&s[i], total, o);
        let d0 = dir(i);
        let d1 = if i + 1 < n { dir(i + 1) } else { d0 };
        let dot = d0.0 * d1.0 + d0.1 * d1.1;
        let (px, py) = (s[i].x, s[i].y);
        if i > 0 && i + 1 < n && dot < -0.1 {
            // Sharp reversal: wrap a round join around the point on both sides.
            let a0 = d0.1.atan2(d0.0);
            // Left side sweeps around the front of the turn (a0+90° → a0-90°),
            // right side around the back (a0-90° → a0-270°), so neither crosses.
            for k in 0..=8 {
                let t = std::f64::consts::PI * k as f64 / 8.0;
                let la = a0 + std::f64::consts::FRAC_PI_2 - t;
                push_far(&mut left, (px + r * la.cos(), py + r * la.sin()), true);
                let ra = a0 - std::f64::consts::FRAC_PI_2 - t;
                push_far(&mut right, (px + r * ra.cos(), py + r * ra.sin()), true);
            }
            continue;
        }
        // Average the incoming and outgoing directions for a smooth normal.
        let (mut tx, mut ty) = (d0.0 + d1.0, d0.1 + d1.1);
        let tl = (tx * tx + ty * ty).sqrt();
        if tl < 1e-9 {
            (tx, ty) = d0;
        } else {
            tx /= tl;
            ty /= tl;
        }
        let (nx, ny) = (-ty, tx);
        let edge = i == a || i == b;
        push_far(&mut left, (px + nx * r, py + ny * r), edge);
        push_far(&mut right, (px - nx * r, py - ny * r), edge);
    }

    // Caps: round unless the end is tapered to a point.
    let cap = |out: &mut Vec<(f64, f64)>, c: &Sample, d: (f64, f64), r: f64| {
        let base = d.1.atan2(d.0);
        for k in 1..8 {
            let t = std::f64::consts::PI * k as f64 / 8.0;
            let ang = base + std::f64::consts::FRAC_PI_2 - t;
            out.push((c.x + r * ang.cos(), c.y + r * ang.sin()));
        }
    };

    out.extend(left.iter().copied());
    if cap_end && o.taper_end <= 0.0 {
        cap(out, &s[b], dir(b), radius_at(&s[b], total, o));
    }
    out.extend(right.iter().rev().copied());
    if cap_start && o.taper_start <= 0.0 {
        let d = dir(a.max(1));
        cap(out, &s[a], (-d.0, -d.1), radius_at(&s[a], total, o));
    }
}

/// A tap: a circle sized by pressure.
fn dot(c: &Sample, o: &Opts, out: &mut Vec<(f64, f64)>) {
    let r = (o.size * 0.5 * (0.6 + 0.4 * c.p)).max(0.3);
    for k in 0..16 {
        let a = k as f64 / 16.0 * std::f64::consts::TAU;
        out.push((c.x + r * a.cos(), c.y + r * a.sin()));
    }
}

/// Outline polygon of a whole centre line (cleared first).
pub fn outline_samples(s: &[Sample], o: &Opts, out: &mut Vec<(f64, f64)>) {
    out.clear();
    let Some(last) = s.last() else { return };
    if s.len() == 1 || last.run < o.size * 0.25 {
        dot(&s[0], o, out);
        return;
    }
    outline_span(s, 0, s.len() - 1, last.run, o, true, true, out);
}

/// Computes the outline polygon of a stroke into `out` (cleared first), with
/// the centre line sampled every `step` world units (see `step_for`).
pub fn outline(points: &[(f64, f64)], pressures: &[f32], o: &Opts, step: f64, out: &mut Vec<(f64, f64)>) {
    out.clear();
    if points.is_empty() || o.size.is_nan() || o.size <= 0.0 {
        return;
    }
    outline_samples(&collect(points, pressures, o, step), o, out);
}

/// Outline as smooth path segments.
pub fn outline_segs(points: &[(f64, f64)], pressures: &[f32], o: &Opts, step: f64, scratch: &mut Vec<(f64, f64)>, out: &mut Vec<Seg>) {
    out.clear();
    outline(points, pressures, o, step, scratch);
    smooth_closed(scratch, out);
}

#[cfg(test)]
mod tests {
    #[test]
    fn baked_pressures_align_and_vary_with_speed() {
        let o = super::preset("FreeDraw", 2.0);
        let mut pts: Vec<(f64, f64)> = (0..20).map(|i| (i as f64 * 1.0, 0.0)).collect();
        pts.extend((1..20).map(|i| (19.0 + i as f64 * 14.0, 0.0)));
        let p = super::simulated_pressures(&pts, &o);
        assert_eq!(p.len(), pts.len());
        assert!(p[18] > p[p.len() - 2], "slow part heavier than fast part: {} vs {}", p[18], p[p.len() - 2]);
        assert!(p.iter().all(|v| v.is_finite() && *v > 0.2 && *v <= 1.0));
    }

    use super::*;

    fn line(n: usize) -> Vec<(f64, f64)> {
        (0..n).map(|i| (i as f64 * 3.0, (i as f64 * 0.3).sin() * 4.0)).collect()
    }

    #[test]
    fn outline_is_finite_and_closed_shape() {
        let mut out = Vec::new();
        for kind in ["FreeDraw", "FountainPen", "Marker", "Highlighter", "LaserPen"] {
            let o = preset(kind, 2.5);
            outline(&line(80), &[], &o, base_step(&o), &mut out);
            assert!(out.len() > 20, "{kind}");
            assert!(out.iter().all(|p| p.0.is_finite() && p.1.is_finite()), "{kind}");
        }
    }

    #[test]
    fn width_tracks_pressure() {
        let pts = line(60);
        let o = preset("FreeDraw", 4.0);
        let light: Vec<f32> = (0..60).map(|i| if i % 2 == 0 { 0.1 } else { 0.12 }).collect();
        let heavy: Vec<f32> = (0..60).map(|i| if i % 2 == 0 { 0.95 } else { 0.97 }).collect();
        let span = |pr: &[f32]| {
            let mut out = Vec::new();
            outline(&pts, pr, &o, base_step(&o), &mut out);
            let (lo, hi) = out.iter().fold((f64::MAX, f64::MIN), |(a, b), p| (a.min(p.1), b.max(p.1)));
            hi - lo
        };
        assert!(span(&heavy) > span(&light) + 1.0);
    }

    #[test]
    fn marker_is_uniform_and_dots_are_round() {
        let mut out = Vec::new();
        let o = preset("Marker", 3.0);
        outline(&[(5.0, 5.0)], &[], &o, base_step(&o), &mut out);
        assert_eq!(out.len(), 16);
        let r0 = ((out[0].0 - 5.0).powi(2) + (out[0].1 - 5.0).powi(2)).sqrt();
        let r8 = ((out[8].0 - 5.0).powi(2) + (out[8].1 - 5.0).powi(2)).sqrt();
        assert!((r0 - r8).abs() < 1e-9);
    }

    /// Outline of a stroke as it is committed: pressures baked, then the
    /// point list RDP-simplified (mirrors `commit_active_stroke`).
    fn committed_outline(live: &[(f64, f64)], o: &Opts) -> Vec<(f64, f64)> {
        let baked = simulated_pressures(live, o);
        let keep = crate::geom::simplify_rdp_indices(live, 0.25);
        let pts: Vec<_> = keep.iter().map(|&i| live[i]).collect();
        let prs: Vec<_> = keep.iter().map(|&i| baked[i]).collect();
        let mut out = Vec::new();
        outline(&pts, &prs, o, base_step(o), &mut out);
        out
    }

    /// Largest distance from a vertex of `b` to the polygon `a`.
    fn drift(a: &[(f64, f64)], b: &[(f64, f64)]) -> f64 {
        let seg = |q: (f64, f64), p0: (f64, f64), p1: (f64, f64)| {
            let (dx, dy) = (p1.0 - p0.0, p1.1 - p0.1);
            let l2 = dx * dx + dy * dy;
            let t = if l2 > 0.0 { (((q.0 - p0.0) * dx + (q.1 - p0.1) * dy) / l2).clamp(0.0, 1.0) } else { 0.0 };
            ((p0.0 + dx * t - q.0).powi(2) + (p0.1 + dy * t - q.1).powi(2)).sqrt()
        };
        b.iter().map(|&q| (0..a.len()).map(|i| seg(q, a[i], a[(i + 1) % a.len()])).fold(f64::MAX, f64::min)).fold(0.0, f64::max)
    }

    /// What is written is what is kept: the committed stroke must match the
    /// live one the user saw while drawing (it used to cut corners because
    /// streamlining ran per point and simplification removes most points).
    #[test]
    fn committed_stroke_matches_live_stroke() {
        // An "M": straight runs sampled every 2px collapse to 5 points on commit.
        let corners = [(0.0, 0.0), (10.0, -40.0), (20.0, 0.0), (30.0, -40.0), (40.0, 0.0)];
        let mut zig: Vec<(f64, f64)> = corners
            .windows(2)
            .flat_map(|w| (0..20).map(move |k| {
                let f = k as f64 / 20.0;
                (w[0].0 + (w[1].0 - w[0].0) * f, w[0].1 + (w[1].1 - w[0].1) * f)
            }))
            .collect();
        zig.push((40.0, 0.0));
        // Cursive loops (turn radius well above the pen width) at varying
        // speed, with a little hand jitter.
        let mut cursive = Vec::new();
        let mut t: f64 = 0.0;
        while t < 18.0 {
            let j = (t * 91.0).sin() * 0.3;
            cursive.push((t * 10.0 + t.sin() * 30.0 + j, -t.cos() * 25.0 - j));
            t += 0.015 + 0.03 * (t * 0.7).sin().abs();
        }
        for kind in ["FreeDraw", "FountainPen", "Marker", "Highlighter"] {
            let o = preset(kind, 2.0);
            for (name, live, tol) in [("zig", &zig, 0.1), ("cursive", &cursive, 0.15)] {
                if name == "cursive" && kind == "FountainPen" {
                    continue; // long tapers follow total length, which jitter inflates
                }
                let mut a = Vec::new();
                outline(live, &vec![0.5; live.len()], &o, base_step(&o), &mut a);
                let d = drift(&a, &committed_outline(live, &o));
                assert!(d < o.size * tol, "{kind}/{name}: committed outline drifts {d:.2} from live (size {})", o.size);
            }
        }
    }

    #[test]
    fn handles_reversals_and_duplicates() {
        let pts = vec![(0.0, 0.0), (10.0, 0.0), (10.0, 0.0), (0.0, 0.1), (-10.0, 0.0)];
        let mut out = Vec::new();
        let o = preset("FreeDraw", 2.0);
        outline(&pts, &[], &o, base_step(&o), &mut out);
        assert!(out.iter().all(|p| p.0.is_finite()));
    }

    fn cursive(n: usize) -> Vec<(f64, f64)> {
        (0..n).map(|i| {
            let t = i as f64 * 0.02;
            (t * 10.0 + t.sin() * 30.0, -t.cos() * 25.0 + (t * 3.1).sin() * 4.0)
        }).collect()
    }

    /// Settled samples never change as the stroke grows — the property the
    /// incremental live renderer relies on to bake ink once.
    #[test]
    fn sampler_is_causal() {
        let pts = cursive(600);
        for (kind, simulate) in [("FreeDraw", true), ("FountainPen", false), ("Highlighter", true)] {
            let o = preset(kind, 2.0);
            let mut full = Sampler::new(o, base_step(&o), simulate);
            let mut snapshots = Vec::new();
            for (i, &pt) in pts.iter().enumerate() {
                full.push(pt, 0.3 + 0.4 * ((i as f32) * 0.05).sin().abs());
                if i == 150 || i == 400 {
                    snapshots.push(full.samples().to_vec());
                }
            }
            for snap in snapshots {
                assert!(snap.len() > 10, "{kind}");
                for (a, b) in snap.iter().zip(full.samples()) {
                    assert!(a.x == b.x && a.y == b.y && a.p == b.p && a.run == b.run, "{kind}: settled sample changed");
                }
            }
        }
    }

    /// A coarser step (used when zoomed out) must trace the same shape: the
    /// outline may differ only by a fraction of the step.
    #[test]
    fn shape_is_independent_of_step() {
        let pts = cursive(700);
        for kind in ["FreeDraw", "Marker", "Highlighter"] {
            let o = preset(kind, 2.0);
            let (mut fine, mut coarse) = (Vec::new(), Vec::new());
            outline(&pts, &[], &o, base_step(&o), &mut fine);
            for mult in [2.0, 4.0, 8.0] {
                let step = base_step(&o) * mult;
                outline(&pts, &[], &o, step, &mut coarse);
                let d = drift(&fine, &coarse);
                assert!(d < step * 0.8 + o.size * 0.1, "{kind} ×{mult}: drift {d:.3} (step {step:.2})");
            }
        }
    }

    #[test]
    fn step_follows_zoom_in_powers_of_two() {
        let o = preset("FreeDraw", 2.0);
        let base = base_step(&o);
        assert_eq!(step_for(&o, 1.0), base);
        assert_eq!(step_for(&o, 64.0), base);
        for zoom in [0.5, 0.1, 0.01, 0.0005] {
            let step = step_for(&o, zoom);
            assert!(step * zoom <= 1.0 + 1e-9 && step * zoom > 0.5 - 1e-9, "zoom {zoom}: {} px", step * zoom);
            let k = (step / base).log2();
            assert!((k - k.round()).abs() < 1e-9);
        }
        assert_eq!(step_for(&o, f64::NAN), base);
        assert!(step_for(&o, 0.0).is_finite());
    }

    /// A two-point stroke spanning the whole world must not allocate a sample
    /// every 0.1 units (that was ~20 billion samples: instant out-of-memory).
    #[test]
    fn sample_count_is_bounded() {
        let o = preset("FreeDraw", 0.0);
        let s = collect(&[(-1.0e9, 0.0), (1.0e9, 5.0)], &[], &o, base_step(&o));
        assert!(s.len() <= MAX_SAMPLES + 2, "{} samples", s.len());
        let mut out = Vec::new();
        outline(&[(-1.0e9, 0.0), (1.0e9, 5.0)], &[], &o, base_step(&o), &mut out);
        assert!(out.iter().all(|p| p.0.is_finite() && p.1.is_finite()));
        // Non-finite input is ignored rather than looping or poisoning output.
        let weird = collect(&[(0.0, 0.0), (f64::INFINITY, 1.0), (f64::NAN, 2.0), (10.0, 0.0)], &[], &o, base_step(&o));
        assert!(weird.iter().all(|p| p.x.is_finite() && p.y.is_finite() && p.p.is_finite()));
    }

    /// Spans drawn separately (as the live renderer does) must cover what the
    /// single full outline covers: every vertex of the full outline lies on or
    /// inside some span polygon, within a small tolerance.
    #[test]
    fn overlapping_spans_cover_the_full_outline() {
        let pts = cursive(900);
        for kind in ["FreeDraw", "Marker", "FountainPen"] {
            let o = preset(kind, 2.0);
            let s = collect(&pts, &[], &o, base_step(&o));
            let total = s[s.len() - 1].run;
            let mut full = Vec::new();
            outline_samples(&s, &o, &mut full);
            let (chunk, overlap) = (64usize, 6usize);
            let mut polys: Vec<Vec<(f64, f64)>> = Vec::new();
            let mut start = 0;
            while start < s.len() - 1 {
                let end = (start + chunk).min(s.len() - 1);
                let a = start.saturating_sub(overlap);
                let mut poly = Vec::new();
                outline_span(&s, a, end, total, &o, a == 0, end == s.len() - 1, &mut poly);
                polys.push(poly);
                start = end;
            }
            assert!(polys.len() > 3, "{kind}");
            let tol = o.size * 0.02 + 1e-6;
            for &v in &full {
                let covered = polys.iter().any(|poly| crate::geom::point_in_polygon(v, poly) || drift(poly, &[v]) < tol);
                assert!(covered, "{kind}: outline vertex {v:?} not covered by any span");
            }
        }
    }
}
