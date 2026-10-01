//! Scene element model plus the validation applied to every element that
//! enters the scene — whether drawn locally, loaded from disk, or received
//! from a peer. Untrusted input never reaches the index or renderer unchecked.

use serde::{Deserialize, Serialize};

use crate::geom::{bounds_of, parse_hex_rgb, Rect};

pub const MAX_POINTS: usize = 200_000;
pub const MAX_TEXT_BYTES: usize = 1 << 20;
pub const MAX_SVG_BYTES: usize = 16 << 20;
pub const MAX_STROKE_WIDTH: f64 = 500.0;
pub const MAX_COLOR_LEN: usize = 64;

pub const KINDS: &[&str] = &[
    "FreeDraw", "FountainPen", "Marker", "Highlighter", "Rectangle", "Diamond", "Ellipse", "Line", "Arrow",
    "Text", "Image", "Diagram", "MagicPen", "LaserPen",
];

pub const FILL_STYLES: &[&str] = &["solid", "hachure", "cross-hatch"];
pub const STROKE_STYLES: &[&str] = &["solid", "dashed", "dotted"];
pub const ROUNDNESS: &[&str] = &["sharp", "round"];

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(default)]
pub struct Element {
    pub id: u64,
    /// Paint order. Older scenes omit it; `Scene::load` derives it from array order.
    pub z: u64,
    pub kind: String,
    pub points: Vec<(f64, f64)>,
    pub x: f64,
    pub y: f64,
    pub w: f64,
    pub h: f64,
    pub stroke_color: String,
    pub fill_color: String,
    pub stroke_width: f64,
    pub text: String,
    pub font_size: f64,
    pub font_family: String,
    pub asset_id: Option<String>,
    pub code: Option<String>,
    pub svg: Option<String>,
    pub hit_map_json: Option<String>,
    pub is_rough: bool,
    pub is_curved: bool,
    /// Per-point pen pressure (0..1). Empty when the device had none.
    pub pressures: Vec<f32>,
    /// Sloppiness: 0 architect (crisp), 1 artist, 2 cartoonist. Legacy
    /// elements default to 0 so they keep their original look.
    pub roughness: f64,
    pub fill_style: String,
    pub stroke_style: String,
    pub roundness: String,
    /// 0..100.
    pub opacity: f64,
    /// Seed for hand-drawn jitter; 0 derives one from the id.
    pub seed: u32,
}

impl Default for Element {
    fn default() -> Self {
        Element {
            id: 0,
            z: 0,
            kind: "FreeDraw".to_string(),
            points: Vec::new(),
            x: 0.0,
            y: 0.0,
            w: 1.0,
            h: 1.0,
            stroke_color: "#000000".to_string(),
            fill_color: "transparent".to_string(),
            stroke_width: 2.5,
            text: String::new(),
            font_size: 14.0,
            font_family: "sans-serif".to_string(),
            asset_id: None,
            code: None,
            svg: None,
            hit_map_json: None,
            is_rough: false,
            is_curved: true,
            pressures: Vec::new(),
            roughness: 0.0,
            fill_style: "solid".to_string(),
            stroke_style: "solid".to_string(),
            roundness: "sharp".to_string(),
            opacity: 100.0,
            seed: 0,
        }
    }
}

impl Element {
    pub fn is_freehand(&self) -> bool {
        matches!(self.kind.as_str(), "FreeDraw" | "FountainPen" | "Marker" | "Highlighter" | "MagicPen" | "LaserPen")
    }

    pub fn is_shape(&self) -> bool {
        matches!(self.kind.as_str(), "Rectangle" | "Diamond" | "Ellipse")
    }

    pub fn is_linear(&self) -> bool {
        matches!(self.kind.as_str(), "Line" | "Arrow")
    }

    pub fn has_fill(&self) -> bool {
        !crate::style::is_transparent(&self.fill_color)
    }

    pub fn is_boxed(&self) -> bool {
        matches!(self.kind.as_str(), "Text" | "Image" | "Diagram")
    }

    /// Geometric bounds (no stroke thickness).
    pub fn geom_bounds(&self) -> Rect {
        Rect::from_xywh(self.x, self.y, self.w, self.h)
    }

    /// How far paint can extend beyond the geometric bounds.
    pub fn visual_pad(&self) -> f64 {
        let sw = self.stroke_width.clamp(0.0, MAX_STROKE_WIDTH);
        let sketch = self.roughness.clamp(0.0, 3.0) * 5.0;
        match self.kind.as_str() {
            "Highlighter" => sw * 3.2 + 1.0,
            "Arrow" => (sw * 5.0).max(14.0) + sw + sketch,
            "LaserPen" => sw * 1.0 + 16.0,
            "MagicPen" => sw * 0.5 + 9.0,
            "FountainPen" => sw * 2.7 + 1.0,
            "FreeDraw" => sw * 1.4 + 1.0,
            "Marker" => sw * 1.2 + 1.0,
            "Text" | "Image" | "Diagram" => 2.0,
            _ => sw * 0.5 + 1.0 + sketch,
        }
    }

    pub fn visual_bounds(&self) -> Rect {
        self.geom_bounds().expand(self.visual_pad())
    }

    /// Representative colour for the LOD density pyramid.
    pub fn lod_rgb(&self) -> (u8, u8, u8) {
        if matches!(self.kind.as_str(), "Image" | "Diagram") {
            return (128, 128, 128);
        }
        parse_hex_rgb(&self.stroke_color)
            .or_else(|| parse_hex_rgb(&self.fill_color))
            .unwrap_or((128, 128, 128))
    }

    /// Precise hit test in world units. Outlines are hit within `tol` of the
    /// stroke; filled shapes, text and images anywhere inside.
    pub fn hit(&self, x: f64, y: f64, tol: f64) -> bool {
        let b = self.geom_bounds();
        let half = self.stroke_width.max(0.0) * 0.5;
        if !b.expand(tol + self.visual_pad()).contains_point(x, y) {
            return false;
        }
        let near_poly = |pts: &[(f64, f64)], closed: bool, reach: f64| {
            let n = pts.len();
            if n == 1 {
                return (pts[0].0 - x).hypot(pts[0].1 - y) <= reach;
            }
            let segs = if closed { n } else { n - 1 };
            (0..segs).any(|i| crate::geom::dist_point_segment((x, y), pts[i], pts[(i + 1) % n]) <= reach)
        };
        match self.kind.as_str() {
            "Text" | "Image" | "Diagram" => b.expand(tol).contains_point(x, y),
            "Rectangle" | "Diamond" => {
                let pts = crate::rough::box_points(&self.kind, b.min_x, b.min_y, b.width(), b.height(), self.roundness == "round");
                (self.has_fill() && crate::geom::point_in_polygon((x, y), &pts)) || near_poly(&pts, true, tol + half)
            }
            "Ellipse" => {
                let (rx, ry) = (b.width() / 2.0, b.height() / 2.0);
                let (cx, cy) = b.center();
                let d = (((x - cx) / rx.max(1e-9)).powi(2) + ((y - cy) / ry.max(1e-9)).powi(2)).sqrt();
                if self.has_fill() && d <= 1.0 {
                    return true;
                }
                let pts = crate::rough::ellipse_points(cx, cy, rx, ry);
                near_poly(&pts, true, tol + half)
            }
            "Line" | "Arrow" => near_poly(&self.points, false, tol + half),
            _ => {
                let reach = tol + match self.kind.as_str() {
                    "FountainPen" => self.stroke_width * 1.6,
                    "Highlighter" => self.stroke_width * 3.0,
                    _ => self.stroke_width,
                };
                near_poly(&self.points, false, reach)
            }
        }
    }

    /// Recomputes x/y/w/h from points for point-defined kinds.
    pub fn refresh_bounds(&mut self) {
        if self.is_boxed() {
            return;
        }
        if let Some(b) = bounds_of(&self.points) {
            self.x = b.min_x;
            self.y = b.min_y;
            self.w = b.width().max(1.0);
            self.h = b.height().max(1.0);
        }
    }
}

fn truncate_utf8(s: &mut String, max: usize) {
    if s.len() > max {
        let mut cut = max;
        while cut > 0 && !s.is_char_boundary(cut) {
            cut -= 1;
        }
        s.truncate(cut);
    }
}

fn clean_color(c: &mut String, fallback: &str) {
    if c.len() > MAX_COLOR_LEN || c.chars().any(|ch| ch.is_control()) {
        *c = fallback.to_string();
    }
}

/// Validates and normalises an element. Returns None when it cannot be made
/// safe (unknown kind, non-finite geometry, out-of-world coordinates, oversized
/// payloads that cannot be truncated meaningfully).
pub fn sanitize(mut el: Element) -> Option<Element> {
    if !KINDS.contains(&el.kind.as_str()) {
        return None;
    }
    if el.points.len() > MAX_POINTS {
        el.points.truncate(MAX_POINTS);
    }
    if el.points.iter().any(|p| !p.0.is_finite() || !p.1.is_finite()) {
        return None;
    }
    if el.pressures.len() != el.points.len() || el.pressures.iter().any(|p| !p.is_finite()) {
        el.pressures.clear();
    }
    for p in el.pressures.iter_mut() {
        *p = p.clamp(0.0, 1.0);
    }
    el.roughness = if el.roughness.is_finite() { el.roughness.clamp(0.0, 3.0) } else { 0.0 };
    el.opacity = if el.opacity.is_finite() { el.opacity.clamp(0.0, 100.0) } else { 100.0 };
    if !FILL_STYLES.contains(&el.fill_style.as_str()) {
        el.fill_style = "solid".to_string();
    }
    if !STROKE_STYLES.contains(&el.stroke_style.as_str()) {
        el.stroke_style = "solid".to_string();
    }
    if !ROUNDNESS.contains(&el.roundness.as_str()) {
        el.roundness = "sharp".to_string();
    }
    if !el.stroke_width.is_finite() {
        el.stroke_width = 2.5;
    }
    el.stroke_width = el.stroke_width.clamp(0.0, MAX_STROKE_WIDTH);
    if !el.font_size.is_finite() {
        el.font_size = 14.0;
    }
    el.font_size = el.font_size.clamp(0.0, 2_000.0);
    truncate_utf8(&mut el.text, MAX_TEXT_BYTES);
    truncate_utf8(&mut el.font_family, 256);
    clean_color(&mut el.stroke_color, "#000000");
    clean_color(&mut el.fill_color, "transparent");
    if let Some(a) = &el.asset_id {
        if a.len() > 128 {
            return None;
        }
    }
    for payload in [&el.svg, &el.code, &el.hit_map_json].into_iter().flatten() {
        if payload.len() > MAX_SVG_BYTES {
            return None;
        }
    }

    if el.is_boxed() {
        if !(el.x.is_finite() && el.y.is_finite() && el.w.is_finite() && el.h.is_finite()) {
            return None;
        }
        el.w = el.w.abs().max(1.0);
        el.h = el.h.abs().max(1.0);
        if el.points.is_empty() {
            el.points.push((el.x, el.y));
        }
    } else {
        if el.points.is_empty() {
            return None;
        }
        el.refresh_bounds();
    }

    if !el.visual_bounds().within_world() {
        return None;
    }
    Some(el)
}

#[cfg(test)]
mod tests {
    use super::*;

    fn stroke(points: Vec<(f64, f64)>) -> Element {
        Element { kind: "FreeDraw".into(), points, ..Default::default() }
    }

    #[test]
    fn rejects_bad_input() {
        assert!(sanitize(stroke(vec![(0.0, f64::NAN)])).is_none());
        assert!(sanitize(stroke(vec![(0.0, 2.0e9)])).is_none());
        assert!(sanitize(stroke(vec![])).is_none());
        assert!(sanitize(Element { kind: "Script".into(), points: vec![(0.0, 0.0)], ..Default::default() }).is_none());
    }

    #[test]
    fn normalises_bounds_from_points() {
        let el = sanitize(Element { x: 999.0, ..stroke(vec![(0.0, 0.0), (10.0, 5.0)]) }).unwrap();
        assert_eq!((el.x, el.y, el.w, el.h), (0.0, 0.0, 10.0, 5.0));
    }

    #[test]
    fn clamps_and_truncates() {
        let mut el = stroke(vec![(0.0, 0.0)]);
        el.stroke_width = 1.0e9;
        el.stroke_color = "x".repeat(1000);
        el.text = "é".repeat(MAX_TEXT_BYTES);
        let el = sanitize(el).unwrap();
        assert_eq!(el.stroke_width, MAX_STROKE_WIDTH);
        assert_eq!(el.stroke_color, "#000000");
        assert!(el.text.len() <= MAX_TEXT_BYTES);
    }

    #[test]
    fn style_fields_are_validated_and_legacy_defaults_preserve_look() {
        let json = r#"{"id":1,"kind":"Rectangle","points":[[0,0],[10,10]]}"#;
        let el = sanitize(serde_json::from_str(json).unwrap()).unwrap();
        assert_eq!((el.roughness, el.opacity, el.fill_style.as_str()), (0.0, 100.0, "solid"));
        let mut bad = el.clone();
        bad.roughness = f64::NAN;
        bad.opacity = 500.0;
        bad.fill_style = "<script>".into();
        bad.pressures = vec![0.5];
        let bad = sanitize(bad).unwrap();
        assert_eq!((bad.roughness, bad.opacity, bad.fill_style.as_str()), (0.0, 100.0, "solid"));
        assert!(bad.pressures.is_empty(), "pressure count must match points");
    }

    #[test]
    fn precise_hit_testing() {
        let rect = Element { kind: "Rectangle".into(), points: vec![(0.0, 0.0), (100.0, 100.0)], ..Default::default() };
        let rect = sanitize(rect).unwrap();
        assert!(rect.hit(0.5, 50.0, 2.0), "on the stroke");
        assert!(!rect.hit(50.0, 50.0, 2.0), "empty interior is not a hit");
        let filled = Element { fill_color: "#ffc9c9".into(), ..rect.clone() };
        assert!(filled.hit(50.0, 50.0, 2.0), "filled interior is a hit");
        let stroke = sanitize(Element { kind: "FreeDraw".into(), points: vec![(0.0, 0.0), (100.0, 0.0)], ..Default::default() }).unwrap();
        assert!(stroke.hit(50.0, 3.0, 2.0));
        assert!(!stroke.hit(50.0, 30.0, 2.0));
    }

    #[test]
    fn legacy_json_without_z_parses() {
        let json = r#"{"id":3,"kind":"Text","points":[[1,2]],"x":1,"y":2,"w":10,"h":10,"text":"hi"}"#;
        let el: Element = serde_json::from_str(json).unwrap();
        assert_eq!(el.z, 0);
        assert_eq!(el.text, "hi");
    }
}
