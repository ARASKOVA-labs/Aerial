//! Geometry primitives shared by the scene store, spatial index and renderer.
//! Pure Rust — no web-sys — so everything here is unit-testable natively.

use std::hash::{BuildHasherDefault, Hasher};

/// Coordinates outside ±WORLD_LIMIT are rejected on ingest. Keeps cell math in
/// range and stops crafted scenes from producing pathological index loops.
pub const WORLD_LIMIT: f64 = 1.0e9;

#[derive(Clone, Copy, Debug, PartialEq)]
pub struct Rect {
    pub min_x: f64,
    pub min_y: f64,
    pub max_x: f64,
    pub max_y: f64,
}

impl Rect {
    pub fn new(min_x: f64, min_y: f64, max_x: f64, max_y: f64) -> Self {
        Rect { min_x, min_y, max_x, max_y }
    }

    pub fn from_xywh(x: f64, y: f64, w: f64, h: f64) -> Self {
        Rect::new(x.min(x + w), y.min(y + h), x.max(x + w), y.max(y + h))
    }

    pub fn is_finite(&self) -> bool {
        self.min_x.is_finite() && self.min_y.is_finite() && self.max_x.is_finite() && self.max_y.is_finite()
    }

    pub fn within_world(&self) -> bool {
        self.is_finite()
            && self.min_x >= -WORLD_LIMIT
            && self.min_y >= -WORLD_LIMIT
            && self.max_x <= WORLD_LIMIT
            && self.max_y <= WORLD_LIMIT
    }

    pub fn width(&self) -> f64 {
        self.max_x - self.min_x
    }

    pub fn height(&self) -> f64 {
        self.max_y - self.min_y
    }

    pub fn area(&self) -> f64 {
        self.width().max(0.0) * self.height().max(0.0)
    }

    pub fn intersects(&self, o: &Rect) -> bool {
        self.min_x <= o.max_x && self.max_x >= o.min_x && self.min_y <= o.max_y && self.max_y >= o.min_y
    }

    pub fn contains_point(&self, x: f64, y: f64) -> bool {
        x >= self.min_x && x <= self.max_x && y >= self.min_y && y <= self.max_y
    }

    pub fn union(&self, o: &Rect) -> Rect {
        Rect::new(
            self.min_x.min(o.min_x),
            self.min_y.min(o.min_y),
            self.max_x.max(o.max_x),
            self.max_y.max(o.max_y),
        )
    }

    pub fn expand(&self, d: f64) -> Rect {
        Rect::new(self.min_x - d, self.min_y - d, self.max_x + d, self.max_y + d)
    }

    pub fn center(&self) -> (f64, f64) {
        ((self.min_x + self.max_x) * 0.5, (self.min_y + self.max_y) * 0.5)
    }
}

/// Bounding box of a point list, or None when empty / non-finite.
pub fn bounds_of(points: &[(f64, f64)]) -> Option<Rect> {
    let first = points.first()?;
    let mut r = Rect::new(first.0, first.1, first.0, first.1);
    for p in &points[1..] {
        r.min_x = r.min_x.min(p.0);
        r.min_y = r.min_y.min(p.1);
        r.max_x = r.max_x.max(p.0);
        r.max_y = r.max_y.max(p.1);
    }
    if r.is_finite() { Some(r) } else { None }
}

fn perp_dist_sq(p: (f64, f64), a: (f64, f64), b: (f64, f64)) -> f64 {
    let (dx, dy) = (b.0 - a.0, b.1 - a.1);
    let len_sq = dx * dx + dy * dy;
    if len_sq <= f64::EPSILON {
        let (ex, ey) = (p.0 - a.0, p.1 - a.1);
        return ex * ex + ey * ey;
    }
    let t = (((p.0 - a.0) * dx + (p.1 - a.1) * dy) / len_sq).clamp(0.0, 1.0);
    let (cx, cy) = (a.0 + t * dx, a.1 + t * dy);
    let (ex, ey) = (p.0 - cx, p.1 - cy);
    ex * ex + ey * ey
}

/// Ramer–Douglas–Peucker polyline simplification (iterative, no recursion so
/// adversarially long strokes cannot blow the WASM stack).
pub fn simplify_rdp(points: &[(f64, f64)], tolerance: f64) -> Vec<(f64, f64)> {
    let n = points.len();
    if n < 3 || tolerance <= 0.0 {
        return points.to_vec();
    }
    let tol_sq = tolerance * tolerance;
    let mut keep = vec![false; n];
    keep[0] = true;
    keep[n - 1] = true;
    let mut stack = vec![(0usize, n - 1)];
    while let Some((start, end)) = stack.pop() {
        if end <= start + 1 {
            continue;
        }
        let (mut max_d, mut idx) = (0.0, start);
        for i in (start + 1)..end {
            let d = perp_dist_sq(points[i], points[start], points[end]);
            if d > max_d {
                max_d = d;
                idx = i;
            }
        }
        if max_d > tol_sq {
            keep[idx] = true;
            stack.push((start, idx));
            stack.push((idx, end));
        }
    }
    points.iter().zip(keep).filter(|(_, k)| *k).map(|(p, _)| *p).collect()
}

/// Screen-space decimation used at render time: drops points closer than
/// `min_dist` to the previously emitted point. Always keeps the last point.
pub fn decimate_into(points: &[(f64, f64)], min_dist: f64, out: &mut Vec<(f64, f64)>) {
    out.clear();
    let Some(&first) = points.first() else { return };
    out.push(first);
    let min_sq = min_dist * min_dist;
    let mut last = first;
    for &p in &points[1..] {
        let (dx, dy) = (p.0 - last.0, p.1 - last.1);
        if dx * dx + dy * dy >= min_sq {
            out.push(p);
            last = p;
        }
    }
    if let (Some(&tail), Some(&emitted)) = (points.last(), out.last()) {
        if tail != emitted {
            out.push(tail);
        }
    }
}

/// Parses `#rgb` / `#rrggbb` (with optional alpha suffix). Unknown → None.
pub fn parse_hex_rgb(color: &str) -> Option<(u8, u8, u8)> {
    let hex = color.strip_prefix('#')?;
    let digit = |c: u8| (c as char).to_digit(16).map(|d| d as u8);
    let b = hex.as_bytes();
    match b.len() {
        3 | 4 => Some((digit(b[0])? * 17, digit(b[1])? * 17, digit(b[2])? * 17)),
        6 | 8 => Some((
            digit(b[0])? * 16 + digit(b[1])?,
            digit(b[2])? * 16 + digit(b[3])?,
            digit(b[4])? * 16 + digit(b[5])?,
        )),
        _ => None,
    }
}

// ── Fast non-cryptographic hasher (FxHash) ────────────────────────────────────
// Keys are engine-generated ints, never attacker-chosen strings, so HashDoS
// resistance is not needed and SipHash would only cost frame time.

#[derive(Default, Clone, Copy)]
pub struct FxHasher {
    hash: u64,
}

const FX_SEED: u64 = 0x51_7c_c1_b7_27_22_0a_95;

impl Hasher for FxHasher {
    fn write(&mut self, bytes: &[u8]) {
        for &b in bytes {
            self.write_u64(b as u64);
        }
    }
    fn write_u8(&mut self, i: u8) {
        self.write_u64(i as u64);
    }
    fn write_u32(&mut self, i: u32) {
        self.write_u64(i as u64);
    }
    fn write_i64(&mut self, i: i64) {
        self.write_u64(i as u64);
    }
    fn write_usize(&mut self, i: usize) {
        self.write_u64(i as u64);
    }
    fn write_u64(&mut self, i: u64) {
        self.hash = (self.hash.rotate_left(5) ^ i).wrapping_mul(FX_SEED);
    }
    fn finish(&self) -> u64 {
        // murmur3 fmix64 avalanche. Without it, sequential ids and small cell
        // coordinates cluster in hashbrown's probe groups on wasm32 (32-bit
        // usize), which made bulk loads superlinear.
        let mut h = self.hash;
        h ^= h >> 33;
        h = h.wrapping_mul(0xff51_afd7_ed55_8ccd);
        h ^= h >> 33;
        h = h.wrapping_mul(0xc4ce_b9fe_1a85_ec53);
        h ^ (h >> 33)
    }
}

pub type FxBuild = BuildHasherDefault<FxHasher>;
pub type FxHashMap<K, V> = std::collections::HashMap<K, V, FxBuild>;
pub type FxHashSet<K> = std::collections::HashSet<K, FxBuild>;

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn rdp_keeps_endpoints_and_corners() {
        let pts = vec![(0.0, 0.0), (1.0, 0.01), (2.0, 0.0), (2.0, 5.0)];
        let s = simplify_rdp(&pts, 0.1);
        assert_eq!(s, vec![(0.0, 0.0), (2.0, 0.0), (2.0, 5.0)]);
    }

    #[test]
    fn rdp_handles_long_input_without_recursion() {
        let pts: Vec<(f64, f64)> = (0..200_000).map(|i| (i as f64, ((i % 7) as f64) * 0.001)).collect();
        let s = simplify_rdp(&pts, 0.5);
        assert_eq!(s.len(), 2);
    }

    #[test]
    fn decimate_keeps_tail() {
        let mut out = Vec::new();
        decimate_into(&[(0.0, 0.0), (0.1, 0.0), (0.2, 0.0), (5.0, 0.0), (5.1, 0.0)], 1.0, &mut out);
        assert_eq!(out, vec![(0.0, 0.0), (5.0, 0.0), (5.1, 0.0)]);
    }

    #[test]
    fn hex_parse() {
        assert_eq!(parse_hex_rgb("#e73f07"), Some((0xe7, 0x3f, 0x07)));
        assert_eq!(parse_hex_rgb("#fff"), Some((255, 255, 255)));
        assert_eq!(parse_hex_rgb("transparent"), None);
        assert_eq!(parse_hex_rgb("#zzzzzz"), None);
    }

    #[test]
    fn world_limits() {
        assert!(Rect::new(0.0, 0.0, 1.0, 1.0).within_world());
        assert!(!Rect::new(0.0, 0.0, f64::INFINITY, 1.0).within_world());
        assert!(!Rect::new(0.0, 0.0, 2.0e9, 1.0).within_world());
    }
}
