//! JS API: text editing, selection, styling the selection, layers, erasing.

use super::*;

#[wasm_bindgen]
impl AerialCanvas {
    // ── Text & Selection ──────────────────────────────────────────────────────
    pub fn get_selected_text(&self) -> Option<String> {
        let el = self.scene.get(*self.selected.first()?)?;
        if el.text.is_empty() { None } else { Some(el.text.clone()) }
    }

    pub fn update_selected_text(&mut self, text: String) {
        let Some(&id) = self.selected.first() else { return };
        self.history.begin();
        self.history.touch(&self.scene, id);
        self.scene.modify(id, |el| {
            let (w, h) = text_box(&text, el.font_size);
            el.text = text;
            el.w = w;
            el.h = h;
        });
        self.history.commit(&self.scene);
    }

    pub fn add_text(&mut self, text: String, x: f64, y: f64, size: f64, font_family: Option<String>, color: Option<String>) {
        let c = color.unwrap_or_else(|| self.style.stroke_color.clone());
        let (w, h) = text_box(&text, size);
        let el = Element {
            id: self.scene.alloc_id(),
            kind: "Text".to_string(),
            points: vec![(x, y)],
            x,
            y,
            w,
            h,
            stroke_color: c.clone(),
            fill_color: c,
            stroke_width: self.style.stroke_width,
            text,
            font_size: size,
            font_family: font_family.unwrap_or_else(|| self.style.font_family.clone()),
            opacity: self.style.opacity,
            ..Default::default()
        };
        let id = el.id;
        self.insert_recorded(el);
        if !self.tool_locked {
            self.set_selection(vec![id]);
        }
    }

    #[allow(clippy::too_many_arguments)]
    pub fn update_text_element(&mut self, id: u64, text: String, x: f64, y: f64, size: f64, font_family: Option<String>, color: Option<String>) {
        self.history.begin();
        self.history.touch(&self.scene, id);
        self.scene.modify(id, |el| {
            let (w, h) = text_box(&text, size);
            el.text = text;
            el.x = x;
            el.y = y;
            el.points = vec![(x, y)];
            el.w = w;
            el.h = h;
            el.font_size = size;
            if let Some(fam) = font_family {
                el.font_family = fam;
            }
            if let Some(c) = color {
                el.stroke_color = c.clone();
                el.fill_color = c;
            }
        });
        self.history.commit(&self.scene);
    }

    /// The first selected element (single-selection API).
    pub fn get_selected_element_json(&self) -> Option<String> {
        serde_json::to_string(self.scene.get(*self.selected.first()?)?).ok()
    }

    /// `{count, ids (≤1000), kinds, style, bounds}` for the selection, bounds
    /// in screen (CSS) pixels.
    pub fn get_selection_info(&self) -> String {
        self.selection_info_json()
    }

    /// Bumped whenever the selection changes; JS polls it to refresh panels.
    pub fn selection_version(&self) -> f64 {
        self.selection_version as f64
    }

    pub fn set_accent_color(&mut self, color: String) {
        if color.len() <= element::MAX_COLOR_LEN {
            self.accent_color = color;
            self.needs_render = true;
        }
    }

    pub fn get_accent_color(&self) -> String {
        self.accent_color.clone()
    }

    pub fn set_selected_id(&mut self, id: u64) {
        if self.scene.contains(id) {
            self.set_selection(vec![id]);
        }
    }

    /// Replaces the selection with the ids in a JSON array.
    pub fn select_ids(&mut self, json: &str) {
        let ids: Vec<u64> = serde_json::from_str(json).unwrap_or_default();
        let ids = ids.into_iter().filter(|id| self.scene.contains(*id)).collect();
        self.set_selection(ids);
    }

    pub fn select_all(&mut self) {
        let ids = self.scene.iter_ordered().map(|e| e.id).collect();
        self.set_selection(ids);
    }

    pub fn deselect(&mut self) {
        self.history.commit(&self.scene);
        self.is_resizing = false;
        self.is_dragging = false;
        self.marquee = None;
        self.set_selection(Vec::new());
    }

    pub fn scale_selected(&mut self, factor: f64) {
        if !(factor.is_finite() && factor > 0.0) || self.selected.is_empty() {
            return;
        }
        self.history.begin();
        for id in self.selected.clone() {
            self.history.touch(&self.scene, id);
            self.scene.modify(id, |el| {
                let (cx, cy) = (el.x + el.w / 2.0, el.y + el.h / 2.0);
                let (new_w, new_h) = ((el.w * factor).max(20.0), (el.h * factor).max(20.0));
                let (new_x, new_y) = (cx - new_w / 2.0, cy - new_h / 2.0);
                if el.w > 0.0 && el.h > 0.0 {
                    let (sx, sy) = (new_w / el.w, new_h / el.h);
                    for p in el.points.iter_mut() {
                        p.0 = new_x + (p.0 - el.x) * sx;
                        p.1 = new_y + (p.1 - el.y) * sy;
                    }
                }
                el.x = new_x;
                el.y = new_y;
                el.w = new_w;
                el.h = new_h;
            });
        }
        self.history.commit(&self.scene);
    }

    pub fn delete_selected(&mut self) {
        if self.selected.is_empty() {
            return;
        }
        self.history.begin();
        for id in self.selected.clone() {
            self.history.touch(&self.scene, id);
            self.scene.remove(id);
        }
        self.history.commit(&self.scene);
        self.set_selection(Vec::new());
    }

    /// Copies the selection 10px down-right and selects the copies.
    pub fn duplicate_selected(&mut self) {
        self.duplicate_selection(10.0);
    }

    /// Moves the selection by (dx, dy) world units as one undo step.
    pub fn nudge_selected(&mut self, dx: f64, dy: f64) {
        if !(dx.is_finite() && dy.is_finite()) || self.selected.is_empty() {
            return;
        }
        self.history.begin();
        for id in self.selected.clone() {
            self.history.touch(&self.scene, id);
            self.translate_element(id, dx, dy);
        }
        self.history.commit(&self.scene);
        self.needs_render = true;
    }

    /// Layer order: `"front"`, `"back"`, `"forward"`, `"backward"`.
    pub fn reorder_selected(&mut self, action: &str) {
        self.reorder(action);
    }

    pub fn get_element_at(&self, raw_x: f64, raw_y: f64) -> Option<String> {
        let id = self.hit_test_world(self.screen_to_world_x(raw_x), self.screen_to_world_y(raw_y))?;
        serde_json::to_string(self.scene.get(id)?).ok()
    }

    /// Hides an element from rendering (used while its text is edited inline).
    pub fn hide_element(&mut self, id: u64) {
        self.hidden.insert(id);
        self.needs_render = true;
    }

    pub fn show_all_elements(&mut self) {
        self.hidden.clear();
        self.needs_render = true;
    }

    /// CSS cursor for the select tool at a screen point.
    pub fn get_cursor(&self, raw_x: f64, raw_y: f64) -> String {
        self.cursor_at(raw_x, raw_y).to_string()
    }

    pub fn clear_board(&mut self) {
        self.history.commit(&self.scene);
        if !self.scene.is_empty() {
            self.history.begin();
            let ids: Vec<u64> = self.scene.iter_ordered().map(|e| e.id).collect();
            for id in ids {
                self.history.touch(&self.scene, id);
            }
            self.scene.clear();
            self.history.commit(&self.scene);
        }
        self.laser_strokes.clear();
        self.magic_strokes.clear();
        self.set_selection(Vec::new());
    }

    pub fn clear_laser_strokes(&mut self) {
        self.laser_strokes.clear();
        self.needs_render = true;
    }

    pub fn clear_magic_strokes(&mut self) {
        self.magic_strokes.clear();
        self.magic_baseline_y = None;
        self.needs_render = true;
    }

    pub fn extract_magic_strokes(&mut self) -> String {
        let mut ink = Vec::new();
        let mut bounds: Option<Rect> = None;
        for stroke in &self.magic_strokes {
            let xs: Vec<f64> = stroke.points.iter().map(|p| p.0).collect();
            let ys: Vec<f64> = stroke.points.iter().map(|p| p.1).collect();
            let ts: Vec<f64> = (0..stroke.points.len()).map(|i| (i * 10) as f64).collect();
            if let Some(b) = geom::bounds_of(&stroke.points) {
                bounds = Some(bounds.map_or(b, |acc| acc.union(&b)));
            }
            ink.push(vec![xs, ys, ts]);
        }
        let b = bounds.unwrap_or(Rect::new(0.0, 0.0, 0.0, 0.0));
        let payload = serde_json::json!({
            "ink": ink,
            "count": self.magic_strokes.len(),
            "bounds": {
                "min_x": b.min_x,
                "min_y": b.min_y,
                "max_x": b.max_x,
                "max_y": b.max_y,
                "baseline_y": self.magic_baseline_y.unwrap_or(b.max_y),
            }
        });
        self.magic_strokes.clear();
        self.magic_baseline_y = None;
        self.needs_render = true;
        payload.to_string()
    }

    /// Deprecated no-op kept for API compatibility. Every mutating engine call
    /// now records its own undo transaction.
    pub fn save_state(&mut self) {}

    pub fn undo(&mut self) -> bool {
        let changed = self.history.undo(&mut self.scene);
        if changed {
            self.set_selection(Vec::new());
        }
        changed
    }

    pub fn redo(&mut self) -> bool {
        let changed = self.history.redo(&mut self.scene);
        if changed {
            self.set_selection(Vec::new());
        }
        changed
    }

    pub fn can_undo(&self) -> bool {
        self.history.undo_depth() > 0
    }

    pub fn can_redo(&self) -> bool {
        self.history.redo_depth() > 0
    }

    pub fn set_eraser_radius(&mut self, r: f64) {
        if r.is_finite() {
            self.eraser_radius = r.clamp(2.0, 2_000.0);
        }
    }

    pub fn set_eraser_size(&mut self, s: f64) {
        self.set_eraser_radius(s / 2.0);
    }

    pub fn set_eraser_type(&mut self, t: &str) {
        self.eraser_type = match t.to_lowercase().as_str() {
            "precision" | "pixel" | "partial" => EraserType::Precision,
            "element" | "object" => EraserType::Element,
            _ => EraserType::Stroke,
        };
    }

    pub fn get_eraser_type(&self) -> String {
        match self.eraser_type {
            EraserType::Stroke => "stroke",
            EraserType::Precision => "precision",
            EraserType::Element => "element",
        }
        .to_string()
    }
}
