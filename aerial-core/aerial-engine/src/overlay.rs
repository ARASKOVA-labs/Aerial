//! Dynamic-layer chrome painted on top of the scene every frame: selection
//! frame and handles, rubber-band marquee, eraser trail, Magic Pen guides.
//! All sizes are in CSS pixels, divided by zoom so they stay constant on screen.

use wasm_bindgen::JsValue;

use crate::{AerialCanvas, Tool};

impl AerialCanvas {
    fn round_rect(&self, x: f64, y: f64, w: f64, h: f64, r: f64) {
        let ctx = &self.ctx;
        ctx.begin_path();
        ctx.move_to(x + r, y);
        ctx.line_to(x + w - r, y);
        ctx.quadratic_curve_to(x + w, y, x + w, y + r);
        ctx.line_to(x + w, y + h - r);
        ctx.quadratic_curve_to(x + w, y + h, x + w - r, y + h);
        ctx.line_to(x + r, y + h);
        ctx.quadratic_curve_to(x, y + h, x, y + h - r);
        ctx.line_to(x, y + r);
        ctx.quadratic_curve_to(x, y, x + r, y);
        ctx.close_path();
    }

    pub(crate) fn paint_selection(&self) {
        if self.selected.is_empty() || self.marquee.is_some() && self.selected.is_empty() {
            return;
        }
        let ctx = &self.ctx;
        let z = self.zoom;
        let accent = self.accent_color.as_str();
        let pad = 6.0 / z;
        ctx.save();
        ctx.set_stroke_style_str(accent);

        if self.selected.len() > 1 {
            // Each member gets a faint dashed frame; the group a solid one.
            ctx.set_line_width(1.0 / z);
            ctx.set_global_alpha(0.55);
            let _ = ctx.set_line_dash(&js_sys::Array::of2(&JsValue::from_f64(4.0 / z), &JsValue::from_f64(3.0 / z)));
            for id in self.selected.iter().take(2_000) {
                if let Some(el) = self.scene.get(*id) {
                    let b = el.geom_bounds().expand(pad * 0.5);
                    ctx.stroke_rect(b.min_x, b.min_y, b.width(), b.height());
                }
            }
            let _ = ctx.set_line_dash(&js_sys::Array::new());
            ctx.set_global_alpha(1.0);
        }

        if let Some(b) = self.selection_bounds() {
            let b = b.expand(pad);
            ctx.set_line_width(1.0 / z);
            ctx.stroke_rect(b.min_x, b.min_y, b.width(), b.height());
            if self.selected.len() == 1 && !self.is_dragging {
                let hs = 9.0 / z;
                ctx.set_fill_style_str(if self.is_dark_mode { "#121212" } else { "#ffffff" });
                ctx.set_line_width(1.25 / z);
                for (cx, cy) in [(b.min_x, b.min_y), (b.max_x, b.min_y), (b.min_x, b.max_y), (b.max_x, b.max_y)] {
                    self.round_rect(cx - hs / 2.0, cy - hs / 2.0, hs, hs, 2.0 / z);
                    ctx.fill();
                    ctx.stroke();
                }
            }
        }
        ctx.restore();
    }

    pub(crate) fn paint_marquee(&self) {
        let Some((x0, y0, x1, y1)) = self.marquee else { return };
        let ctx = &self.ctx;
        let (x, y, w, h) = (x0.min(x1), y0.min(y1), (x1 - x0).abs(), (y1 - y0).abs());
        ctx.save();
        ctx.set_global_alpha(0.08);
        ctx.set_fill_style_str(&self.accent_color);
        ctx.fill_rect(x, y, w, h);
        ctx.set_global_alpha(0.9);
        ctx.set_stroke_style_str(&self.accent_color);
        ctx.set_line_width(1.0 / self.zoom);
        ctx.stroke_rect(x, y, w, h);
        ctx.restore();
    }

    /// Short-lived tapered trail behind the eraser, like Excalidraw's.
    pub(crate) fn paint_eraser_trail(&self, is_dark: bool) {
        let trail = &self.eraser.trail;
        if trail.len() < 2 {
            return;
        }
        let ctx = &self.ctx;
        ctx.save();
        ctx.set_line_cap("round");
        ctx.set_stroke_style_str(if is_dark { "#e3e3e8" } else { "#1e1e1e" });
        let n = trail.len();
        for i in 1..n {
            let (a, b) = (trail[i - 1], trail[i]);
            let along = i as f64 / n as f64; // thin at the tail, full at the head
            ctx.set_global_alpha((b.2 * 0.22).clamp(0.0, 1.0));
            ctx.set_line_width((self.eraser_radius * 2.0 * along).max(1.0) / self.zoom);
            ctx.begin_path();
            ctx.move_to(a.0, a.1);
            ctx.line_to(b.0, b.1);
            ctx.stroke();
        }
        ctx.restore();
    }

    pub(crate) fn paint_magic_guidelines(&self, is_dark: bool, css_w: f64, css_h: f64) {
        if self.tool != Tool::MagicPen {
            return;
        }
        let ctx = &self.ctx;
        let (left, right) = (self.screen_to_world_x(0.0), self.screen_to_world_x(css_w));
        let (top, bottom) = (self.screen_to_world_y(0.0), self.screen_to_world_y(css_h));
        let z = self.zoom;
        let dash = |a: f64, b: f64| js_sys::Array::of2(&JsValue::from_f64(a / z), &JsValue::from_f64(b / z));
        let hline = |y: f64, color: &str, width: f64, dashes: Option<js_sys::Array>| {
            ctx.begin_path();
            ctx.set_stroke_style_str(color);
            ctx.set_line_width(width / z);
            if let Some(d) = &dashes {
                let _ = ctx.set_line_dash(d);
            }
            ctx.move_to(left, y);
            ctx.line_to(right, y);
            ctx.stroke();
            if dashes.is_some() {
                let _ = ctx.set_line_dash(&js_sys::Array::new());
            }
        };
        let accent = "rgba(105, 101, 219, 0.7)";
        if let Some(base) = self.magic_baseline_y {
            let ink = |a: f64| if is_dark { format!("rgba(255, 255, 255, {a})") } else { format!("rgba(10, 10, 10, {a})") };
            hline(base, accent, 1.5, None);
            hline(base - 20.0, &ink(0.3), 1.0, Some(dash(6.0, 6.0)));
            hline(base - 34.0, &ink(0.16), 1.0, None);
            hline(base + 14.0, &ink(0.12), 1.0, Some(dash(2.0, 4.0)));
        } else {
            let step = 60.0;
            ctx.begin_path();
            ctx.set_stroke_style_str("rgba(105, 101, 219, 0.16)");
            ctx.set_line_width(1.0 / z);
            let (start, end) = ((top / step).floor() as i64, (bottom / step).ceil() as i64);
            if end - start < 10_000 {
                for gy in start..=end {
                    ctx.move_to(left, gy as f64 * step);
                    ctx.line_to(right, gy as f64 * step);
                }
            }
            ctx.stroke();
        }
    }
}
