//! JS API: theme, background, grid, zoom, pan and coordinate conversion.

use super::*;

#[wasm_bindgen]
impl AerialCanvas {
    // ── Appearance & Viewport ─────────────────────────────────────────────────
    /// Dark mode re-colours every element through the theme transform; stored
    /// colours never change, so switching back is lossless.
    pub fn set_dark_mode(&mut self, is_dark: bool) {
        self.is_dark_mode = is_dark;
        self.needs_render = true;
    }

    /// Canonical (light-theme) paper colour; shown transformed in dark mode.
    pub fn set_background_color(&mut self, color: &str) {
        if color.len() <= element::MAX_COLOR_LEN {
            self.bg_color = Some(color.to_string());
            self.needs_render = true;
        }
    }

    pub fn set_grid_type(&mut self, gtype: &str) {
        self.grid_type = gtype.chars().take(16).collect();
        self.needs_render = true;
    }

    /// Size (CSS px) below which content is drawn as density blocks when
    /// zoomed out. 0 disables level-of-detail aggregation.
    pub fn set_lod_threshold(&mut self, px: f64) {
        if px.is_finite() {
            self.lod_px = px.clamp(0.0, 16.0);
            self.cache.invalidate();
            self.needs_render = true;
        }
    }

    /// Kept for API compatibility; the brush shape is now pressure-driven.
    pub fn set_fountain_sharpness(&mut self, _s: f64) {}

    pub fn set_stroke_color(&mut self, c: &str) {
        self.apply_patch(&StylePatch { stroke_color: Some(c.to_string()), ..Default::default() });
    }
    pub fn set_fill_color(&mut self, c: &str) {
        self.apply_patch(&StylePatch { background_color: Some(c.to_string()), ..Default::default() });
    }
    pub fn set_stroke_width(&mut self, w: f64) {
        self.apply_patch(&StylePatch { stroke_width: Some(w), ..Default::default() });
    }
    pub fn set_is_rough(&mut self, rough: bool) {
        self.is_rough = rough;
    }
    pub fn set_is_curved(&mut self, curved: bool) {
        self.is_curved = curved;
    }

    pub fn get_zoom(&self) -> f64 {
        self.zoom
    }

    pub fn zoom_in(&mut self) -> f64 {
        self.zoom_about_center(1.1)
    }

    pub fn zoom_out(&mut self) -> f64 {
        self.zoom_about_center(1.0 / 1.1)
    }

    pub fn reset_view(&mut self) -> f64 {
        self.zoom = 1.0;
        self.offset_x = 0.0;
        self.offset_y = 0.0;
        self.needs_render = true;
        self.zoom
    }

    /// Bounds of everything on the board, `[min_x, min_y, max_x, max_y]` in
    /// world units, or an empty array for an empty board.
    pub fn content_bounds(&self) -> Vec<f64> {
        match self.content_rect() {
            Some(r) => vec![r.min_x, r.min_y, r.max_x, r.max_y],
            None => Vec::new(),
        }
    }

    /// Frames the whole board with `padding` CSS px on every side, never
    /// zooming in past 100%. Returns the new zoom (unchanged on an empty board).
    pub fn zoom_to_fit(&mut self, padding: f64) -> f64 {
        let Some(r) = self.content_rect() else { return self.zoom };
        let (vw, vh) = (self.canvas.width() as f64 / self.dpr, self.canvas.height() as f64 / self.dpr);
        let pad = padding.clamp(0.0, vw.min(vh) / 3.0);
        let fit = ((vw - 2.0 * pad) / r.width().max(1.0)).min((vh - 2.0 * pad) / r.height().max(1.0));
        self.zoom = fit.clamp(MIN_ZOOM, 1.0);
        self.offset_x = vw / 2.0 - (r.min_x + r.width() / 2.0) * self.zoom;
        self.offset_y = vh / 2.0 - (r.min_y + r.height() / 2.0) * self.zoom;
        self.needs_render = true;
        self.zoom
    }

    pub fn screen_to_world_x(&self, sx: f64) -> f64 {
        (sx - self.offset_x) / self.zoom
    }

    pub fn screen_to_world_y(&self, sy: f64) -> f64 {
        (sy - self.offset_y) / self.zoom
    }

    pub fn world_to_screen_x(&self, wx: f64) -> f64 {
        wx * self.zoom + self.offset_x
    }

    pub fn world_to_screen_y(&self, wy: f64) -> f64 {
        wy * self.zoom + self.offset_y
    }
}
