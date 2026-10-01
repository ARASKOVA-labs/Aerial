//! Hand-drawn ("sketchy") geometry, after the approach of rough.js that
//! Excalidraw uses: every edge is drawn twice as a slightly bowed cubic with
//! seeded random offsets; ellipses are jittered point rings closed with an
//! overshoot; fills are hachure / cross-hatch line sets. Seeded per element so
//! a shape looks identical on every repaint.

use crate::path::{catmull_rom, Seg};

/// mulberry32 — tiny, fast, deterministic.
#[derive(Clone)]
pub struct Rng(u32);

impl Rng {
    pub fn new(seed: u32) -> Rng {
        Rng(seed ^ 0x9e37_79b9)
    }
    pub fn next(&mut self) -> f64 {
        self.0 = self.0.wrapping_add(0x6d2b_79f5);
        let mut t = self.0;
        t = (t ^ (t >> 15)).wrapping_mul(t | 1);
        t ^= t.wrapping_add((t ^ (t >> 7)).wrapping_mul(t | 61));
        ((t ^ (t >> 14)) as f64) / 4_294_967_296.0
    }
    /// Uniform in [-x, x] scaled by roughness.
    fn off(&mut self, x: f64, rough: f64) -> f64 {
        rough * (self.next() * 2.0 * x - x)
    }
}

pub fn seed_for(id: u64, seed: u32) -> u32 {
    if seed != 0 { seed } else { (id.wrapping_mul(2_654_435_761) >> 7) as u32 | 1 }
}

/// One bowed, jittered pass from a to b.
fn line_pass(out: &mut Vec<Seg>, rng: &mut Rng, a: (f64, f64), b: (f64, f64), roughness: f64, overlay: bool) {
    let (x1, y1) = a;
    let (x2, y2) = b;
    let len_sq = (x2 - x1).powi(2) + (y2 - y1).powi(2);
    let len = len_sq.sqrt();
    let gain = if len < 200.0 { 1.0 } else if len > 500.0 { 0.4 } else { -0.001_666_8 * len + 1.233_334 };
    let r = roughness * gain;
    let mut offset = 2.0;
    if offset * offset * 100.0 > len_sq {
        offset = len / 10.0;
    }
    let half = offset / 2.0;
    let diverge = 0.2 + rng.next() * 0.2;
    let mdx = rng.off(2.0 * (y2 - y1) / 200.0, r);
    let mdy = rng.off(2.0 * (x1 - x2) / 200.0, r);
    let o = if overlay { half } else { offset };
    let sx = x1 + rng.off(o, r);
    let sy = y1 + rng.off(o, r);
    out.push(Seg::M(sx, sy));
    let c1x = mdx + x1 + (x2 - x1) * diverge + rng.off(o, r);
    let c1y = mdy + y1 + (y2 - y1) * diverge + rng.off(o, r);
    let c2x = mdx + x1 + 2.0 * (x2 - x1) * diverge + rng.off(o, r);
    let c2y = mdy + y1 + 2.0 * (y2 - y1) * diverge + rng.off(o, r);
    let ex = x2 + rng.off(o, r);
    let ey = y2 + rng.off(o, r);
    out.push(Seg::C(c1x, c1y, c2x, c2y, ex, ey));
}

/// A sketchy line: two passes, or one crisp segment when roughness is 0.
pub fn line(out: &mut Vec<Seg>, rng: &mut Rng, a: (f64, f64), b: (f64, f64), roughness: f64, double: bool) {
    if roughness <= 0.0 {
        out.push(Seg::M(a.0, a.1));
        out.push(Seg::L(b.0, b.1));
        return;
    }
    line_pass(out, rng, a, b, roughness, false);
    if double {
        line_pass(out, rng, a, b, roughness, true);
    }
}

/// Closed polygon with sketchy edges.
pub fn polygon(out: &mut Vec<Seg>, rng: &mut Rng, pts: &[(f64, f64)], roughness: f64, double: bool) {
    if roughness <= 0.0 {
        if let Some(&(x, y)) = pts.first() {
            out.push(Seg::M(x, y));
            for &(x, y) in &pts[1..] {
                out.push(Seg::L(x, y));
            }
            out.push(Seg::Z);
        }
        return;
    }
    for i in 0..pts.len() {
        line(out, rng, pts[i], pts[(i + 1) % pts.len()], roughness, double);
    }
}

/// One sketchy quadratic corner a → (control c) → b.
fn corner(out: &mut Vec<Seg>, rng: &mut Rng, a: (f64, f64), c: (f64, f64), b: (f64, f64), roughness: f64, double: bool) {
    if roughness <= 0.0 {
        out.push(Seg::M(a.0, a.1));
        out.push(Seg::Q(c.0, c.1, b.0, b.1));
        return;
    }
    let passes = if double { 2 } else { 1 };
    for pass in 0..passes {
        let k = roughness * if pass == 0 { 0.8 } else { 1.1 };
        out.push(Seg::M(a.0 + rng.off(1.0, k), a.1 + rng.off(1.0, k)));
        out.push(Seg::Q(c.0 + rng.off(1.5, k), c.1 + rng.off(1.5, k), b.0 + rng.off(1.0, k), b.1 + rng.off(1.0, k)));
    }
}

/// Rectangle / diamond with rounded corners: sketchy straight sides joined by
/// sketchy quadratic corners (per-point jitter on a dense outline looked spiky).
#[allow(clippy::too_many_arguments)]
pub fn round_box(out: &mut Vec<Seg>, rng: &mut Rng, kind: &str, x: f64, y: f64, w: f64, h: f64, roughness: f64, double: bool) {
    let corners = box_points(kind, x, y, w, h, false);
    let n = corners.len();
    let r = (w.min(h) * 0.25).min(32.0);
    let mut cut: Vec<((f64, f64), (f64, f64))> = Vec::with_capacity(n);
    for i in 0..n {
        let (prev, c, next) = (corners[(i + n - 1) % n], corners[i], corners[(i + 1) % n]);
        let toward = |t: (f64, f64)| {
            let (dx, dy) = (t.0 - c.0, t.1 - c.1);
            let l = dx.hypot(dy).max(1e-9);
            let rr = r.min(l / 2.0);
            (c.0 + dx / l * rr, c.1 + dy / l * rr)
        };
        cut.push((toward(prev), toward(next)));
    }
    for i in 0..n {
        let j = (i + 1) % n;
        line(out, rng, cut[i].1, cut[j].0, roughness, double);
        corner(out, rng, cut[j].0, corners[j], cut[j].1, roughness, double);
    }
}

/// Ellipse as a point ring (used for stroke, fill polygon and hit testing).
pub fn ellipse_points(cx: f64, cy: f64, rx: f64, ry: f64) -> Vec<(f64, f64)> {
    let perimeter = std::f64::consts::PI * (3.0 * (rx + ry) - ((3.0 * rx + ry) * (rx + 3.0 * ry)).max(0.0).sqrt());
    let n = ((perimeter / 12.0).ceil() as usize).clamp(12, 96);
    (0..n)
        .map(|i| {
            let a = i as f64 / n as f64 * std::f64::consts::TAU - std::f64::consts::FRAC_PI_2;
            (cx + rx * a.cos(), cy + ry * a.sin())
        })
        .collect()
}

/// Sketchy ellipse: radii perturbed slightly, ring jittered, overlapping close.
#[allow(clippy::too_many_arguments)]
pub fn ellipse(out: &mut Vec<Seg>, rng: &mut Rng, cx: f64, cy: f64, rx: f64, ry: f64, roughness: f64, double: bool) {
    if roughness <= 0.0 {
        let pts = ellipse_points(cx, cy, rx, ry);
        catmull_rom(&pts, true, out);
        return;
    }
    let passes = if double { 2 } else { 1 };
    let n = ellipse_points(cx, cy, rx, ry).len();
    let step = std::f64::consts::TAU / n as f64;
    for pass in 0..passes {
        let rx2 = rx + rng.off(rx * 0.05, roughness);
        let ry2 = ry + rng.off(ry * 0.05, roughness);
        let start = rng.off(0.5, roughness) - std::f64::consts::FRAC_PI_2;
        let wobble = if pass == 0 { 1.0 } else { 1.5 };
        // Overshoot past the start like a pen closing a loop.
        let overlap = 0.25 + rng.next() * 0.35;
        let steps = n + (overlap / step).ceil() as usize + 1;
        let ring: Vec<(f64, f64)> = (0..steps)
            .map(|i| {
                let a = start + i as f64 * step;
                let shrink = if i == 0 { 0.92 } else { 1.0 };
                (
                    cx + rx2 * shrink * a.cos() + rng.off(wobble, roughness),
                    cy + ry2 * shrink * a.sin() + rng.off(wobble, roughness),
                )
            })
            .collect();
        catmull_rom(&ring, false, out);
    }
}

/// Points of a rectangle / diamond outline, optionally with rounded corners.
pub fn box_points(kind: &str, x: f64, y: f64, w: f64, h: f64, round: bool) -> Vec<(f64, f64)> {
    let corners: Vec<(f64, f64)> = if kind == "Diamond" {
        vec![(x + w / 2.0, y), (x + w, y + h / 2.0), (x + w / 2.0, y + h), (x, y + h / 2.0)]
    } else {
        vec![(x, y), (x + w, y), (x + w, y + h), (x, y + h)]
    };
    if !round {
        return corners;
    }
    // Excalidraw-like adaptive radius: 25% of the short side, capped.
    let r = (w.min(h) * 0.25).min(32.0);
    let n = corners.len();
    let mut out = Vec::with_capacity(n * 6);
    for i in 0..n {
        let prev = corners[(i + n - 1) % n];
        let c = corners[i];
        let next = corners[(i + 1) % n];
        let unit = |a: (f64, f64), b: (f64, f64)| {
            let (dx, dy) = (b.0 - a.0, b.1 - a.1);
            let l = (dx * dx + dy * dy).sqrt().max(1e-9);
            (dx / l, dy / l, l)
        };
        let (ux, uy, l1) = unit(c, prev);
        let (vx, vy, l2) = unit(c, next);
        let rr = r.min(l1 / 2.0).min(l2 / 2.0);
        let a = (c.0 + ux * rr, c.1 + uy * rr);
        let b = (c.0 + vx * rr, c.1 + vy * rr);
        // Quadratic corner a → c → b, sampled.
        for k in 0..=4 {
            let t = k as f64 / 4.0;
            let mt = 1.0 - t;
            out.push((mt * mt * a.0 + 2.0 * mt * t * c.0 + t * t * b.0, mt * mt * a.1 + 2.0 * mt * t * c.1 + t * t * b.1));
        }
    }
    out
}

/// Hachure lines filling `poly`: parallel segments `gap` apart at `angle_deg`.
pub fn hachure(poly: &[(f64, f64)], gap: f64, angle_deg: f64) -> Vec<((f64, f64), (f64, f64))> {
    let mut lines = Vec::new();
    if poly.len() < 3 || gap.is_nan() || gap <= 0.0 {
        return lines;
    }
    let (sin, cos) = angle_deg.to_radians().sin_cos();
    let (cx, cy) = poly.iter().fold((0.0, 0.0), |a, p| (a.0 + p.0, a.1 + p.1));
    let (cx, cy) = (cx / poly.len() as f64, cy / poly.len() as f64);
    // Rotate so hachure lines become horizontal, scan, rotate back.
    let rot = |p: (f64, f64), s: f64| {
        let (dx, dy) = (p.0 - cx, p.1 - cy);
        (cx + dx * cos - dy * s, cy + dx * s + dy * cos)
    };
    let pts: Vec<(f64, f64)> = poly.iter().map(|&p| rot(p, -sin)).collect();
    let (ymin, ymax) = pts.iter().fold((f64::MAX, f64::MIN), |a, p| (a.0.min(p.1), a.1.max(p.1)));
    let max_lines = 4000.0;
    let gap = gap.max((ymax - ymin) / max_lines);
    let mut y = ymin + gap / 2.0;
    let mut xs: Vec<f64> = Vec::new();
    while y < ymax {
        xs.clear();
        for i in 0..pts.len() {
            let (a, b) = (pts[i], pts[(i + 1) % pts.len()]);
            if (a.1 <= y && b.1 > y) || (b.1 <= y && a.1 > y) {
                xs.push(a.0 + (y - a.1) / (b.1 - a.1) * (b.0 - a.0));
            }
        }
        xs.sort_by(|a, b| a.total_cmp(b));
        for pair in xs.chunks_exact(2) {
            lines.push((rot((pair[0], y), sin), rot((pair[1], y), sin)));
        }
        y += gap;
    }
    lines
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::path::is_finite;

    #[test]
    fn deterministic_per_seed() {
        let mut a = Vec::new();
        let mut b = Vec::new();
        line(&mut a, &mut Rng::new(7), (0.0, 0.0), (100.0, 40.0), 1.0, true);
        line(&mut b, &mut Rng::new(7), (0.0, 0.0), (100.0, 40.0), 1.0, true);
        assert_eq!(a, b);
        let mut c = Vec::new();
        line(&mut c, &mut Rng::new(8), (0.0, 0.0), (100.0, 40.0), 1.0, true);
        assert_ne!(a, c);
    }

    #[test]
    fn architect_is_crisp() {
        let mut out = Vec::new();
        line(&mut out, &mut Rng::new(1), (0.0, 0.0), (10.0, 0.0), 0.0, true);
        assert_eq!(out, vec![Seg::M(0.0, 0.0), Seg::L(10.0, 0.0)]);
    }

    #[test]
    fn shapes_are_finite() {
        let mut out = Vec::new();
        let mut rng = Rng::new(3);
        for rough in [0.0, 1.0, 2.0] {
            ellipse(&mut out, &mut rng, 50.0, 50.0, 40.0, 0.5, rough, true);
            polygon(&mut out, &mut rng, &box_points("Diamond", 0.0, 0.0, 80.0, 60.0, false), rough, true);
            round_box(&mut out, &mut rng, "Rectangle", 0.0, 0.0, 80.0, 60.0, rough, true);
        }
        assert!(is_finite(&out));
    }

    #[test]
    fn hachure_covers_the_shape() {
        let square = box_points("Rectangle", 0.0, 0.0, 100.0, 100.0, false);
        let lines = hachure(&square, 10.0, -41.0);
        assert!(lines.len() >= 12 && lines.len() <= 20, "{}", lines.len());
        for (a, b) in &lines {
            for p in [a, b] {
                assert!(p.0 >= -0.5 && p.0 <= 100.5 && p.1 >= -0.5 && p.1 <= 100.5, "{p:?}");
            }
        }
        // Degenerate / huge inputs are bounded.
        assert!(hachure(&square, 0.0, 0.0).is_empty());
        assert!(hachure(&box_points("Rectangle", 0.0, 0.0, 1e7, 1e7, false), 0.001, 10.0).len() <= 4001);
    }
}
