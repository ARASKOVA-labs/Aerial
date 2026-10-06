//! Pointer interaction: drawing, selection (click, shift, marquee, drag,
//! resize), the Excalidraw-style eraser, shape constraints and layer ops.

use crate::element::Element;
use crate::geom::{clip_polyline_outside_circle, simplify_rdp_indices, Rect};
use crate::{AerialCanvas, EraserType, Tool, COMMIT_SIMPLIFY_PX};

/// Selection handle hit radius in CSS px.
const HANDLE_PX: f64 = 9.0;
/// Hit tolerance for clicking strokes, CSS px.
const HIT_PX: f64 = 8.0;

impl AerialCanvas {
    // ── Hit testing ──────────────────────────────────────────────────────────

    /// Topmost element under a world point, using precise geometry (strokes by
    /// their ink, unfilled shapes by their outline).
    pub(crate) fn hit_test_world(&self, wx: f64, wy: f64) -> Option<u64> {
        let tol = HIT_PX / self.zoom;
        let probe = Rect::new(wx, wy, wx, wy).expand(tol + 32.0 / self.zoom);
        let mut ids = self.scene.candidates_in(&probe);
        ids.reverse(); // topmost first
        ids.into_iter().find(|id| self.scene.get(*id).is_some_and(|el| el.hit(wx, wy, tol)))
    }

    /// Union of the selected elements' geometric bounds.
    pub(crate) fn selection_bounds(&self) -> Option<Rect> {
        self.selected
            .iter()
            .filter_map(|id| self.scene.get(*id).map(|e| e.geom_bounds()))
            .reduce(|a, b| a.union(&b))
    }

    fn handle_at(&self, wx: f64, wy: f64) -> Option<u8> {
        if self.selected.len() != 1 {
            return None;
        }
        let el = self.scene.get(self.selected[0])?;
        let pad = 6.0 / self.zoom;
        let b = el.geom_bounds().expand(pad);
        let r = HANDLE_PX / self.zoom;
        [(1u8, b.min_x, b.min_y), (2, b.max_x, b.min_y), (3, b.min_x, b.max_y), (4, b.max_x, b.max_y)]
            .into_iter()
            .find(|(_, cx, cy)| (wx - cx).abs() <= r && (wy - cy).abs() <= r)
            .map(|(h, _, _)| h)
    }

    pub(crate) fn cursor_at(&self, raw_x: f64, raw_y: f64) -> &'static str {
        if self.tool != Tool::Select {
            return "default";
        }
        let (wx, wy) = (self.screen_to_world_x(raw_x), self.screen_to_world_y(raw_y));
        match self.handle_at(wx, wy) {
            Some(1) | Some(4) => return "nwse-resize",
            Some(2) | Some(3) => return "nesw-resize",
            _ => {}
        }
        let in_selection = self.selection_bounds().is_some_and(|b| b.expand(6.0 / self.zoom).contains_point(wx, wy));
        if in_selection || self.hit_test_world(wx, wy).is_some() { "move" } else { "default" }
    }

    // ── Pointer lifecycle ────────────────────────────────────────────────────

    pub(crate) fn handle_down(&mut self, raw_x: f64, raw_y: f64, pressure: f64) {
        // A previous stroke may be uncommitted if pointerup was lost (tablet
        // driver double-fire, stylus leaving the digitiser) — commit it now.
        self.commit_active_stroke();
        self.history.commit(&self.scene);

        let (wx, wy) = (self.screen_to_world_x(raw_x), self.screen_to_world_y(raw_y));
        self.last_mouse_x = raw_x;
        self.last_mouse_y = raw_y;
        self.needs_render = true;

        match self.tool {
            Tool::Hand => {
                self.is_panning = true;
                return;
            }
            Tool::Eraser => {
                self.is_drawing = true;
                if self.eraser_type == EraserType::Precision {
                    self.history.begin();
                    self.erase_partial(wx, wy);
                    self.eraser.last = Some((wx, wy));
                } else {
                    self.eraser.pending.clear();
                    self.eraser.last = Some((wx, wy));
                    self.erase_mark(wx, wy);
                }
                self.eraser.trail.push((wx, wy, 1.0));
                return;
            }
            Tool::Select => {
                self.is_drawing = true;
                self.begin_select_interaction(wx, wy);
                return;
            }
            Tool::Text => return,
            _ => {}
        }

        self.is_drawing = true;
        let kind = match self.tool {
            Tool::FountainPen => "FountainPen",
            Tool::Marker => "Marker",
            Tool::Highlighter => "Highlighter",
            Tool::Rectangle => "Rectangle",
            Tool::Diamond => "Diamond",
            Tool::Ellipse => "Ellipse",
            Tool::Line => "Line",
            Tool::Arrow => "Arrow",
            Tool::MagicPen => "MagicPen",
            Tool::LaserPen => "LaserPen",
            _ => "FreeDraw",
        };
        if self.tool == Tool::MagicPen {
            match self.magic_baseline_y {
                Some(base) if (wy - base).abs() <= 80.0 => {}
                _ => self.magic_baseline_y = Some(wy + 15.0),
            }
        }
        let mut el = self.styled_element(kind, wx, wy);
        el.id = self.scene.alloc_id();
        if self.tool == Tool::LaserPen {
            el.font_size = 1.0; // reused as the fade-out alpha
        }
        if pressure >= 0.0 && el.is_freehand() {
            el.pressures.push(pressure as f32);
        }
        self.shape_anchor = (wx, wy);
        self.active_stroke = Some(el);
    }

    pub(crate) fn handle_move(&mut self, raw_x: f64, raw_y: f64, pressure: f64) {
        if self.is_panning {
            self.offset_x += raw_x - self.last_mouse_x;
            self.offset_y += raw_y - self.last_mouse_y;
            self.last_mouse_x = raw_x;
            self.last_mouse_y = raw_y;
            self.needs_render = true;
            return;
        }
        let (wx, wy) = (self.screen_to_world_x(raw_x), self.screen_to_world_y(raw_y));
        self.last_mouse_x = raw_x;
        self.last_mouse_y = raw_y;

        if self.is_resizing {
            self.apply_resize(wx, wy);
            return;
        }
        if self.is_dragging {
            let (dx, dy) = (wx - self.drag_last.0, wy - self.drag_last.1);
            if dx != 0.0 || dy != 0.0 {
                for id in self.selected.clone() {
                    self.translate_element(id, dx, dy);
                }
                self.drag_last = (wx, wy);
                self.drag_moved = true;
                self.needs_render = true;
            }
            return;
        }
        if let Some(m) = self.marquee.as_mut() {
            m.2 = wx;
            m.3 = wy;
            self.update_marquee_selection();
            return;
        }
        if !self.is_drawing {
            return;
        }
        if self.tool == Tool::Eraser {
            if self.eraser_type == EraserType::Precision {
                self.erase_partial_sweep(wx, wy);
            } else {
                self.erase_sweep(wx, wy);
            }
            self.eraser.trail.push((wx, wy, 1.0));
            if self.eraser.trail.len() > 64 {
                self.eraser.trail.remove(0);
            }
            self.needs_render = true;
            return;
        }

        let (shift, alt, anchor, baseline) = (self.shift, self.alt, self.shape_anchor, self.magic_baseline_y);
        let Some(stroke) = self.active_stroke.as_mut() else { return };
        match stroke.kind.as_str() {
            "Rectangle" | "Ellipse" | "Diamond" | "Line" | "Arrow" => {
                let linear = matches!(stroke.kind.as_str(), "Line" | "Arrow");
                let (mut ex, mut ey) = (wx, wy);
                if shift {
                    let (dx, dy) = (wx - anchor.0, wy - anchor.1);
                    if linear {
                        // Snap to 15° increments, keeping length.
                        let len = dx.hypot(dy);
                        let step = std::f64::consts::PI / 12.0;
                        let a = (dy.atan2(dx) / step).round() * step;
                        ex = anchor.0 + len * a.cos();
                        ey = anchor.1 + len * a.sin();
                    } else {
                        let side = dx.abs().max(dy.abs());
                        ex = anchor.0 + side * dx.signum();
                        ey = anchor.1 + side * dy.signum();
                    }
                }
                let start = if alt && !linear { (2.0 * anchor.0 - ex, 2.0 * anchor.1 - ey) } else { anchor };
                stroke.points = vec![start, (ex, ey)];
                stroke.x = start.0.min(ex);
                stroke.y = start.1.min(ey);
                stroke.w = (ex - start.0).abs().max(1.0);
                stroke.h = (ey - start.1).abs().max(1.0);
            }
            kind => {
                let mut py = wy;
                if kind == "MagicPen" {
                    if let Some(base) = baseline {
                        if (py - base).abs() < 4.0 {
                            py = base; // gentle baseline snap
                        }
                    }
                }
                stroke.points.push((wx, py));
                if !stroke.pressures.is_empty() {
                    stroke.pressures.push(pressure.clamp(0.0, 1.0) as f32);
                }
                // Incremental bounds: O(1) per point.
                let (max_x, max_y) = (stroke.x + stroke.w, stroke.y + stroke.h);
                let (min_x, min_y) = (stroke.x.min(wx), stroke.y.min(py));
                stroke.x = min_x;
                stroke.y = min_y;
                stroke.w = (max_x.max(wx) - min_x).max(1.0);
                stroke.h = (max_y.max(py) - min_y).max(1.0);
            }
        }
        self.needs_render = true;
    }

    pub(crate) fn handle_up(&mut self, raw_x: f64, raw_y: f64) {
        self.handle_move(raw_x, raw_y, -1.0);
        if self.tool == Tool::Eraser && self.eraser_type != EraserType::Precision {
            self.commit_erase();
        }
        if self.marquee.take().is_some() {
            self.needs_render = true;
        }
        self.is_drawing = false;
        self.is_panning = false;
        self.is_dragging = false;
        self.is_resizing = false;
        self.resize_handle = 0;
        self.resize_orig_points.clear();
        self.eraser.last = None;
        self.commit_active_stroke();
        self.history.commit(&self.scene);
        self.needs_render = true;
    }

    fn commit_active_stroke(&mut self) {
        let Some(mut stroke) = self.active_stroke.take() else { return };
        let substantial = stroke.points.len() == 1 || stroke.w >= 1.0 || stroke.h >= 1.0;
        let is_shape = matches!(stroke.kind.as_str(), "Rectangle" | "Ellipse" | "Diamond" | "Line" | "Arrow");
        // A click with a shape tool (no drag) creates nothing.
        if !substantial || (is_shape && stroke.w.max(stroke.h) * self.zoom < 3.0) {
            return;
        }
        match stroke.kind.as_str() {
            "LaserPen" => self.laser_strokes.push(stroke),
            "MagicPen" => self.magic_strokes.push(stroke),
            _ => {
                if stroke.is_freehand() && stroke.points.len() > 8 {
                    if !crate::freehand::has_real_pressure(&stroke.points, &stroke.pressures) {
                        let opts = crate::freehand::preset(&stroke.kind, stroke.stroke_width);
                        stroke.pressures = crate::freehand::simulated_pressures(&stroke.points, &opts);
                    }
                    let keep = simplify_rdp_indices(&stroke.points, COMMIT_SIMPLIFY_PX / self.zoom);
                    let has_p = stroke.pressures.len() == stroke.points.len();
                    stroke.points = keep.iter().map(|&i| stroke.points[i]).collect();
                    stroke.pressures = if has_p { keep.iter().map(|&i| stroke.pressures[i]).collect() } else { Vec::new() };
                }
                let id = stroke.id;
                self.insert_recorded(stroke);
                // Excalidraw: after drawing a shape, switch to selection with it
                // selected — unless the tool is locked.
                if is_shape && !self.tool_locked {
                    self.tool = Tool::Select;
                    self.pending_tool_switch = Some("select");
                    self.set_selection(vec![id]);
                }
            }
        }
        self.needs_render = true;
    }

    // ── Selection ────────────────────────────────────────────────────────────

    fn begin_select_interaction(&mut self, wx: f64, wy: f64) {
        // 1. Resize handles of a single selection.
        if let Some(handle) = self.handle_at(wx, wy) {
            if let Some(el) = self.scene.get(self.selected[0]) {
                self.is_resizing = true;
                self.resize_handle = handle;
                self.resize_start = (wx, wy);
                self.resize_orig = el.geom_bounds();
                self.resize_orig_points = el.points.clone();
                let id = el.id;
                self.history.begin();
                self.history.touch(&self.scene, id);
                return;
            }
        }

        let hit = self.hit_test_world(wx, wy);
        let in_selection = self.selection_bounds().is_some_and(|b| b.expand(6.0 / self.zoom).contains_point(wx, wy));
        match hit {
            Some(id) if self.shift => {
                let mut sel = self.selected.clone();
                if let Some(pos) = sel.iter().position(|s| *s == id) {
                    sel.remove(pos);
                } else {
                    sel.push(id);
                }
                self.set_selection(sel);
            }
            Some(id) if !self.selected.contains(&id) => self.set_selection(vec![id]),
            Some(_) => {}
            None if in_selection && !self.shift => {}
            None => {
                // Empty space: rubber-band selection.
                self.marquee_base = if self.shift { self.selected.clone() } else { Vec::new() };
                if !self.shift {
                    self.set_selection(Vec::new());
                }
                self.marquee = Some((wx, wy, wx, wy));
                return;
            }
        }
        if !self.selected.is_empty() {
            self.is_dragging = true;
            self.drag_moved = false;
            self.drag_last = (wx, wy);
            self.history.begin();
            for id in self.selected.clone() {
                self.history.touch(&self.scene, id);
            }
        }
    }

    fn update_marquee_selection(&mut self) {
        let Some((x0, y0, x1, y1)) = self.marquee else { return };
        let r = Rect::new(x0.min(x1), y0.min(y1), x0.max(x1), y0.max(y1));
        let mut sel = self.marquee_base.clone();
        for id in self.scene.candidates_in(&r) {
            let inside = self.scene.get(id).is_some_and(|e| {
                let b = e.geom_bounds();
                b.min_x >= r.min_x && b.max_x <= r.max_x && b.min_y >= r.min_y && b.max_y <= r.max_y
            });
            if inside && !sel.contains(&id) {
                sel.push(id);
            }
        }
        self.set_selection(sel);
    }

    pub(crate) fn translate_element(&mut self, id: u64, dx: f64, dy: f64) {
        self.scene.modify(id, |el| {
            el.x += dx;
            el.y += dy;
            for p in el.points.iter_mut() {
                p.0 += dx;
                p.1 += dy;
            }
        });
    }

    fn apply_resize(&mut self, wx: f64, wy: f64) {
        let Some(&id) = self.selected.first() else { return };
        let Some(kind) = self.scene.get(id).map(|e| e.kind.clone()) else { return };
        let (dx, dy) = (wx - self.resize_start.0, wy - self.resize_start.1);
        let o = self.resize_orig;
        let (ox, oy, ow, oh) = (o.min_x, o.min_y, o.width(), o.height());
        let min = 4.0;

        let (mut nx, mut ny, mut nw, mut nh) = match self.resize_handle {
            1 => { let (w, h) = ((ow - dx).max(min), (oh - dy).max(min)); (ox + ow - w, oy + oh - h, w, h) }
            2 => { let (w, h) = ((ow + dx).max(min), (oh - dy).max(min)); (ox, oy + oh - h, w, h) }
            3 => { let (w, h) = ((ow - dx).max(min), (oh + dy).max(min)); (ox + ow - w, oy, w, h) }
            4 => { let (w, h) = ((ow + dx).max(min), (oh + dy).max(min)); (ox, oy, w, h) }
            _ => (ox, oy, ow, oh),
        };

        // Images, diagrams, text and freehand keep aspect ratio (Shift frees
        // shapes into the same behaviour).
        let keep_ratio = matches!(kind.as_str(), "Diagram" | "Image" | "Text") || self.shift;
        if keep_ratio && ow > 0.0 && oh > 0.0 {
            let scale = (nw / ow).max(nh / oh);
            nw = (ow * scale).max(min);
            nh = (oh * scale).max(min);
            (nx, ny) = match self.resize_handle {
                1 => (ox + ow - nw, oy + oh - nh),
                2 => (ox, oy + oh - nh),
                3 => (ox + ow - nw, oy),
                _ => (ox, oy),
            };
        }

        // Scale from the points captured at resize start (re-scaling already
        // scaled points every move compounded the error).
        let orig_points = &self.resize_orig_points;
        self.scene.modify(id, |el| {
            if ow > 0.0 && oh > 0.0 && orig_points.len() == el.points.len() {
                let (sx, sy) = (nw / ow, nh / oh);
                for (p, q) in el.points.iter_mut().zip(orig_points) {
                    p.0 = nx + (q.0 - ox) * sx;
                    p.1 = ny + (q.1 - oy) * sy;
                }
            }
            if el.kind == "Text" && oh > 0.0 {
                el.font_size = (el.font_size * nh / el.h.max(1.0)).clamp(4.0, 400.0);
            }
            el.x = nx;
            el.y = ny;
            el.w = nw;
            el.h = nh;
        });
        self.needs_render = true;
    }

    pub(crate) fn duplicate_selection(&mut self, offset: f64) {
        if self.selected.is_empty() {
            return;
        }
        let mut copies = Vec::with_capacity(self.selected.len());
        self.history.begin();
        // Keep relative paint order of the originals.
        let mut originals: Vec<Element> = self.selected.iter().filter_map(|id| self.scene.get(*id).cloned()).collect();
        originals.sort_by_key(|e| (e.z, e.id));
        for mut el in originals {
            let old_id = el.id;
            el.id = self.scene.alloc_id();
            el.z = self.scene.alloc_z();
            el.x += offset;
            el.y += offset;
            for p in el.points.iter_mut() {
                p.0 += offset;
                p.1 += offset;
            }
            if let Some(img) = self.image_cache.get(&old_id).cloned() {
                self.image_cache.insert(el.id, img);
            }
            self.history.touch(&self.scene, el.id);
            if let Some(id) = self.scene.upsert(el) {
                copies.push(id);
            }
        }
        self.history.commit(&self.scene);
        self.set_selection(copies);
    }

    pub(crate) fn reorder(&mut self, action: &str) {
        if self.selected.is_empty() {
            return;
        }
        let mut sel: Vec<Element> = self.selected.iter().filter_map(|id| self.scene.get(*id).cloned()).collect();
        sel.sort_by_key(|e| (e.z, e.id));
        self.history.begin();
        for e in &sel {
            self.history.touch(&self.scene, e.id);
        }
        match action {
            "front" => {
                for e in &sel {
                    let z = self.scene.alloc_z();
                    self.scene.modify(e.id, |el| el.z = z);
                }
            }
            "back" => {
                let min_z = self.scene.iter_ordered().next().map(|e| e.z).unwrap_or(1);
                let k = sel.len() as u64;
                if min_z <= k {
                    // No room below: shift everything else up (rare).
                    let others: Vec<u64> = self.scene.iter_ordered().map(|e| e.id).filter(|id| !self.selected.contains(id)).collect();
                    for id in others {
                        self.history.touch(&self.scene, id);
                        self.scene.modify(id, |el| el.z += k + 1);
                    }
                    for (i, e) in sel.iter().enumerate() {
                        self.scene.modify(e.id, |el| el.z = i as u64 + 1);
                    }
                } else {
                    for (i, e) in sel.iter().enumerate() {
                        self.scene.modify(e.id, |el| el.z = min_z - k + i as u64);
                    }
                }
            }
            "forward" | "backward" => {
                let forward = action == "forward";
                let iter: Box<dyn Iterator<Item = &Element>> = if forward { Box::new(sel.iter().rev()) } else { Box::new(sel.iter()) };
                for e in iter {
                    let Some(cur) = self.scene.get(e.id).cloned() else { continue };
                    let key = (cur.z, cur.id);
                    let neighbours = self.scene.candidates_in(&cur.visual_bounds());
                    let other = neighbours
                        .into_iter()
                        .filter(|id| !self.selected.contains(id))
                        .filter_map(|id| self.scene.get(id).map(|o| (o.z, o.id)))
                        .filter(|k| if forward { *k > key } else { *k < key })
                        .reduce(|a, b| if forward == (b < a) { b } else { a });
                    if let Some((oz, oid)) = other {
                        self.history.touch(&self.scene, oid);
                        self.scene.modify(oid, |el| el.z = cur.z);
                        self.scene.modify(cur.id, |el| el.z = oz);
                    }
                }
            }
            _ => {}
        }
        self.history.commit(&self.scene);
        self.needs_render = true;
    }

    pub(crate) fn selection_info_json(&self) -> String {
        let mut kinds: Vec<&str> = Vec::new();
        for id in &self.selected {
            if let Some(e) = self.scene.get(*id) {
                if !kinds.contains(&e.kind.as_str()) {
                    kinds.push(e.kind.as_str());
                }
            }
        }
        let first = self.selected.first().and_then(|id| self.scene.get(*id));
        let style = first.map(|e| {
            serde_json::json!({
                "strokeColor": e.stroke_color,
                "backgroundColor": e.fill_color,
                "fillStyle": e.fill_style,
                "strokeWidth": e.stroke_width,
                "strokeStyle": e.stroke_style,
                "roughness": e.roughness,
                "roundness": e.roundness,
                "opacity": e.opacity,
                "fontFamily": e.font_family,
                "fontSize": e.font_size,
            })
        });
        let bounds = self.selection_bounds().map(|b| {
            serde_json::json!({
                "x": self.world_to_screen_x(b.min_x),
                "y": self.world_to_screen_y(b.min_y),
                "w": b.width() * self.zoom,
                "h": b.height() * self.zoom,
            })
        });
        serde_json::json!({
            "count": self.selected.len(),
            "ids": self.selected.iter().take(1000).collect::<Vec<_>>(),
            "kinds": kinds,
            "style": style,
            "bounds": bounds,
        })
        .to_string()
    }

    // ── Eraser ───────────────────────────────────────────────────────────────

    /// Object mode: sample along the pointer path so fast sweeps never skip.
    fn erase_sweep(&mut self, wx: f64, wy: f64) {
        let Some((lx, ly)) = self.eraser.last else {
            self.erase_mark(wx, wy);
            self.eraser.last = Some((wx, wy));
            return;
        };
        let r = (self.eraser_radius / self.zoom).max(0.5);
        let dist = (wx - lx).hypot(wy - ly);
        let steps = ((dist / (r * 0.5)).ceil() as usize).clamp(1, 512);
        for i in 1..=steps {
            let t = i as f64 / steps as f64;
            self.erase_mark(lx + (wx - lx) * t, ly + (wy - ly) * t);
        }
        self.eraser.last = Some((wx, wy));
    }

    /// Marks (or, with Alt, un-marks) every element the eraser touches.
    fn erase_mark(&mut self, wx: f64, wy: f64) {
        let r = (self.eraser_radius / self.zoom).max(0.5);
        let probe = Rect::new(wx, wy, wx, wy).expand(r + 32.0 / self.zoom);
        for id in self.scene.candidates_in(&probe) {
            let touched = self.scene.get(id).is_some_and(|el| el.hit(wx, wy, r));
            if !touched {
                continue;
            }
            let changed = if self.alt { self.eraser.pending.remove(&id) } else { self.eraser.pending.insert(id) };
            if changed {
                self.needs_render = true;
            }
        }
    }

    fn commit_erase(&mut self) {
        if self.eraser.pending.is_empty() {
            return;
        }
        let ids: Vec<u64> = self.eraser.pending.drain().collect();
        self.history.begin();
        for id in &ids {
            self.history.touch(&self.scene, *id);
            self.scene.remove(*id);
        }
        self.history.commit(&self.scene);
        let sel: Vec<u64> = self.selected.iter().copied().filter(|id| !ids.contains(id)).collect();
        self.set_selection(sel);
    }

    /// Partial mode along the pointer path, so quick swipes cut cleanly.
    fn erase_partial_sweep(&mut self, wx: f64, wy: f64) {
        let Some((lx, ly)) = self.eraser.last else {
            self.erase_partial(wx, wy);
            self.eraser.last = Some((wx, wy));
            return;
        };
        let r = (self.eraser_radius / self.zoom).max(1.0);
        let dist = (wx - lx).hypot(wy - ly);
        let steps = ((dist / (r * 0.6)).ceil() as usize).clamp(1, 256);
        for i in 1..=steps {
            let t = i as f64 / steps as f64;
            self.erase_partial(lx + (wx - lx) * t, ly + (wy - ly) * t);
        }
        self.eraser.last = Some((wx, wy));
    }

    /// Partial mode: removes only the touched part of freehand strokes (whole
    /// shapes / text / images), splitting strokes where they are cut.
    fn erase_partial(&mut self, wx: f64, wy: f64) {
        let radius = (self.eraser_radius / self.zoom).max(1.0);
        let probe = Rect::new(wx, wy, wx, wy).expand(radius + 32.0 / self.zoom);

        enum Action {
            Skip,
            Remove,
            Split(crate::geom::PolylineRuns, Box<Element>),
        }

        for id in self.scene.candidates_in(&probe) {
            let action = match self.scene.get(id) {
                None => Action::Skip,
                Some(el) if !el.hit(wx, wy, radius) => Action::Skip,
                Some(el) if !el.is_freehand() => Action::Remove,
                Some(el) => {
                    // Cut where the eraser touches the ink, not just the centreline.
                    let reach = radius + el.stroke_width * 0.5;
                    let runs = clip_polyline_outside_circle(&el.points, &el.pressures, (wx, wy), reach);
                    if runs.len() == 1 && runs[0].0.len() == el.points.len() {
                        continue; // grazed the hit slop only: nothing to cut
                    }
                    Action::Split(runs, Box::new(el.clone()))
                }
            };
            match action {
                Action::Skip => {}
                Action::Remove => {
                    self.history.touch(&self.scene, id);
                    self.scene.remove(id);
                }
                Action::Split(runs, template) => {
                    self.history.touch(&self.scene, id);
                    let mut runs = runs.into_iter();
                    let Some((first, first_p)) = runs.next() else {
                        self.scene.remove(id);
                        continue;
                    };
                    self.scene.modify(id, |e| {
                        e.points = first;
                        e.pressures = first_p;
                    });
                    for (run, run_p) in runs {
                        let new_id = self.scene.alloc_id();
                        self.history.touch(&self.scene, new_id);
                        self.scene.upsert(Element { id: new_id, points: run, pressures: run_p, ..(*template).clone() });
                    }
                }
            }
        }
        let sel: Vec<u64> = self.selected.iter().copied().filter(|id| self.scene.contains(*id)).collect();
        self.set_selection(sel);
        self.needs_render = true;
    }
}
