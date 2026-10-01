//! Backend-neutral path commands. Geometry generators (freehand outlines,
//! hand-drawn shapes, hachure fills) emit `Seg`s so they stay pure Rust and
//! unit-testable; the renderer replays them onto a canvas `Path2d`.

use web_sys::Path2d;

#[derive(Clone, Copy, Debug, PartialEq)]
pub enum Seg {
    M(f64, f64),
    L(f64, f64),
    Q(f64, f64, f64, f64),
    C(f64, f64, f64, f64, f64, f64),
    Z,
}

#[cfg(test)]
pub fn is_finite(segs: &[Seg]) -> bool {
    segs.iter().all(|s| match *s {
        Seg::M(a, b) | Seg::L(a, b) => a.is_finite() && b.is_finite(),
        Seg::Q(a, b, c, d) => [a, b, c, d].iter().all(|v| v.is_finite()),
        Seg::C(a, b, c, d, e, f) => [a, b, c, d, e, f].iter().all(|v| v.is_finite()),
        Seg::Z => true,
    })
}

pub fn emit(path: &Path2d, segs: &[Seg]) {
    for s in segs {
        match *s {
            Seg::M(x, y) => path.move_to(x, y),
            Seg::L(x, y) => path.line_to(x, y),
            Seg::Q(cx, cy, x, y) => path.quadratic_curve_to(cx, cy, x, y),
            Seg::C(a, b, c, d, x, y) => path.bezier_curve_to(a, b, c, d, x, y),
            Seg::Z => path.close_path(),
        }
    }
}

/// Builds a Path2d from segments (None if the browser refuses to allocate).
pub fn to_path(segs: &[Seg]) -> Option<Path2d> {
    let p = Path2d::new().ok()?;
    emit(&p, segs);
    Some(p)
}

/// Smooth closed curve through polygon points using quadratic segments
/// anchored on edge midpoints — the standard way to render a freehand outline.
pub fn smooth_closed(points: &[(f64, f64)], out: &mut Vec<Seg>) {
    let n = points.len();
    if n < 3 {
        if let Some(&(x, y)) = points.first() {
            out.push(Seg::M(x, y));
            for &(x, y) in &points[1..] {
                out.push(Seg::L(x, y));
            }
            out.push(Seg::Z);
        }
        return;
    }
    let mid = |a: (f64, f64), b: (f64, f64)| ((a.0 + b.0) * 0.5, (a.1 + b.1) * 0.5);
    let start = mid(points[0], points[1]);
    out.push(Seg::M(start.0, start.1));
    for i in 1..=n {
        let p = points[i % n];
        let q = points[(i + 1) % n];
        let m = mid(p, q);
        out.push(Seg::Q(p.0, p.1, m.0, m.1));
    }
    out.push(Seg::Z);
}

/// Catmull-Rom spline through points as cubic béziers (open or closed).
pub fn catmull_rom(points: &[(f64, f64)], closed: bool, out: &mut Vec<Seg>) {
    let n = points.len();
    if n < 2 {
        return;
    }
    let at = |i: isize| -> (f64, f64) {
        if closed {
            points[i.rem_euclid(n as isize) as usize]
        } else {
            points[i.clamp(0, n as isize - 1) as usize]
        }
    };
    out.push(Seg::M(points[0].0, points[0].1));
    let segs = if closed { n } else { n - 1 };
    for i in 0..segs as isize {
        let (p0, p1, p2, p3) = (at(i - 1), at(i), at(i + 1), at(i + 2));
        let c1 = (p1.0 + (p2.0 - p0.0) / 6.0, p1.1 + (p2.1 - p0.1) / 6.0);
        let c2 = (p2.0 - (p3.0 - p1.0) / 6.0, p2.1 - (p3.1 - p1.1) / 6.0);
        out.push(Seg::C(c1.0, c1.1, c2.0, c2.1, p2.0, p2.1));
    }
    if closed {
        out.push(Seg::Z);
    }
}
