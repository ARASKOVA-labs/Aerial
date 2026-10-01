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

struct Sample {
    x: f64,
    y: f64,
    p: f64,
    run: f64,
}

fn ease_out_quad(t: f64) -> f64 {
    let t = t.clamp(0.0, 1.0);
    t * (2.0 - t)
}

fn ease_out_cubic(t: f64) -> f64 {
    let t = t.clamp(0.0, 1.0) - 1.0;
    t * t * t + 1.0
}

/// Speed → pressure: slow strokes are heavier, fast strokes lighter.
/// Floored so a quick flick thins to ~40% instead of a hairline.
fn simulate_step(prev_p: f64, d: f64, o: &Opts) -> f64 {
    let speed = (d / (o.size.max(0.5) * 1.6)).min(1.0);
    let target = 1.0 - speed * 0.7;
    prev_p + (target - prev_p) * (speed * 0.275).max(0.02)
}

/// The pressure the renderer simulates at every input point of a stroke
/// drawn without a pressure-sensitive device. Baked into the element before
/// the point list is simplified, so the committed stroke keeps exactly the
/// weight it had while being drawn (simulation depends on point spacing).
pub fn simulated_pressures(points: &[(f64, f64)], o: &Opts) -> Vec<f32> {
    let t = 0.15 + (1.0 - o.streamline.clamp(0.0, 1.0)) * 0.85;
    let min_step = (o.size * 0.08).max(0.05);
    let mut out = Vec::with_capacity(points.len());
    let Some(&(mut sx, mut sy)) = points.first() else { return out };
    let mut p = 0.5;
    for (i, &(x, y)) in points.iter().enumerate() {
        let last = i + 1 == points.len();
        let (nx, ny) = if i == 0 || last { (x, y) } else { (sx + (x - sx) * t, sy + (y - sy) * t) };
        let d = ((nx - sx).powi(2) + (ny - sy).powi(2)).sqrt();
        if i == 0 || (d < min_step && !last) {
            out.push(p as f32);
            continue;
        }
        p = simulate_step(p, d, o);
        out.push(p as f32);
        sx = nx;
        sy = ny;
    }
    out
}

/// Streamlined, pressure-annotated centre line.
fn samples(points: &[(f64, f64)], pressures: &[f32], o: &Opts) -> Vec<Sample> {
    let real = pressures.len() == points.len()
        && pressures.iter().any(|&p| (p - pressures[0]).abs() > 0.01)
        && pressures.iter().all(|p| p.is_finite());
    let t = 0.15 + (1.0 - o.streamline.clamp(0.0, 1.0)) * 0.85;
    let mut out: Vec<Sample> = Vec::with_capacity(points.len());
    let (mut sx, mut sy) = points[0];
    let mut prev_p = if real { pressures[0] as f64 } else { 0.5 };
    let mut run = 0.0;
    let min_step = (o.size * 0.08).max(0.05);
    for (i, &(x, y)) in points.iter().enumerate() {
        let last = i + 1 == points.len();
        let (nx, ny) = if i == 0 || last { (x, y) } else { (sx + (x - sx) * t, sy + (y - sy) * t) };
        let d = ((nx - sx).powi(2) + (ny - sy).powi(2)).sqrt();
        if i > 0 && d < min_step && !last {
            continue;
        }
        let p = if real {
            let raw = (pressures[i] as f64).clamp(0.0, 1.0);
            prev_p + (raw - prev_p) * 0.5
        } else {
            simulate_step(prev_p, d, o)
        };
        run += d;
        out.push(Sample { x: nx, y: ny, p, run });
        sx = nx;
        sy = ny;
        prev_p = p;
    }
    out
}

/// Computes the outline polygon of a stroke into `out` (cleared first).
pub fn outline(points: &[(f64, f64)], pressures: &[f32], o: &Opts, out: &mut Vec<(f64, f64)>) {
    out.clear();
    if points.is_empty() || o.size.is_nan() || o.size <= 0.0 {
        return;
    }
    let s = samples(points, pressures, o);
    let total = s.last().map(|p| p.run).unwrap_or(0.0);
    let radius_at = |smp: &Sample| -> f64 {
        let mut r = if o.thinning > 0.0 { o.size * (0.5 - o.thinning * (0.5 - smp.p)) } else { o.size * 0.5 };
        if o.taper_start > 0.0 && smp.run < o.taper_start {
            r *= ease_out_quad(smp.run / o.taper_start);
        }
        if o.taper_end > 0.0 && total - smp.run < o.taper_end {
            r *= ease_out_cubic((total - smp.run) / o.taper_end);
        }
        r.max(0.01 * o.size).max(0.05)
    };

    // A dot: a circle.
    if s.len() == 1 || total < o.size * 0.25 {
        let (cx, cy) = (s[0].x, s[0].y);
        let r = (o.size * 0.5 * (0.6 + 0.4 * s[0].p)).max(0.3);
        for k in 0..16 {
            let a = k as f64 / 16.0 * std::f64::consts::TAU;
            out.push((cx + r * a.cos(), cy + r * a.sin()));
        }
        return;
    }

    let n = s.len();
    let dir = |i: usize| -> (f64, f64) {
        let (a, b) = if i == 0 { (0, 1) } else { (i - 1, i) };
        let (dx, dy) = (s[b].x - s[a].x, s[b].y - s[a].y);
        let len = (dx * dx + dy * dy).sqrt();
        if len > 1e-9 { (dx / len, dy / len) } else { (1.0, 0.0) }
    };
    let min_gap = (o.size * o.smoothing).powi(2) * 0.25;
    let mut left: Vec<(f64, f64)> = Vec::with_capacity(n);
    let mut right: Vec<(f64, f64)> = Vec::with_capacity(n);
    let push_far = |v: &mut Vec<(f64, f64)>, p: (f64, f64), force: bool| {
        if force || v.last().is_none_or(|q| (q.0 - p.0).powi(2) + (q.1 - p.1).powi(2) > min_gap) {
            v.push(p);
        }
    };

    #[allow(clippy::needless_range_loop)] // neighbours of i are needed
    for i in 0..n {
        let r = radius_at(&s[i]);
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
                let a = a0 + std::f64::consts::FRAC_PI_2 - t;
                push_far(&mut left, (px + r * a.cos(), py + r * a.sin()), true);
                let b = a0 - std::f64::consts::FRAC_PI_2 - t;
                push_far(&mut right, (px + r * b.cos(), py + r * b.sin()), true);
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
        let last = i + 1 == n;
        push_far(&mut left, (px + nx * r, py + ny * r), i == 0 || last);
        push_far(&mut right, (px - nx * r, py - ny * r), i == 0 || last);
    }

    // Caps: round unless the end is tapered to a point.
    let cap = |out: &mut Vec<(f64, f64)>, c: &Sample, d: (f64, f64), from_left: bool, r: f64| {
        let base = d.1.atan2(d.0);
        for k in 1..8 {
            let t = std::f64::consts::PI * k as f64 / 8.0;
            let a = if from_left { base + std::f64::consts::FRAC_PI_2 - t } else { base - std::f64::consts::FRAC_PI_2 + t };
            out.push((c.x + r * a.cos(), c.y + r * a.sin()));
        }
    };

    out.extend(left.iter().copied());
    if o.taper_end <= 0.0 {
        cap(out, &s[n - 1], dir(n - 1), true, radius_at(&s[n - 1]));
    }
    out.extend(right.iter().rev().copied());
    if o.taper_start <= 0.0 {
        let d = dir(1);
        cap(out, &s[0], (-d.0, -d.1), true, radius_at(&s[0]));
    }
}

/// Outline as smooth path segments.
pub fn outline_segs(points: &[(f64, f64)], pressures: &[f32], o: &Opts, scratch: &mut Vec<(f64, f64)>, out: &mut Vec<Seg>) {
    out.clear();
    outline(points, pressures, o, scratch);
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
            outline(&line(80), &[], &preset(kind, 2.5), &mut out);
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
            outline(&pts, pr, &o, &mut out);
            let (lo, hi) = out.iter().fold((f64::MAX, f64::MIN), |(a, b), p| (a.min(p.1), b.max(p.1)));
            hi - lo
        };
        assert!(span(&heavy) > span(&light) + 1.0);
    }

    #[test]
    fn marker_is_uniform_and_dots_are_round() {
        let mut out = Vec::new();
        outline(&[(5.0, 5.0)], &[], &preset("Marker", 3.0), &mut out);
        assert_eq!(out.len(), 16);
        let r0 = ((out[0].0 - 5.0).powi(2) + (out[0].1 - 5.0).powi(2)).sqrt();
        let r8 = ((out[8].0 - 5.0).powi(2) + (out[8].1 - 5.0).powi(2)).sqrt();
        assert!((r0 - r8).abs() < 1e-9);
    }

    #[test]
    fn handles_reversals_and_duplicates() {
        let pts = vec![(0.0, 0.0), (10.0, 0.0), (10.0, 0.0), (0.0, 0.1), (-10.0, 0.0)];
        let mut out = Vec::new();
        outline(&pts, &[], &preset("FreeDraw", 2.0), &mut out);
        assert!(out.iter().all(|p| p.0.is_finite()));
    }
}
