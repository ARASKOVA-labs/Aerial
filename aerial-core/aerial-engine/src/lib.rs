use wasm_bindgen::prelude::*;
use web_sys::{CanvasRenderingContext2d, HtmlCanvasElement, HtmlImageElement};
use serde::{Deserialize, Serialize};
use std::collections::{HashMap, VecDeque};
use yrs::{Doc, Transact, ReadTxn, StateVector, Update, updates::encoder::Encode, updates::decoder::Decode};

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
pub enum Tool {
    Select,
    FreeDraw,
    FountainPen,
    Highlighter,
    Rectangle,
    Ellipse,
    Line,
    Arrow,
    Text,
    Hand,
    Eraser,
    MagicPen,
    LaserPen,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Element {
    pub id: u64,
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
}

#[derive(Serialize, Deserialize)]
pub struct SceneState {
    pub elements: Vec<Element>,
}

#[wasm_bindgen]
pub struct AerialCanvas {
    canvas_id: String,
    canvas: HtmlCanvasElement,
    ctx: CanvasRenderingContext2d,
    elements: Vec<Element>,
    active_stroke: Option<Element>,
    laser_strokes: Vec<Element>,
    magic_strokes: Vec<Element>,
    image_cache: HashMap<u64, HtmlImageElement>,
    tool: Tool,
    stroke_color: String,
    fill_color: String,
    stroke_width: f64,
    fountain_sharpness: f64,
    is_rough: bool,
    is_curved: bool,
    is_dark_mode: bool,
    grid_type: String,
    dpr: f64,
    zoom: f64,
    offset_x: f64,
    offset_y: f64,
    is_drawing: bool,
    is_panning: bool,
    is_dragging: bool,
    drag_offset_x: f64,
    drag_offset_y: f64,
    eraser_radius: f64,
    last_mouse_x: f64,
    last_mouse_y: f64,
    selected_id: Option<u64>,
    dirty: bool,
    next_id: u64,
    doc: Doc,
    undo_stack: VecDeque<Vec<Element>>,
    redo_stack: VecDeque<Vec<Element>>,
}

#[wasm_bindgen]
impl AerialCanvas {
    #[wasm_bindgen(constructor)]
    pub fn new(canvas_id: &str) -> Result<AerialCanvas, JsValue> {
        let window = web_sys::window().ok_or("No global window")?;
        let document = window.document().ok_or("No global document")?;
        let element = document.get_element_by_id(canvas_id).ok_or("Canvas element not found")?;
        let canvas: HtmlCanvasElement = element.dyn_into()?;
        let ctx_object = canvas.get_context("2d")?.ok_or("Failed to get 2d context")?;
        let ctx: CanvasRenderingContext2d = ctx_object.dyn_into()?;

        Ok(AerialCanvas {
            canvas_id: canvas_id.to_string(),
            canvas,
            ctx,
            elements: Vec::new(),
            active_stroke: None,
            laser_strokes: Vec::new(),
            magic_strokes: Vec::new(),
            image_cache: HashMap::new(),
            tool: Tool::FreeDraw,
            stroke_color: "#3b82f6".to_string(),
            fill_color: "transparent".to_string(),
            stroke_width: 2.5,
            fountain_sharpness: 1.0,
            is_rough: false,
            is_curved: true,
            is_dark_mode: false,
            grid_type: "dots".to_string(),
            dpr: 1.0,
            zoom: 1.0,
            offset_x: 0.0,
            offset_y: 0.0,
            is_drawing: false,
            is_panning: false,
            is_dragging: false,
            drag_offset_x: 0.0,
            drag_offset_y: 0.0,
            eraser_radius: 24.0,
            last_mouse_x: 0.0,
            last_mouse_y: 0.0,
            selected_id: None,
            dirty: true,
            next_id: 1,
            doc: Doc::new(),
            undo_stack: VecDeque::new(),
            redo_stack: VecDeque::new(),
        })
    }

    // ── Tool Selectors ────────────────────────────────────────────────────────
    // Each setter resets all in-flight interaction state so switching tools
    // never leaves dangling strokes, selections, or drag operations behind.
    fn reset_interaction_state(&mut self) {
        self.active_stroke = None;
        self.is_drawing = false;
        self.is_panning = false;
        self.is_dragging = false;
    }

    pub fn set_tool_freedraw(&mut self)    { self.reset_interaction_state(); self.selected_id = None; self.tool = Tool::FreeDraw; }
    pub fn set_tool_rectangle(&mut self)   { self.reset_interaction_state(); self.selected_id = None; self.tool = Tool::Rectangle; }
    pub fn set_tool_ellipse(&mut self)     { self.reset_interaction_state(); self.selected_id = None; self.tool = Tool::Ellipse; }
    pub fn set_tool_line(&mut self)        { self.reset_interaction_state(); self.selected_id = None; self.tool = Tool::Line; }
    pub fn set_tool_select(&mut self)      { self.reset_interaction_state(); self.tool = Tool::Select; }
    pub fn set_tool_hand(&mut self)        { self.reset_interaction_state(); self.selected_id = None; self.tool = Tool::Hand; }
    pub fn set_tool_arrow(&mut self)       { self.reset_interaction_state(); self.selected_id = None; self.tool = Tool::Arrow; }
    pub fn set_tool_fountain_pen(&mut self){ self.reset_interaction_state(); self.selected_id = None; self.tool = Tool::FountainPen; }
    pub fn set_tool_highlighter(&mut self) { self.reset_interaction_state(); self.selected_id = None; self.tool = Tool::Highlighter; }
    pub fn set_tool_text(&mut self)        { self.reset_interaction_state(); self.selected_id = None; self.tool = Tool::Text; }
    pub fn set_tool_eraser(&mut self)      { self.reset_interaction_state(); self.selected_id = None; self.tool = Tool::Eraser; }
    pub fn set_tool_magic_pen(&mut self)   { self.reset_interaction_state(); self.selected_id = None; self.tool = Tool::MagicPen; }
    pub fn set_tool_laser_pen(&mut self)   { self.reset_interaction_state(); self.selected_id = None; self.tool = Tool::LaserPen; }

    // ── Text & Selection ──────────────────────────────────────────────────────
    pub fn get_selected_text(&self) -> Option<String> {
        if let Some(id) = self.selected_id {
            if let Some(el) = self.elements.iter().find(|e| e.id == id) {
                if !el.text.is_empty() {
                    return Some(el.text.clone());
                }
            }
        }
        None
    }

    pub fn update_selected_text(&mut self, text: String) {
        if let Some(id) = self.selected_id {
            if let Some(el) = self.elements.iter_mut().find(|e| e.id == id) {
                el.text = text;
                self.dirty = true;
            }
        }
    }

    pub fn add_text(&mut self, text: String, x: f64, y: f64, size: f64, font_family: Option<String>, color: Option<String>) {
        self.save_state();
        let id = self.next_id;
        self.next_id += 1;
        
        let c = color.unwrap_or_else(|| self.stroke_color.clone());
        
        self.elements.push(Element {
            id,
            kind: "Text".to_string(),
            points: vec![(x, y)],
            x,
            y,
            w: 200.0,
            h: size * 1.5,
            stroke_color: c.clone(),
            fill_color: c.clone(),
            stroke_width: self.stroke_width,
            text,
            font_size: size,
            font_family: font_family.unwrap_or_else(|| "sans-serif".to_string()),
            asset_id: None,
            code: None,
            svg: None,
            hit_map_json: None,
            is_rough: self.is_rough,
            is_curved: self.is_curved,
        });
        self.dirty = true;
    }

    pub fn clear_board(&mut self) {
        if !self.elements.is_empty() {
            self.save_state();
        }
        self.elements.clear();
        self.laser_strokes.clear();
        self.magic_strokes.clear();
        self.selected_id = None;
        self.dirty = true;
    }

    pub fn clear_laser_strokes(&mut self) {
        self.laser_strokes.clear();
        self.dirty = true;
    }

    pub fn extract_magic_strokes(&mut self) -> String {
        let mut all_strokes_json = Vec::new();
        for stroke in &self.magic_strokes {
            let mut xs = Vec::new();
            let mut ys = Vec::new();
            let mut ts = Vec::new(); 
            
            for (i, p) in stroke.points.iter().enumerate() {
                xs.push(p.0);
                ys.push(p.1);
                ts.push((i * 10) as f64); 
            }
            all_strokes_json.push(vec![xs, ys, ts]);
        }
        
        let json = serde_json::to_string(&all_strokes_json).unwrap_or_else(|_| "[]".to_string());
        self.magic_strokes.clear();
        self.dirty = true;
        json
    }

    pub fn delete_selected(&mut self) {
        if let Some(id) = self.selected_id {
            self.save_state();
            self.elements.retain(|e| e.id != id);
            self.selected_id = None;
            self.dirty = true;
        }
    }

    pub fn save_state(&mut self) {
        self.undo_stack.push_back(self.elements.clone());
        self.redo_stack.clear();
        if self.undo_stack.len() > 50 {
            self.undo_stack.pop_front(); // O(1) with VecDeque
        }
    }

    pub fn undo(&mut self) -> bool {
        if let Some(prev) = self.undo_stack.pop_back() {
            self.redo_stack.push_back(self.elements.clone());
            self.elements = prev;
            self.selected_id = None;
            self.dirty = true;
            true
        } else {
            false
        }
    }

    pub fn redo(&mut self) -> bool {
        if let Some(next) = self.redo_stack.pop_back() {
            self.undo_stack.push_back(self.elements.clone());
            self.elements = next;
            self.selected_id = None;
            self.dirty = true;
            true
        } else {
            false
        }
    }

    pub fn set_eraser_radius(&mut self, r: f64) {
        self.eraser_radius = r.max(4.0);
    }

    // ── Images & Diagrams ─────────────────────────────────────────────────────
    pub fn add_image(&mut self, img: HtmlImageElement, x: f64, y: f64, w: f64, h: f64, asset_id: String) {
        self.save_state();
        let id = self.next_id;
        self.next_id += 1;
        self.image_cache.insert(id, img);
        self.elements.push(Element {
            id,
            kind: "Image".to_string(),
            points: vec![(x, y)],
            x,
            y,
            w,
            h,
            stroke_color: "transparent".to_string(),
            fill_color: "transparent".to_string(),
            stroke_width: 0.0,
            text: String::new(),
            font_size: 14.0,
            font_family: "sans-serif".to_string(),
            asset_id: Some(asset_id),
            code: None,
            svg: None,
            hit_map_json: None,
            is_rough: false,
            is_curved: false,
        });
        self.dirty = true;
    }

    pub fn add_diagram(&mut self, img: HtmlImageElement, x: f64, y: f64, w: f64, h: f64, code: String, svg: String, hit_map_str: String) {
        let id = self.next_id;
        self.next_id += 1;
        self.image_cache.insert(id, img);
        self.elements.push(Element {
            id,
            kind: "Diagram".to_string(),
            points: vec![(x, y)],
            x,
            y,
            w,
            h,
            stroke_color: "transparent".to_string(),
            fill_color: "transparent".to_string(),
            stroke_width: 0.0,
            text: String::new(),
            font_size: 14.0,
            font_family: "sans-serif".to_string(),
            asset_id: None,
            code: Some(code),
            svg: Some(svg),
            hit_map_json: Some(hit_map_str),
            is_rough: false,
            is_curved: false,
        });
        self.dirty = true;
    }

    pub fn set_cached_image(&mut self, id: u64, img: HtmlImageElement) {
        self.image_cache.insert(id, img);
        self.dirty = true;
    }

    pub fn get_element_code(&self, id: u64) -> Option<String> {
        self.elements.iter().find(|e| e.id == id).and_then(|e| e.code.clone())
    }

    // ── Scene State & CRDT Sync ───────────────────────────────────────────────
    pub fn get_scene_json(&self) -> String {
        let state = SceneState { elements: self.elements.clone() };
        serde_json::to_string(&state).unwrap_or_else(|_| "{}".to_string())
    }

    pub fn load_scene_json(&mut self, json: &str) {
        if let Ok(state) = serde_json::from_str::<SceneState>(json) {
            self.elements = state.elements;
            self.next_id = self.elements.iter().map(|e| e.id).max().unwrap_or(0) + 1;
            self.dirty = true;
        }
    }

    pub fn export_full_state(&self) -> Vec<u8> {
        let json = self.get_scene_json();
        json.into_bytes()
    }

    pub fn import_full_state(&mut self, bytes: &[u8]) {
        if let Ok(json) = String::from_utf8(bytes.to_vec()) {
            self.load_scene_json(&json);
        }
    }

    pub fn check_and_clear_dirty(&mut self) -> bool {
        let was_dirty = self.dirty;
        self.dirty = false;
        was_dirty
    }

    pub fn get_local_state_vector(&self) -> Vec<u8> {
        let txn = self.doc.transact();
        txn.state_vector().encode_v1()
    }

    pub fn process_incoming_packet(&mut self, packet: &[u8]) -> Option<Vec<u8>> {
        self.apply_remote_delta(packet);
        None
    }

    pub fn export_delta_update(&self, remote_sv: &[u8]) -> Vec<u8> {
        if let Ok(sv) = StateVector::decode_v1(remote_sv) {
            let txn = self.doc.transact();
            txn.encode_diff_v1(&sv)
        } else {
            Vec::new()
        }
    }

    pub fn apply_remote_delta(&mut self, bytes: &[u8]) {
        if let Ok(update) = Update::decode_v1(bytes) {
            let mut txn = self.doc.transact_mut();
            txn.apply_update(update);
            self.dirty = true;
        }
    }

    // ── Appearance & Viewport ─────────────────────────────────────────────────
    pub fn set_dark_mode(&mut self, is_dark: bool) {
        self.is_dark_mode = is_dark;
        self.dirty = true;
    }

    pub fn set_grid_type(&mut self, gtype: &str) {
        self.grid_type = gtype.to_string();
        self.dirty = true;
    }

    pub fn set_fountain_sharpness(&mut self, s: f64) { self.fountain_sharpness = s; }
    pub fn set_stroke_color(&mut self, c: &str) { self.stroke_color = c.to_string(); self.dirty = true; }
    pub fn set_fill_color(&mut self, c: &str) { self.fill_color = c.to_string(); self.dirty = true; }
    pub fn set_stroke_width(&mut self, w: f64) { self.stroke_width = w; }
    pub fn set_is_rough(&mut self, rough: bool) { self.is_rough = rough; }
    pub fn set_is_curved(&mut self, curved: bool) { self.is_curved = curved; }

    pub fn get_zoom(&self) -> f64 {
        self.zoom
    }

    pub fn zoom_in(&mut self) -> f64 {
        self.zoom *= 1.15;
        self.dirty = true;
        self.zoom
    }

    pub fn zoom_out(&mut self) -> f64 {
        self.zoom /= 1.15;
        self.dirty = true;
        self.zoom
    }

    pub fn reset_view(&mut self) -> f64 {
        self.zoom = 1.0;
        self.offset_x = 0.0;
        self.offset_y = 0.0;
        self.dirty = true;
        self.zoom
    }

    pub fn screen_to_world_x(&self, sx: f64) -> f64 {
        (sx - self.offset_x) / self.zoom
    }

    pub fn screen_to_world_y(&self, sy: f64) -> f64 {
        (sy - self.offset_y) / self.zoom
    }
    // ── Gesture Detection ────────────────────────────────────────────────────
    fn is_scratch_gesture(&self, stroke: &Element) -> bool {
        // A scratch needs a decent amount of points
        if stroke.points.len() < 20 {
            return false;
        }
        
        let mut path_length = 0.0;
        let mut reversals_x = 0;
        let mut reversals_y = 0;
        
        let mut last_dx: f64 = 0.0;
        let mut last_dy: f64 = 0.0;

        for i in 1..stroke.points.len() {
            let p1 = stroke.points[i - 1];
            let p2 = stroke.points[i];
            
            let dx = p2.0 - p1.0;
            let dy = p2.1 - p1.1;
            
            path_length += (dx * dx + dy * dy).sqrt();
            
            // Track direction changes, ignoring tiny jitters
            if dx.abs() > 1.0 {
                if last_dx != 0.0 && dx.signum() != last_dx.signum() {
                    reversals_x += 1;
                }
                last_dx = dx;
            }
            if dy.abs() > 1.0 {
                if last_dy != 0.0 && dy.signum() != last_dy.signum() {
                    reversals_y += 1;
                }
                last_dy = dy;
            }
        }
        
        let bb_diag = (stroke.w * stroke.w + stroke.h * stroke.h).sqrt().max(1.0);
        
        // Cursive writing creates a wide bounding box, so path_length / bb_diag is low (1.5 - 3.0).
        // A scribble concentrates a huge path length into a small bounding box.
        let density = path_length / bb_diag;
        
        // A true scratch has high density AND many back-and-forth strokes.
        let is_dense = density > 5.0;
        let has_many_reversals = reversals_x > 7 || reversals_y > 7;
        
        is_dense && has_many_reversals
    }

    // ── Mouse & Interaction Events ───────────────────────────────────────────
    pub fn on_mouse_down(&mut self, raw_x: f64, raw_y: f64) {
        // Safety: If a previous stroke was not committed via on_mouse_up (e.g. lost
        // pointerUp event from tablet driver double-fire or stylus leaving active area),
        // commit it now — but ONLY if the stroke is substantial (≥2 points and a
        // bounding box of at least 2×2 world-px). Degenerate micro-strokes caused by
        // synthetic events or accidental taps must be silently discarded; committing
        // them creates phantom elements that get selected and connected to the next
        // stroke, producing the erratic triangular artifacts seen with Wacom/Gaemon tablets.
        if let Some(old_stroke) = self.active_stroke.take() {
            let is_substantial = old_stroke.points.len() >= 2
                && old_stroke.w >= 2.0
                && old_stroke.h >= 2.0;
            if is_substantial {
                if old_stroke.kind == "LaserPen" {
                    self.laser_strokes.push(old_stroke);
                } else if old_stroke.kind == "MagicPen" {
                    self.magic_strokes.push(old_stroke);
                } else {
                    self.save_state();
                    self.elements.push(old_stroke);
                }
            }
            // else: degenerate stub — discard silently
        }

        let wx = self.screen_to_world_x(raw_x);
        let wy = self.screen_to_world_y(raw_y);

        self.last_mouse_x = raw_x;
        self.last_mouse_y = raw_y;

        if self.tool == Tool::Hand {
            self.is_panning = true;
            return;
        }

        // Eraser: save state ONCE at drag start, then erase immediately
        if self.tool == Tool::Eraser {
            self.is_drawing = true;
            self.save_state(); // P0 fix: state saved BEFORE mutation
            self.erase_at_world(wx, wy);
            return;
        }

        self.is_drawing = true;

        if self.tool == Tool::Select {
            let hit = self.elements.iter().rev().find(|el| {
                wx >= el.x && wx <= el.x + el.w && wy >= el.y && wy <= el.y + el.h
            }).map(|el| el.id);
            if let Some(id) = hit {
                self.selected_id = Some(id);
                // Calculate drag offset so element doesn't jump to cursor position
                if let Some(el) = self.elements.iter().find(|e| e.id == id) {
                    self.drag_offset_x = wx - el.x;
                    self.drag_offset_y = wy - el.y;
                }
                self.is_dragging = true;
            } else {
                self.selected_id = None;
                self.is_dragging = false;
            }
            self.dirty = true;
            return;
        }

        let kind = match self.tool {
            Tool::FreeDraw    => "FreeDraw",
            Tool::FountainPen => "FountainPen",
            Tool::Highlighter => "Highlighter",
            Tool::Rectangle   => "Rectangle",
            Tool::Ellipse     => "Ellipse",
            Tool::Line        => "Line",
            Tool::Arrow       => "Arrow",
            Tool::MagicPen    => "MagicPen",
            Tool::LaserPen    => "LaserPen",
            _ => "FreeDraw",
        }.to_string();

        let id = self.next_id;
        self.next_id += 1;

        // LaserPen strokes start with font_size = 1.0 (used as alpha 0→1 countdown)
        let initial_font_size = if self.tool == Tool::LaserPen { 1.0 } else { 14.0 };

        let new_el = Element {
            id,
            kind,
            points: vec![(wx, wy)],
            x: wx,
            y: wy,
            w: 1.0,
            h: 1.0,
            stroke_color: self.stroke_color.clone(),
            fill_color: self.fill_color.clone(),
            stroke_width: self.stroke_width,
            text: String::new(),
            font_size: initial_font_size,
            font_family: "sans-serif".to_string(),
            asset_id: None,
            code: None,
            svg: None,
            hit_map_json: None,
            is_rough: self.is_rough,
            is_curved: self.is_curved,
        };

        self.active_stroke = Some(new_el);
        self.dirty = true;
    }

    /// Erase any element whose points fall within the eraser radius at (wx, wy) in world coords.
    /// Note: save_state() must be called BEFORE calling this (at start of erase drag).
    fn erase_at_world(&mut self, wx: f64, wy: f64) {
        let radius = (self.eraser_radius / self.zoom).max(4.0);
        let r2 = radius * radius;
        
        self.elements.retain(|el| {
            // Bounding-box quick reject
            if wx + radius < el.x || wx - radius > el.x + el.w
            || wy + radius < el.y || wy - radius > el.y + el.h {
                return true;
            }
            
            // Bounding-box erase for filled/boundary shapes and Lines/Arrows
            if matches!(el.kind.as_str(), "Image" | "Text" | "Rectangle" | "Ellipse" | "Line" | "Arrow") {
                self.dirty = true;
                return false;
            }
            
            // Point-level test for freehand strokes
            let hit = el.points.iter().any(|p| {
                let dx = p.0 - wx;
                let dy = p.1 - wy;
                dx * dx + dy * dy <= r2
            });
            
            if hit { self.dirty = true; }
            !hit
        });
    }

    pub fn on_mouse_move(&mut self, raw_x: f64, raw_y: f64) {
        if self.is_panning {
            self.offset_x += raw_x - self.last_mouse_x;
            self.offset_y += raw_y - self.last_mouse_y;
            self.last_mouse_x = raw_x;
            self.last_mouse_y = raw_y;
            self.dirty = true;
            return;
        }

        // Handle select-tool drag
        if self.is_dragging {
            let wx = self.screen_to_world_x(raw_x);
            let wy = self.screen_to_world_y(raw_y);
            if let Some(id) = self.selected_id {
                if let Some(el) = self.elements.iter_mut().find(|e| e.id == id) {
                    let new_x = wx - self.drag_offset_x;
                    let new_y = wy - self.drag_offset_y;
                    let dx = new_x - el.x;
                    let dy = new_y - el.y;
                    el.x = new_x;
                    el.y = new_y;
                    // Shift all points by the same delta
                    for p in el.points.iter_mut() {
                        p.0 += dx;
                        p.1 += dy;
                    }
                    self.dirty = true;
                }
            }
            self.last_mouse_x = raw_x;
            self.last_mouse_y = raw_y;
            return;
        }

        if !self.is_drawing { return; }

        let wx = self.screen_to_world_x(raw_x);
        let wy = self.screen_to_world_y(raw_y);

        // Eraser: keep erasing as the cursor moves
        if self.tool == Tool::Eraser {
            self.erase_at_world(wx, wy);
            return;
        }

        if let Some(ref mut stroke) = self.active_stroke {
            match stroke.kind.as_str() {
                // Shape tools: only keep [start, current] for a clean live preview
                "Rectangle" | "Ellipse" | "Line" | "Arrow" => {
                    let start = stroke.points[0];
                    stroke.points = vec![start, (wx, wy)];
                    stroke.x = start.0.min(wx);
                    stroke.y = start.1.min(wy);
                    stroke.w = (wx - start.0).abs().max(1.0);
                    stroke.h = (wy - start.1).abs().max(1.0);
                }
                // Freehand tools: accumulate all points for smooth stroke
                _ => {
                    stroke.points.push((wx, wy));
                    let min_x = stroke.points.iter().map(|p| p.0).fold(f64::INFINITY, f64::min);
                    let min_y = stroke.points.iter().map(|p| p.1).fold(f64::INFINITY, f64::min);
                    let max_x = stroke.points.iter().map(|p| p.0).fold(f64::NEG_INFINITY, f64::max);
                    let max_y = stroke.points.iter().map(|p| p.1).fold(f64::NEG_INFINITY, f64::max);
                    stroke.x = min_x;
                    stroke.y = min_y;
                    stroke.w = (max_x - min_x).max(1.0);
                    stroke.h = (max_y - min_y).max(1.0);
                }
            }
            self.dirty = true;
        }
    }

    pub fn on_mouse_up(&mut self, raw_x: f64, raw_y: f64) {
        // Save state when a drag-move completes (element was moved)
        if self.is_dragging {
            self.save_state();
        }
        self.on_mouse_move(raw_x, raw_y);
        self.is_drawing = false;
        self.is_panning = false;
        self.is_dragging = false;

        if let Some(stroke) = self.active_stroke.take() {
            // Only commit strokes that are substantial — at least 2 points with a
            // bounding box ≥2×2. This prevents phantom single-point elements from
            // accidental taps or synthetic stylus events.
            let is_substantial = stroke.points.len() >= 2
                && stroke.w >= 2.0
                && stroke.h >= 2.0;
            if is_substantial {
                // ── Scratch-to-erase detection ────────────────────────────────
                // If this is a FreeDraw stroke with rapid back-and-forth motion
                // (high direction reversal count relative to its bounding area),
                // treat it as a "scratch" erase gesture instead of a normal stroke.
                if stroke.kind == "FreeDraw" && self.is_scratch_gesture(&stroke) {
                    self.save_state();
                    // Erase all elements that overlap the scratch bounding box
                    let sx = stroke.x;
                    let sy = stroke.y;
                    let sw = stroke.w;
                    let sh = stroke.h;
                    self.elements.retain(|el| {
                        // AABB overlap test
                        let overlaps = el.x < sx + sw
                            && el.x + el.w > sx
                            && el.y < sy + sh
                            && el.y + el.h > sy;
                        !overlaps
                    });
                    self.dirty = true;
                    // Scratch stroke itself is NOT committed — it disappears
                } else if stroke.kind == "LaserPen" {
                    self.laser_strokes.push(stroke);
                } else if stroke.kind == "MagicPen" {
                    self.magic_strokes.push(stroke);
                } else {
                    self.save_state();
                    self.elements.push(stroke);
                }
                self.dirty = true;
            }
        }
    }

    pub fn on_double_click(&mut self, raw_x: f64, raw_y: f64) -> Option<String> {
        let wx = self.screen_to_world_x(raw_x);
        let wy = self.screen_to_world_y(raw_y);

        if let Some(el) = self.elements.iter().rev().find(|e| {
            wx >= e.x && wx <= e.x + e.w && wy >= e.y && wy <= e.y + e.h
        }) {
            self.selected_id = Some(el.id);
            return Some(el.id.to_string());
        }
        None
    }

    pub fn on_wheel(&mut self, dx: f64, dy: f64, ctrl: bool, sx: f64, sy: f64) -> f64 {
        if ctrl {
            let zoom_factor = if dy < 0.0 { 1.1 } else { 0.9 };
            let old_zoom = self.zoom;
            self.zoom = (self.zoom * zoom_factor).clamp(0.1, 10.0);
            self.offset_x = sx - (sx - self.offset_x) * (self.zoom / old_zoom);
            self.offset_y = sy - (sy - self.offset_y) * (self.zoom / old_zoom);
        } else {
            self.offset_x -= dx;
            self.offset_y -= dy;
        }
        self.dirty = true;
        self.zoom
    }

    // ── Animation Tick (called every rAF frame by the React loop) ────────────
    /// Returns true if there are still animations running (e.g. laser fade).
    pub fn tick_animations(&mut self) -> bool {
        let mut has_animations = false;

        // Fade out laser strokes by reducing their alpha over time
        if !self.laser_strokes.is_empty() {
            for stroke in &mut self.laser_strokes {
                // Decrease alpha encoded in the stroke color, or just shrink them
                // We track fade via a dedicated field: reuse `font_size` as alpha (1.0 → 0.0)
                stroke.font_size -= 0.04; // ~25 frames to fully fade at 60fps
            }
            // Remove fully faded strokes
            self.laser_strokes.retain(|s| s.font_size > 0.0);
            self.dirty = true;
            has_animations = true;
        }

        // Render if anything changed
        if self.dirty {
            self.render();
            self.dirty = false;
        }

        has_animations
    }

    pub fn set_dpr(&mut self, dpr: f64) {
        self.dpr = dpr;
        self.dirty = true;
    }

    // ── Rendering Loop ────────────────────────────────────────────────────────
    pub fn render(&mut self) {
        let width = self.canvas.width() as f64;
        let height = self.canvas.height() as f64;

        // Clear canvas
        let bg_color = if self.is_dark_mode { "#000000" } else { "#ffffff" };
        self.ctx.set_fill_style_str(bg_color);
        self.ctx.clear_rect(0.0, 0.0, width, height);
        self.ctx.fill_rect(0.0, 0.0, width, height);

        self.ctx.save();
        self.ctx.scale(self.dpr, self.dpr).unwrap();
        self.ctx.translate(self.offset_x, self.offset_y).unwrap();
        self.ctx.scale(self.zoom, self.zoom).unwrap();

        // Draw grid
        if self.grid_type == "dots" {
            self.ctx.set_fill_style_str(if self.is_dark_mode { "#333333" } else { "#cbd5e1" });
            let step = 30.0;
            let start_x = ((self.screen_to_world_x(0.0) / step).floor() * step) as i32;
            let end_x = ((self.screen_to_world_x(width) / step).ceil() * step) as i32;
            let start_y = ((self.screen_to_world_y(0.0) / step).floor() * step) as i32;
            let end_y = ((self.screen_to_world_y(height) / step).ceil() * step) as i32;

            for gx in (start_x..=end_x).step_by(step as usize) {
                for gy in (start_y..=end_y).step_by(step as usize) {
                    self.ctx.begin_path();
                    let _ = self.ctx.arc(gx as f64, gy as f64, 1.2, 0.0, std::f64::consts::TAU);
                    self.ctx.fill();
                }
            }
        } else if self.grid_type == "lines" {
            self.ctx.set_stroke_style_str(if self.is_dark_mode { "#222222" } else { "#e2e8f0" });
            self.ctx.set_line_width(1.0 / self.zoom);
            let step = 30.0;
            let start_x = ((self.screen_to_world_x(0.0) / step).floor() * step) as i32;
            let end_x = ((self.screen_to_world_x(width) / step).ceil() * step) as i32;
            let start_y = ((self.screen_to_world_y(0.0) / step).floor() * step) as i32;
            let end_y = ((self.screen_to_world_y(height) / step).ceil() * step) as i32;

            self.ctx.begin_path();
            for gx in (start_x..=end_x).step_by(step as usize) {
                self.ctx.move_to(gx as f64, start_y as f64);
                self.ctx.line_to(gx as f64, end_y as f64);
            }
            for gy in (start_y..=end_y).step_by(step as usize) {
                self.ctx.move_to(start_x as f64, gy as f64);
                self.ctx.line_to(end_x as f64, gy as f64);
            }
            self.ctx.stroke();
        }

        // Draw stored elements
        for el in &self.elements {
            self.render_element(el);
        }

        // Draw active stroke
        if let Some(ref stroke) = self.active_stroke {
            self.render_element(stroke);
        }

        // Draw laser strokes
        for stroke in &self.laser_strokes {
            self.render_element(stroke);
        }

        // Draw magic strokes until converted
        for stroke in &self.magic_strokes {
            self.render_element(stroke);
        }

        // Draw selection box — only visible when the Select tool is active
        if self.tool == Tool::Select {
            if let Some(id) = self.selected_id {
                if let Some(el) = self.elements.iter().find(|e| e.id == id) {
                    self.ctx.set_stroke_style_str("#3b82f6");
                    self.ctx.set_line_width(1.5 / self.zoom);
                    let _ = self.ctx.stroke_rect(el.x - 4.0, el.y - 4.0, el.w + 8.0, el.h + 8.0);
                }
            }
        }

        self.ctx.restore();
    }

    fn render_element(&self, el: &Element) {
        if el.points.is_empty() { return; }
        self.ctx.save(); // Bug #1 fix: always save/restore per element to prevent transform leak

        let mut effective_stroke = el.stroke_color.clone();
        let mut effective_fill = el.fill_color.clone();

        // Invert default ink/text color based on theme (like Excalidraw)
        if self.is_dark_mode {
            if effective_stroke == "#1a1a2e" || effective_stroke == "#000000" { effective_stroke = "#f8fafc".to_string(); }
            if effective_fill == "#1a1a2e" || effective_fill == "#000000" { effective_fill = "#f8fafc".to_string(); }
        } else {
            if effective_stroke == "#f8fafc" || effective_stroke == "#ffffff" { effective_stroke = "#000000".to_string(); }
            if effective_fill == "#f8fafc" || effective_fill == "#ffffff" { effective_fill = "#000000".to_string(); }
        }

        self.ctx.set_stroke_style_str(&effective_stroke);
        self.ctx.set_fill_style_str(&effective_fill);
        self.ctx.set_line_width(el.stroke_width);
        self.ctx.set_line_cap("round");
        self.ctx.set_line_join("round");

        match el.kind.as_str() {
            "Rectangle" => {
                let (p0, p1) = (el.points[0], *el.points.last().unwrap());
                let x = p0.0.min(p1.0);
                let y = p0.1.min(p1.1);
                let w = (p1.0 - p0.0).abs().max(1.0);
                let h = (p1.1 - p0.1).abs().max(1.0);
                if el.fill_color != "transparent" && !el.fill_color.is_empty() {
                    self.ctx.fill_rect(x, y, w, h);
                }
                self.ctx.stroke_rect(x, y, w, h);
            }
            "Ellipse" => {
                let (p0, p1) = (el.points[0], *el.points.last().unwrap());
                let cx = (p0.0 + p1.0) / 2.0;
                let cy = (p0.1 + p1.1) / 2.0;
                let rx = ((p1.0 - p0.0).abs() / 2.0).max(1.0);
                let ry = ((p1.1 - p0.1).abs() / 2.0).max(1.0);
                self.ctx.begin_path();
                let _ = self.ctx.ellipse(cx, cy, rx, ry, 0.0, 0.0, std::f64::consts::TAU);
                if el.fill_color != "transparent" && !el.fill_color.is_empty() {
                    self.ctx.fill();
                }
                self.ctx.stroke();
            }
            "Line" => {
                if el.points.len() >= 2 {
                    let p0 = el.points[0];
                    let p1 = *el.points.last().unwrap();
                    self.ctx.begin_path();
                    self.ctx.move_to(p0.0, p0.1);
                    self.ctx.line_to(p1.0, p1.1);
                    self.ctx.stroke();
                }
            }
            "Arrow" => {
                if el.points.len() >= 2 {
                    let p0 = el.points[0];
                    let p1 = *el.points.last().unwrap();
                    let dx = p1.0 - p0.0;
                    let dy = p1.1 - p0.1;
                    let angle = dy.atan2(dx);
                    let head_len = (el.stroke_width * 5.0).max(12.0);

                    // Shaft
                    self.ctx.begin_path();
                    self.ctx.move_to(p0.0, p0.1);
                    self.ctx.line_to(p1.0, p1.1);
                    self.ctx.stroke();

                    // Arrowhead
                    self.ctx.begin_path();
                    self.ctx.move_to(p1.0, p1.1);
                    self.ctx.line_to(
                        p1.0 - head_len * (angle - 0.45).cos(),
                        p1.1 - head_len * (angle - 0.45).sin(),
                    );
                    self.ctx.move_to(p1.0, p1.1);
                    self.ctx.line_to(
                        p1.0 - head_len * (angle + 0.45).cos(),
                        p1.1 - head_len * (angle + 0.45).sin(),
                    );
                    self.ctx.stroke();
                }
            }
            "Text" => {
                let font_str = format!("{:.0}px {}", el.font_size, el.font_family);
                self.ctx.set_font(&font_str);
                self.ctx.set_fill_style_str(&effective_stroke);
                let lines: Vec<&str> = el.text.split('\n').collect();
                let line_height = el.font_size * 1.2;
                for (i, line) in lines.iter().enumerate() {
                    let _ = self.ctx.fill_text(line, el.x, el.y + el.font_size + (i as f64 * line_height));
                }
            }
            "Image" | "Diagram" => {
                if let Some(img) = self.image_cache.get(&el.id) {
                    let _ = self.ctx.draw_image_with_html_image_element_and_dw_and_dh(
                        img, el.x, el.y, el.w, el.h,
                    );
                }
            }
            kind => {
                // FreeDraw, FountainPen, MagicPen, LaserPen, Highlighter
                let is_highlighter = kind == "Highlighter";
                let is_fountain = kind == "FountainPen";
                let is_magic = kind == "MagicPen";
                
                if is_highlighter {
                    self.ctx.set_global_alpha(0.35);
                    self.ctx.set_line_cap("square");
                    self.ctx.set_line_width(el.stroke_width * 6.0);
                }
                // LaserPen: fade using font_size as alpha (1.0 → 0.0), make it glow red
                if kind == "LaserPen" {
                    self.ctx.set_stroke_style_str("#ff0000");
                    self.ctx.set_shadow_color("#ff0000");
                    self.ctx.set_shadow_blur(15.0);
                    self.ctx.set_global_alpha(el.font_size.clamp(0.0, 1.0));
                    self.ctx.set_line_width(el.stroke_width * 1.5);
                }
                
                // MagicPen: purple ink with subtle magical glow
                if is_magic {
                    self.ctx.set_stroke_style_str("#a855f7");
                    self.ctx.set_shadow_color("#a855f7");
                    self.ctx.set_shadow_blur(8.0);
                }

                let pts = &el.points;
                self.ctx.begin_path();
                
                if !is_fountain {
                    self.ctx.move_to(pts[0].0, pts[0].1);
                }

                if pts.len() == 1 {
                    // Single tap: draw a small filled circle
                    let _ = self.ctx.arc(
                        pts[0].0, pts[0].1,
                        (el.stroke_width / 2.0).max(1.0),
                        0.0, std::f64::consts::TAU,
                    );
                    self.ctx.set_fill_style_str(&effective_stroke);
                    self.ctx.fill();
                } else if pts.len() == 2 || !el.is_curved {
                    // Two points or straight mode: plain line
                    if is_fountain {
                        self.ctx.move_to(pts[0].0, pts[0].1);
                    }
                    for p in pts.iter().skip(1) {
                        self.ctx.line_to(p.0, p.1);
                    }
                    self.ctx.stroke();
                } else {
                    if is_fountain {
                        // Calligraphic fountain pen effect (multiple parallel thin strokes)
                        self.ctx.save();
                        self.ctx.set_line_join("miter");
                        self.ctx.set_line_cap("square");
                        let sharpness = self.fountain_sharpness.clamp(0.5, 3.0);
                        let offset = el.stroke_width * 0.25 * sharpness;
                        
                        for i in -2..=2 {
                            let ox = offset * (i as f64);
                            let oy = -offset * (i as f64); // Diagonal offset for flat nib
                            self.ctx.set_line_width(el.stroke_width * 0.4);
                            self.ctx.begin_path();
                            self.ctx.move_to(pts[0].0 + ox, pts[0].1 + oy);
                            
                            for i in 1..pts.len() - 1 {
                                let mx = (pts[i].0 + pts[i + 1].0) / 2.0;
                                let my = (pts[i].1 + pts[i + 1].1) / 2.0;
                                self.ctx.quadratic_curve_to(pts[i].0 + ox, pts[i].1 + oy, mx + ox, my + oy);
                            }
                            let last = pts.last().unwrap();
                            self.ctx.line_to(last.0 + ox, last.1 + oy);
                            self.ctx.stroke();
                        }
                        self.ctx.restore();
                    } else {
                        // Smooth bezier through midpoints (Catmull-Rom style)
                        for i in 1..pts.len() - 1 {
                            let mx = (pts[i].0 + pts[i + 1].0) / 2.0;
                            let my = (pts[i].1 + pts[i + 1].1) / 2.0;
                            self.ctx.quadratic_curve_to(pts[i].0, pts[i].1, mx, my);
                        }
                        let last = pts.last().unwrap();
                        self.ctx.line_to(last.0, last.1);
                        self.ctx.stroke();
                    }
                }

                // Restore alpha if we changed it
                if is_highlighter || kind == "LaserPen" || is_magic {
                    self.ctx.set_global_alpha(1.0);
                    if kind == "LaserPen" || is_magic {
                        self.ctx.set_shadow_blur(0.0);
                    }
                }
            }
        }

        // Reset line width to default after each element (avoids bleed)
        self.ctx.set_line_width(self.stroke_width);
        self.ctx.set_global_alpha(1.0);
        self.ctx.set_shadow_blur(0.0);
        
        self.ctx.restore(); // matches save() at top of this function
    }
}
