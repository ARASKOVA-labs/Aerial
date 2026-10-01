//! Aerial WASM engine.
//!
//! `AerialCanvas` is the JS-facing façade. State lives in focused modules:
//!   scene    — committed elements + spatial index + LOD pyramid + change feeds
//!   history  — diff-based undo/redo transactions
//!   render   — cached static layer, dirty-rect repaint, LOD painting
//!
//! Every cost that used to scale with board size per frame / per action
//! (full redraw on each pointer move, full-board undo snapshots, O(n²) stroke
//! bounds) now scales with what is visible or what changed.

mod element;
mod geom;
mod history;
mod pyramid;
mod render;
mod scene;
mod spatial;

pub use element::Element;
pub use geom::Rect;
pub use pyramid::lod_level as lod_level_for;
pub use scene::Scene;

use std::cell::RefCell;
use std::collections::HashMap;

use serde::{Deserialize, Serialize};
use wasm_bindgen::prelude::*;
use web_sys::{CanvasRenderingContext2d, HtmlCanvasElement, HtmlImageElement};
use yrs::{updates::decoder::Decode, updates::encoder::Encode, Doc, ReadTxn, StateVector, Transact, Update};

use geom::simplify_rdp;
use history::History;
use render::{paint_element, LayerCache, PaintEnv, Theme, View};

pub const MIN_ZOOM: f64 = 0.0005;
pub const MAX_ZOOM: f64 = 64.0;
/// Freehand strokes are simplified on commit to this many CSS px of error.
const COMMIT_SIMPLIFY_PX: f64 = 0.3;
/// Frames of no view change before a sub-pixel pan residual is repainted crisp.
const IDLE_REFINE_FRAMES: u32 = 6;

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

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
pub enum EraserType {
    Stroke,
    Precision,
    Element,
}

#[derive(Deserialize)]
struct SceneIn {
    #[serde(default)]
    elements: Vec<Element>,
}

#[derive(Serialize)]
struct SceneOut<'a> {
    elements: Vec<&'a Element>,
}

fn text_box(text: &str, size: f64) -> (f64, f64) {
    let lines: Vec<&str> = text.split('\n').collect();
    let max_chars = lines.iter().map(|l| l.chars().count()).max().unwrap_or(1);
    ((max_chars as f64 * size * 0.65).max(60.0), (lines.len() as f64 * size * 1.3).max(size * 1.5))
}

#[wasm_bindgen]
pub struct AerialCanvas {
    canvas: HtmlCanvasElement,
    ctx: CanvasRenderingContext2d,
    scene: Scene,
    history: History,
    cache: LayerCache,
    scratch: RefCell<Vec<(f64, f64)>>,
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
    bg_color: Option<String>,
    magic_baseline_y: Option<f64>,
    grid_type: String,
    lod_px: f64,
    dpr: f64,
    zoom: f64,
    offset_x: f64,
    offset_y: f64,
    is_drawing: bool,
    is_panning: bool,
    is_dragging: bool,
    drag_offset_x: f64,
    drag_offset_y: f64,
    is_resizing: bool,
    resize_handle: u8,
    resize_start: (f64, f64),
    resize_orig: Rect,
    resize_orig_points: Vec<(f64, f64)>,
    selection_anim_phase: f64,
    accent_color: String,
    eraser_radius: f64,
    eraser_type: EraserType,
    last_mouse_x: f64,
    last_mouse_y: f64,
    selected_id: Option<u64>,
    needs_render: bool,
    legacy_seen_version: u64,
    last_view: (f64, f64, f64),
    idle_frames: u32,
    last_load_rejected: u32,
    doc: Doc,
}

#[wasm_bindgen]
impl AerialCanvas {
    #[wasm_bindgen(constructor)]
    pub fn new(canvas_id: &str) -> Result<AerialCanvas, JsValue> {
        let window = web_sys::window().ok_or("No global window")?;
        let document = window.document().ok_or("No global document")?;
        let element = document.get_element_by_id(canvas_id).ok_or("Canvas element not found")?;
        let canvas: HtmlCanvasElement = element.dyn_into()?;
        let ctx: CanvasRenderingContext2d = canvas.get_context("2d")?.ok_or("Failed to get 2d context")?.dyn_into()?;

        Ok(AerialCanvas {
            canvas,
            ctx,
            scene: Scene::new(),
            history: History::default(),
            cache: LayerCache::new()?,
            scratch: RefCell::new(Vec::new()),
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
            bg_color: None,
            magic_baseline_y: None,
            grid_type: "dots".to_string(),
            lod_px: 2.0,
            dpr: 1.0,
            zoom: 1.0,
            offset_x: 0.0,
            offset_y: 0.0,
            is_drawing: false,
            is_panning: false,
            is_dragging: false,
            drag_offset_x: 0.0,
            drag_offset_y: 0.0,
            is_resizing: false,
            resize_handle: 0,
            resize_start: (0.0, 0.0),
            resize_orig: Rect::new(0.0, 0.0, 0.0, 0.0),
            resize_orig_points: Vec::new(),
            selection_anim_phase: 0.0,
            accent_color: "#e73f07".to_string(),
            eraser_radius: 24.0,
            eraser_type: EraserType::Stroke,
            last_mouse_x: 0.0,
            last_mouse_y: 0.0,
            selected_id: None,
            needs_render: true,
            legacy_seen_version: 0,
            last_view: (0.0, 0.0, 1.0),
            idle_frames: 0,
            last_load_rejected: 0,
            doc: Doc::new(),
        })
    }

    // ── Tool Selectors ────────────────────────────────────────────────────────
    // Each setter resets in-flight interaction state so switching tools never
    // leaves dangling strokes, selections, or drag operations behind.
    fn reset_interaction_state(&mut self) {
        self.active_stroke = None;
        self.is_drawing = false;
        self.is_panning = false;
        self.is_dragging = false;
        self.is_resizing = false;
        self.resize_handle = 0;
        self.history.commit(&self.scene);
        self.needs_render = true;
    }

    fn switch_tool(&mut self, tool: Tool, keep_selection: bool) {
        self.reset_interaction_state();
        if !keep_selection {
            self.selected_id = None;
        }
        self.tool = tool;
    }

    pub fn set_tool_freedraw(&mut self) { self.switch_tool(Tool::FreeDraw, false); }
    pub fn set_tool_rectangle(&mut self) { self.switch_tool(Tool::Rectangle, false); }
    pub fn set_tool_ellipse(&mut self) { self.switch_tool(Tool::Ellipse, false); }
    pub fn set_tool_line(&mut self) { self.switch_tool(Tool::Line, false); }
    pub fn set_tool_select(&mut self) { self.switch_tool(Tool::Select, true); }
    pub fn set_tool_hand(&mut self) { self.switch_tool(Tool::Hand, false); }
    pub fn set_tool_arrow(&mut self) { self.switch_tool(Tool::Arrow, false); }
    pub fn set_tool_fountain_pen(&mut self) { self.switch_tool(Tool::FountainPen, false); }
    pub fn set_tool_highlighter(&mut self) { self.switch_tool(Tool::Highlighter, false); }
    pub fn set_tool_text(&mut self) { self.switch_tool(Tool::Text, false); }
    pub fn set_tool_eraser(&mut self) { self.switch_tool(Tool::Eraser, false); }
    pub fn set_tool_laser_pen(&mut self) { self.switch_tool(Tool::LaserPen, false); }
    pub fn set_tool_magic_pen(&mut self) {
        self.switch_tool(Tool::MagicPen, false);
        self.magic_baseline_y = None;
    }

    // ── Text & Selection ──────────────────────────────────────────────────────
    pub fn get_selected_text(&self) -> Option<String> {
        let el = self.scene.get(self.selected_id?)?;
        if el.text.is_empty() { None } else { Some(el.text.clone()) }
    }

    pub fn update_selected_text(&mut self, text: String) {
        let Some(id) = self.selected_id else { return };
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
        let c = color.unwrap_or_else(|| self.stroke_color.clone());
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
            stroke_width: self.stroke_width,
            text,
            font_size: size,
            font_family: font_family.unwrap_or_else(|| "Inter, Roboto, sans-serif".to_string()),
            is_rough: self.is_rough,
            is_curved: self.is_curved,
            ..Default::default()
        };
        self.insert_recorded(el);
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

    pub fn get_selected_element_json(&self) -> Option<String> {
        serde_json::to_string(self.scene.get(self.selected_id?)?).ok()
    }

    pub fn set_accent_color(&mut self, color: String) {
        self.accent_color = color;
        self.needs_render = true;
    }

    pub fn get_accent_color(&self) -> String {
        self.accent_color.clone()
    }

    pub fn set_selected_id(&mut self, id: u64) {
        self.selected_id = Some(id);
        self.needs_render = true;
    }

    pub fn deselect(&mut self) {
        self.history.commit(&self.scene);
        self.selected_id = None;
        self.is_resizing = false;
        self.is_dragging = false;
        self.needs_render = true;
    }

    pub fn scale_selected(&mut self, factor: f64) {
        if !(factor.is_finite() && factor > 0.0) {
            return;
        }
        let Some(id) = self.selected_id else { return };
        if !self.scene.contains(id) {
            return;
        }
        self.history.begin();
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
        self.history.commit(&self.scene);
    }

    pub fn get_element_at(&self, raw_x: f64, raw_y: f64) -> Option<String> {
        let id = self.scene.hit_test(self.screen_to_world_x(raw_x), self.screen_to_world_y(raw_y), 8.0)?;
        serde_json::to_string(self.scene.get(id)?).ok()
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
        self.selected_id = None;
        self.needs_render = true;
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

    pub fn delete_selected(&mut self) {
        let Some(id) = self.selected_id else { return };
        self.history.begin();
        self.history.touch(&self.scene, id);
        self.scene.remove(id);
        self.history.commit(&self.scene);
        self.selected_id = None;
        self.needs_render = true;
    }

    /// Deprecated no-op kept for API compatibility. Every mutating engine call
    /// now records its own undo transaction.
    pub fn save_state(&mut self) {}

    pub fn undo(&mut self) -> bool {
        let changed = self.history.undo(&mut self.scene);
        if changed {
            self.selected_id = None;
            self.needs_render = true;
        }
        changed
    }

    pub fn redo(&mut self) -> bool {
        let changed = self.history.redo(&mut self.scene);
        if changed {
            self.selected_id = None;
            self.needs_render = true;
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
            self.eraser_radius = r.clamp(4.0, 2_000.0);
        }
    }

    pub fn set_eraser_size(&mut self, s: f64) {
        self.set_eraser_radius(s / 2.0);
    }

    pub fn set_eraser_type(&mut self, t: &str) {
        self.eraser_type = match t.to_lowercase().as_str() {
            "precision" | "pixel" => EraserType::Precision,
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

    // ── Images & Diagrams ─────────────────────────────────────────────────────
    pub fn add_image(&mut self, img: HtmlImageElement, x: f64, y: f64, w: f64, h: f64, asset_id: String) {
        let id = self.scene.alloc_id();
        self.image_cache.insert(id, img);
        self.insert_recorded(Element {
            id,
            kind: "Image".to_string(),
            points: vec![(x, y)],
            x,
            y,
            w,
            h,
            stroke_color: "transparent".to_string(),
            stroke_width: 0.0,
            asset_id: Some(asset_id),
            is_curved: false,
            ..Default::default()
        });
    }

    #[allow(clippy::too_many_arguments)]
    pub fn add_diagram(&mut self, img: HtmlImageElement, x: f64, y: f64, w: f64, h: f64, code: String, svg: String, hit_map_str: String) {
        let id = self.scene.alloc_id();
        self.image_cache.insert(id, img);
        self.insert_recorded(Element {
            id,
            kind: "Diagram".to_string(),
            points: vec![(x, y)],
            x,
            y,
            w,
            h,
            stroke_color: "transparent".to_string(),
            stroke_width: 0.0,
            code: Some(code),
            svg: Some(svg),
            hit_map_json: Some(hit_map_str),
            is_curved: false,
            ..Default::default()
        });
    }

    pub fn set_cached_image(&mut self, id: u64, img: HtmlImageElement) {
        self.image_cache.insert(id, img);
        self.scene.touch_visual(id);
        self.needs_render = true;
    }

    /// `[[element_id, asset_id], ...]` for elements backed by stored assets, so
    /// the host can preload images without parsing the whole scene JSON.
    pub fn get_asset_refs(&self) -> String {
        let refs: Vec<(u64, &str)> =
            self.scene.iter_ordered().filter_map(|e| e.asset_id.as_deref().map(|a| (e.id, a))).collect();
        serde_json::to_string(&refs).unwrap_or_else(|_| "[]".to_string())
    }

    pub fn get_element_code(&self, id: u64) -> Option<String> {
        self.scene.get(id).and_then(|e| e.code.clone())
    }

    // ── Scene State & Persistence ─────────────────────────────────────────────
    pub fn get_scene_json(&self) -> String {
        let out = SceneOut { elements: self.scene.iter_ordered().collect() };
        serde_json::to_string(&out).unwrap_or_else(|_| r#"{"elements":[]}"#.to_string())
    }

    /// Replaces the board. Input is untrusted: malformed JSON is ignored and
    /// invalid elements are dropped (see `last_load_rejected`).
    pub fn load_scene_json(&mut self, json: &str) {
        let Ok(state) = serde_json::from_str::<SceneIn>(json) else { return };
        self.reset_interaction_state();
        self.last_load_rejected = self.scene.load(state.elements) as u32;
        self.history.clear();
        self.selected_id = None;
        self.legacy_seen_version = self.scene.version();
        self.needs_render = true;
    }

    /// Number of elements dropped by validation in the last `load_scene_json`.
    pub fn last_load_rejected(&self) -> u32 {
        self.last_load_rejected
    }

    pub fn export_full_state(&self) -> Vec<u8> {
        self.get_scene_json().into_bytes()
    }

    pub fn import_full_state(&mut self, bytes: &[u8]) {
        if let Ok(json) = std::str::from_utf8(bytes) {
            self.load_scene_json(json);
        }
    }

    /// Monotonic scene revision. Each consumer stores the last value it
    /// handled; unlike `check_and_clear_dirty` it is safe with many consumers.
    pub fn scene_version(&self) -> f64 {
        self.scene.version() as f64
    }

    pub fn element_count(&self) -> u32 {
        self.scene.len() as u32
    }

    /// Drains changes since the previous call as
    /// `{"reset":bool,"upserts":[Element],"deletes":[id]}` — O(changed), so
    /// autosave cost no longer grows with board size.
    pub fn take_changes(&mut self) -> String {
        self.scene.take_changes_json()
    }

    pub fn has_pending_changes(&self) -> bool {
        self.scene.has_pending_changes()
    }

    /// Deprecated: returns whether the scene changed since the last call.
    /// Prefer `scene_version()`, which supports multiple independent readers.
    pub fn check_and_clear_dirty(&mut self) -> bool {
        let v = self.scene.version();
        let changed = v != self.legacy_seen_version;
        self.legacy_seen_version = v;
        changed
    }

    // ── Experimental CRDT hooks ───────────────────────────────────────────────
    // The Yrs document is not yet bound to scene elements; these calls exchange
    // an empty document and exist only to keep the published API stable.
    pub fn get_local_state_vector(&self) -> Vec<u8> {
        self.doc.transact().state_vector().encode_v1()
    }

    pub fn process_incoming_packet(&mut self, packet: &[u8]) -> Option<Vec<u8>> {
        self.apply_remote_delta(packet);
        None
    }

    pub fn export_delta_update(&self, remote_sv: &[u8]) -> Vec<u8> {
        match StateVector::decode_v1(remote_sv) {
            Ok(sv) => self.doc.transact().encode_diff_v1(&sv),
            Err(_) => Vec::new(),
        }
    }

    pub fn apply_remote_delta(&mut self, bytes: &[u8]) {
        if let Ok(update) = Update::decode_v1(bytes) {
            let mut txn = self.doc.transact_mut();
            txn.apply_update(update);
        }
    }

    // ── Appearance & Viewport ─────────────────────────────────────────────────
    pub fn set_dark_mode(&mut self, is_dark: bool) {
        self.is_dark_mode = is_dark;
        self.bg_color = None;
        self.needs_render = true;
    }

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

    pub fn set_fountain_sharpness(&mut self, s: f64) {
        if s.is_finite() {
            self.fountain_sharpness = s;
            self.cache.invalidate();
            self.needs_render = true;
        }
    }
    pub fn set_stroke_color(&mut self, c: &str) {
        if c.len() <= element::MAX_COLOR_LEN {
            self.stroke_color = c.to_string();
        }
    }
    pub fn set_fill_color(&mut self, c: &str) {
        if c.len() <= element::MAX_COLOR_LEN {
            self.fill_color = c.to_string();
        }
    }
    pub fn set_stroke_width(&mut self, w: f64) {
        if w.is_finite() {
            self.stroke_width = w.clamp(0.1, element::MAX_STROKE_WIDTH);
        }
    }
    pub fn set_is_rough(&mut self, rough: bool) { self.is_rough = rough; }
    pub fn set_is_curved(&mut self, curved: bool) { self.is_curved = curved; }

    pub fn get_zoom(&self) -> f64 {
        self.zoom
    }

    pub fn zoom_in(&mut self) -> f64 {
        self.zoom = (self.zoom * 1.15).clamp(MIN_ZOOM, MAX_ZOOM);
        self.needs_render = true;
        self.zoom
    }

    pub fn zoom_out(&mut self) -> f64 {
        self.zoom = (self.zoom / 1.15).clamp(MIN_ZOOM, MAX_ZOOM);
        self.needs_render = true;
        self.zoom
    }

    pub fn reset_view(&mut self) -> f64 {
        self.zoom = 1.0;
        self.offset_x = 0.0;
        self.offset_y = 0.0;
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

    // ── Pointer Input ─────────────────────────────────────────────────────────
    pub fn on_mouse_down(&mut self, raw_x: f64, raw_y: f64) {
        // A previous stroke may be uncommitted if pointerup was lost (tablet
        // driver double-fire, stylus leaving the digitiser) — commit it now.
        self.commit_active_stroke();
        self.history.commit(&self.scene);

        let (wx, wy) = (self.screen_to_world_x(raw_x), self.screen_to_world_y(raw_y));
        self.last_mouse_x = raw_x;
        self.last_mouse_y = raw_y;
        self.needs_render = true;

        if self.tool == Tool::Hand {
            self.is_panning = true;
            return;
        }

        if self.tool == Tool::Eraser {
            self.is_drawing = true;
            self.history.begin();
            self.erase_at_world(wx, wy);
            return;
        }

        self.is_drawing = true;

        if self.tool == Tool::Select {
            self.begin_select_interaction(wx, wy);
            return;
        }

        let kind = match self.tool {
            Tool::FountainPen => "FountainPen",
            Tool::Highlighter => "Highlighter",
            Tool::Rectangle => "Rectangle",
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

        self.active_stroke = Some(Element {
            id: self.scene.alloc_id(),
            kind: kind.to_string(),
            points: vec![(wx, wy)],
            x: wx,
            y: wy,
            w: 1.0,
            h: 1.0,
            stroke_color: self.stroke_color.clone(),
            fill_color: self.fill_color.clone(),
            stroke_width: self.stroke_width,
            // LaserPen reuses font_size as its fade-out alpha (1.0 → 0.0).
            font_size: if self.tool == Tool::LaserPen { 1.0 } else { 14.0 },
            is_rough: self.is_rough,
            is_curved: self.is_curved,
            ..Default::default()
        });
    }

    pub fn on_mouse_move(&mut self, raw_x: f64, raw_y: f64) {
        if self.is_panning {
            self.offset_x += raw_x - self.last_mouse_x;
            self.offset_y += raw_y - self.last_mouse_y;
            self.last_mouse_x = raw_x;
            self.last_mouse_y = raw_y;
            self.needs_render = true;
            return;
        }

        let (wx, wy) = (self.screen_to_world_x(raw_x), self.screen_to_world_y(raw_y));

        if self.is_resizing {
            self.apply_resize(wx, wy);
            self.last_mouse_x = raw_x;
            self.last_mouse_y = raw_y;
            return;
        }

        if self.is_dragging {
            if let Some(id) = self.selected_id {
                let (nx, ny) = (wx - self.drag_offset_x, wy - self.drag_offset_y);
                self.scene.modify(id, |el| {
                    let (dx, dy) = (nx - el.x, ny - el.y);
                    el.x = nx;
                    el.y = ny;
                    for p in el.points.iter_mut() {
                        p.0 += dx;
                        p.1 += dy;
                    }
                });
                self.needs_render = true;
            }
            self.last_mouse_x = raw_x;
            self.last_mouse_y = raw_y;
            return;
        }

        if !self.is_drawing {
            return;
        }

        if self.tool == Tool::Eraser {
            self.erase_at_world(wx, wy);
            return;
        }

        let baseline = self.magic_baseline_y;
        if let Some(stroke) = self.active_stroke.as_mut() {
            match stroke.kind.as_str() {
                "Rectangle" | "Ellipse" | "Line" | "Arrow" => {
                    let start = stroke.points[0];
                    stroke.points = vec![start, (wx, wy)];
                    stroke.x = start.0.min(wx);
                    stroke.y = start.1.min(wy);
                    stroke.w = (wx - start.0).abs().max(1.0);
                    stroke.h = (wy - start.1).abs().max(1.0);
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
                    // Incremental bounds: O(1) per point instead of rescanning
                    // the whole stroke (which made long strokes O(n²)).
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
    }

    pub fn on_mouse_up(&mut self, raw_x: f64, raw_y: f64) {
        self.on_mouse_move(raw_x, raw_y);
        self.is_drawing = false;
        self.is_panning = false;
        self.is_dragging = false;
        self.is_resizing = false;
        self.resize_handle = 0;
        self.resize_orig_points.clear();
        self.commit_active_stroke();
        self.history.commit(&self.scene);
        self.needs_render = true;
    }

    pub fn on_double_click(&mut self, raw_x: f64, raw_y: f64) -> Option<String> {
        let id = self.scene.hit_test(self.screen_to_world_x(raw_x), self.screen_to_world_y(raw_y), 8.0)?;
        self.selected_id = Some(id);
        self.needs_render = true;
        Some(id.to_string())
    }

    pub fn on_wheel(&mut self, dx: f64, dy: f64, ctrl: bool, sx: f64, sy: f64) -> f64 {
        if !(dx.is_finite() && dy.is_finite() && sx.is_finite() && sy.is_finite()) {
            return self.zoom;
        }
        if ctrl {
            let factor = if dy < 0.0 { 1.1 } else { 0.9 };
            let old = self.zoom;
            self.zoom = (self.zoom * factor).clamp(MIN_ZOOM, MAX_ZOOM);
            self.offset_x = sx - (sx - self.offset_x) * (self.zoom / old);
            self.offset_y = sy - (sy - self.offset_y) * (self.zoom / old);
        } else {
            self.offset_x -= dx;
            self.offset_y -= dy;
        }
        self.needs_render = true;
        self.zoom
    }

    // ── Frame loop ────────────────────────────────────────────────────────────
    /// Called every animation frame. Renders only when something changed.
    /// Returns true while animations (laser fade, selection marching ants) run.
    pub fn tick_animations(&mut self) -> bool {
        let mut animating = false;

        if self.tool == Tool::Select && self.selected_id.is_some() {
            self.selection_anim_phase = (self.selection_anim_phase + 0.6) % 1000.0;
            self.needs_render = true;
            animating = true;
        }

        if !self.laser_strokes.is_empty() {
            for stroke in &mut self.laser_strokes {
                stroke.font_size -= 0.04; // ~25 frames to fully fade at 60fps
            }
            self.laser_strokes.retain(|s| s.font_size > 0.0);
            self.needs_render = true;
            animating = true;
        }

        // After panning stops, repaint once at the exact offset so the static
        // layer is never left resampled at a sub-pixel position.
        let view = (self.offset_x, self.offset_y, self.zoom);
        if view == self.last_view {
            self.idle_frames = self.idle_frames.saturating_add(1);
            if self.idle_frames == IDLE_REFINE_FRAMES {
                let (rx, ry) = self.cache.residual(&self.current_view());
                if rx.abs() > 1e-3 || ry.abs() > 1e-3 {
                    self.cache.invalidate();
                    self.needs_render = true;
                }
            }
        } else {
            self.idle_frames = 0;
            self.last_view = view;
        }

        if self.needs_render || self.scene.has_pending_dirty() {
            self.render();
        }
        animating
    }

    pub fn set_dpr(&mut self, dpr: f64) {
        if dpr.is_finite() && dpr > 0.0 {
            self.dpr = dpr.min(8.0);
            self.needs_render = true;
        }
    }

    /// Render statistics as JSON (for perf HUDs and benchmarks).
    pub fn get_render_stats(&self) -> String {
        serde_json::to_string(&self.cache.stats).unwrap_or_else(|_| "{}".to_string())
    }

    pub fn render(&mut self) {
        let t0 = web_sys::window().and_then(|w| w.performance()).map(|p| p.now());
        let view = self.current_view();
        if view.w < 1.0 || view.h < 1.0 {
            return;
        }
        let (bg, is_dark) = self.background();
        let theme = Theme { is_dark, bg: bg.clone(), grid: self.grid_type.clone(), lod_px: self.lod_px };
        let exclude = if self.is_dragging || self.is_resizing { self.selected_id } else { None };
        let env = PaintEnv {
            images: &self.image_cache,
            fountain_sharpness: self.fountain_sharpness,
            is_dark,
            zoom: self.zoom,
            scratch: &self.scratch,
        };

        self.cache.update(&mut self.scene, view, &theme, exclude, &env);
        let (rx, ry) = self.cache.residual(&view);
        let static_layer = self.cache.canvas();

        let ctx = &self.ctx;
        ctx.save();
        let _ = ctx.set_transform(1.0, 0.0, 0.0, 1.0, 0.0, 0.0);
        ctx.clear_rect(0.0, 0.0, view.w, view.h);
        if bg != "transparent" && (rx != 0.0 || ry != 0.0) {
            ctx.set_fill_style_str(&bg);
            ctx.fill_rect(0.0, 0.0, view.w, view.h);
        }
        let _ = ctx.draw_image_with_html_canvas_element(static_layer, rx, ry);
        view.apply(ctx);

        self.paint_magic_guidelines(is_dark, view.w / view.dpr, view.h / view.dpr);
        if let Some(el) = exclude.and_then(|id| self.scene.get(id)) {
            paint_element(ctx, el, &env, false);
        }
        if let Some(stroke) = &self.active_stroke {
            paint_element(ctx, stroke, &env, false);
        }
        for stroke in self.laser_strokes.iter().chain(self.magic_strokes.iter()) {
            paint_element(ctx, stroke, &env, false);
        }
        if self.tool == Tool::Select {
            self.paint_selection();
        }
        self.ctx.restore();
        self.needs_render = false;
        if let (Some(t0), Some(t1)) = (t0, web_sys::window().and_then(|w| w.performance()).map(|p| p.now())) {
            self.cache.stats.last_frame_ms = t1 - t0;
        }
    }
}

// ── Internal helpers (not exported to JS) ───────────────────────────────────
impl AerialCanvas {
    fn current_view(&self) -> View {
        View {
            off_x: self.offset_x,
            off_y: self.offset_y,
            zoom: self.zoom,
            dpr: self.dpr,
            w: self.canvas.width() as f64,
            h: self.canvas.height() as f64,
        }
    }

    fn background(&self) -> (String, bool) {
        match &self.bg_color {
            Some(c) => (c.clone(), !c.starts_with("#f") && !c.starts_with("#F") && c != "white"),
            None => ((if self.is_dark_mode { "#0a0a0a" } else { "#ffffff" }).to_string(), self.is_dark_mode),
        }
    }

    fn insert_recorded(&mut self, el: Element) {
        self.history.commit(&self.scene);
        self.history.begin();
        self.history.touch(&self.scene, el.id);
        self.scene.upsert(el);
        self.history.commit(&self.scene);
        self.needs_render = true;
    }

    fn commit_active_stroke(&mut self) {
        let Some(mut stroke) = self.active_stroke.take() else { return };
        // Degenerate zero-distance jitter is discarded; single taps are dots.
        let substantial = stroke.points.len() == 1 || stroke.w >= 1.0 || stroke.h >= 1.0;
        if !substantial {
            return;
        }
        match stroke.kind.as_str() {
            "LaserPen" => self.laser_strokes.push(stroke),
            "MagicPen" => self.magic_strokes.push(stroke),
            kind => {
                if matches!(kind, "FreeDraw" | "FountainPen" | "Highlighter") && stroke.points.len() > 8 {
                    stroke.points = simplify_rdp(&stroke.points, COMMIT_SIMPLIFY_PX / self.zoom);
                }
                self.insert_recorded(stroke);
            }
        }
        self.needs_render = true;
    }

    fn begin_select_interaction(&mut self, wx: f64, wy: f64) {
        // 1. Corner resize handles of the current selection.
        if let Some(el) = self.selected_id.and_then(|id| self.scene.get(id)) {
            let r = 16.0 / self.zoom.max(0.1);
            let corners = [(1u8, el.x, el.y), (2, el.x + el.w, el.y), (3, el.x, el.y + el.h), (4, el.x + el.w, el.y + el.h)];
            if let Some((handle, _, _)) = corners.iter().find(|(_, cx, cy)| (wx - cx).powi(2) + (wy - cy).powi(2) <= r * r) {
                self.is_resizing = true;
                self.resize_handle = *handle;
                self.resize_start = (wx, wy);
                self.resize_orig = Rect::from_xywh(el.x, el.y, el.w, el.h);
                self.resize_orig_points = el.points.clone();
                let id = el.id;
                self.history.begin();
                self.history.touch(&self.scene, id);
                return;
            }
        }

        // 2. Normal element selection.
        match self.scene.hit_test(wx, wy, 6.0) {
            Some(id) => {
                if let Some(el) = self.scene.get(id) {
                    self.drag_offset_x = wx - el.x;
                    self.drag_offset_y = wy - el.y;
                }
                self.selected_id = Some(id);
                self.is_dragging = true;
                self.history.begin();
                self.history.touch(&self.scene, id);
            }
            None => {
                self.selected_id = None;
                self.is_dragging = false;
            }
        }
    }

    fn apply_resize(&mut self, wx: f64, wy: f64) {
        let Some(id) = self.selected_id else { return };
        let Some(kind) = self.scene.get(id).map(|e| e.kind.clone()) else { return };
        let (dx, dy) = (wx - self.resize_start.0, wy - self.resize_start.1);
        let o = self.resize_orig;
        let (ox, oy, ow, oh) = (o.min_x, o.min_y, o.width(), o.height());

        let (mut nx, mut ny, mut nw, mut nh) = match self.resize_handle {
            1 => { let (w, h) = ((ow - dx).max(24.0), (oh - dy).max(24.0)); (ox + ow - w, oy + oh - h, w, h) }
            2 => { let (w, h) = ((ow + dx).max(24.0), (oh - dy).max(24.0)); (ox, oy + oh - h, w, h) }
            3 => { let (w, h) = ((ow - dx).max(24.0), (oh + dy).max(24.0)); (ox + ow - w, oy, w, h) }
            4 => { let (w, h) = ((ow + dx).max(24.0), (oh + dy).max(24.0)); (ox, oy, w, h) }
            _ => (ox, oy, ow, oh),
        };

        // Diagrams and images keep their aspect ratio.
        if (kind == "Diagram" || kind == "Image") && ow > 0.0 && oh > 0.0 {
            let scale = (nw / ow).max(nh / oh);
            nw = (ow * scale).max(24.0);
            nh = (oh * scale).max(24.0);
            (nx, ny) = match self.resize_handle {
                1 => (ox + ow - nw, oy + oh - nh),
                2 => (ox, oy + oh - nh),
                3 => (ox + ow - nw, oy),
                _ => (ox, oy),
            };
        }

        // Scale from the points captured at resize start. Rescaling the
        // already-scaled points each move compounded the error.
        let orig_points = &self.resize_orig_points;
        self.scene.modify(id, |el| {
            if ow > 0.0 && oh > 0.0 && orig_points.len() == el.points.len() {
                let (sx, sy) = (nw / ow, nh / oh);
                for (p, q) in el.points.iter_mut().zip(orig_points) {
                    p.0 = nx + (q.0 - ox) * sx;
                    p.1 = ny + (q.1 - oy) * sy;
                }
            }
            el.x = nx;
            el.y = ny;
            el.w = nw;
            el.h = nh;
        });
        self.needs_render = true;
    }

    /// Erases within the eraser radius at a world point. Only elements found by
    /// the spatial index are examined. Must run inside an open transaction.
    fn erase_at_world(&mut self, wx: f64, wy: f64) {
        let radius = (self.eraser_radius / self.zoom).max(4.0 / self.zoom);
        let r2 = radius * radius;
        let probe = Rect::new(wx, wy, wx, wy).expand(radius);
        let within = |p: &(f64, f64)| (p.0 - wx).powi(2) + (p.1 - wy).powi(2) <= r2;

        enum Action {
            Skip,
            Remove,
            Split(Vec<Vec<(f64, f64)>>, Box<Element>),
        }

        for id in self.scene.candidates_in(&probe) {
            let action = match self.scene.get(id) {
                None => Action::Skip,
                Some(el) if !el.geom_bounds().expand(radius).contains_point(wx, wy) => Action::Skip,
                Some(el) => {
                    let solid = matches!(el.kind.as_str(), "Image" | "Text" | "Rectangle" | "Ellipse" | "Line" | "Arrow" | "Diagram");
                    let touched = el.points.iter().any(within);
                    match self.eraser_type {
                        EraserType::Element => Action::Remove,
                        _ if solid => Action::Remove,
                        _ if !touched => Action::Skip,
                        EraserType::Stroke => Action::Remove,
                        EraserType::Precision => {
                            // Split into the runs of points that survive, so erasing
                            // through the middle leaves two strokes rather than one
                            // stroke with a straight line bridging the gap.
                            let mut runs: Vec<Vec<(f64, f64)>> = Vec::new();
                            let mut current = Vec::new();
                            for p in &el.points {
                                if within(p) {
                                    if current.len() > 1 {
                                        runs.push(std::mem::take(&mut current));
                                    } else {
                                        current.clear();
                                    }
                                } else {
                                    current.push(*p);
                                }
                            }
                            if current.len() > 1 {
                                runs.push(current);
                            }
                            Action::Split(runs, Box::new(el.clone()))
                        }
                    }
                }
            };

            match action {
                Action::Skip => {}
                Action::Remove => self.erase_remove(id),
                Action::Split(runs, template) => {
                    let mut runs = runs.into_iter();
                    let Some(first) = runs.next() else {
                        self.erase_remove(id);
                        continue;
                    };
                    self.history.touch(&self.scene, id);
                    self.scene.modify(id, |e| e.points = first);
                    for run in runs {
                        let new_id = self.scene.alloc_id();
                        self.history.touch(&self.scene, new_id);
                        self.scene.upsert(Element { id: new_id, points: run, ..(*template).clone() });
                    }
                }
            }
        }
        self.needs_render = true;
    }

    fn erase_remove(&mut self, id: u64) {
        self.history.touch(&self.scene, id);
        self.scene.remove(id);
        if self.selected_id == Some(id) {
            self.selected_id = None;
        }
    }

    fn paint_magic_guidelines(&self, is_dark: bool, css_w: f64, css_h: f64) {
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

        if let Some(base) = self.magic_baseline_y {
            let ink = |a: f64| if is_dark { format!("rgba(255, 255, 255, {a})") } else { format!("rgba(10, 10, 10, {a})") };
            hline(base, "rgba(231, 63, 7, 0.75)", 1.8, None);
            hline(base - 20.0, &ink(0.35), 1.0, Some(dash(6.0, 6.0)));
            hline(base - 34.0, &ink(0.20), 1.0, None);
            hline(base + 14.0, &ink(0.15), 1.0, Some(dash(2.0, 4.0)));
        } else {
            let step = 60.0;
            ctx.begin_path();
            ctx.set_stroke_style_str(if is_dark { "rgba(231, 63, 7, 0.18)" } else { "rgba(231, 63, 7, 0.15)" });
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

    fn paint_selection(&self) {
        let Some(el) = self.selected_id.and_then(|id| self.scene.get(id)) else { return };
        let ctx = &self.ctx;
        let z = self.zoom;
        ctx.save();
        let pad = 6.0;
        let (sx, sy, sw, sh) = (el.x - pad, el.y - pad, el.w + pad * 2.0, el.h + pad * 2.0);
        let accent = self.accent_color.as_str();

        // 1. Animated marching-ants boundary.
        ctx.set_stroke_style_str(accent);
        ctx.set_line_width(1.5 / z);
        let _ = ctx.set_line_dash(&js_sys::Array::of2(&JsValue::from_f64(6.0 / z), &JsValue::from_f64(4.0 / z)));
        ctx.set_line_dash_offset(-self.selection_anim_phase / z);
        ctx.stroke_rect(sx, sy, sw, sh);
        let _ = ctx.set_line_dash(&js_sys::Array::new());

        // 2. Tactical corner reticles.
        let len = (12.0 / z).min(sw / 3.0).min(sh / 3.0);
        ctx.set_line_width(2.0 / z);
        ctx.begin_path();
        for (cx, cy, dx, dy) in [(sx, sy, 1.0, 1.0), (sx + sw, sy, -1.0, 1.0), (sx, sy + sh, 1.0, -1.0), (sx + sw, sy + sh, -1.0, -1.0)] {
            ctx.move_to(cx, cy + dy * len);
            ctx.line_to(cx, cy);
            ctx.line_to(cx + dx * len, cy);
        }
        ctx.stroke();

        // 3. Corner resize handles.
        let hs = 8.0 / z;
        ctx.set_fill_style_str(if self.is_dark_mode { "#18181b" } else { "#ffffff" });
        ctx.set_line_width(1.5 / z);
        for (cx, cy) in [(el.x, el.y), (el.x + el.w, el.y), (el.x, el.y + el.h), (el.x + el.w, el.y + el.h)] {
            ctx.fill_rect(cx - hs / 2.0, cy - hs / 2.0, hs, hs);
            ctx.stroke_rect(cx - hs / 2.0, cy - hs / 2.0, hs, hs);
        }

        // 4. Telemetry badge [ W × H px ].
        let label = format!("{} × {} px", el.w.round() as i64, el.h.round() as i64);
        let badge = if el.kind == "Diagram" { format!("DIAGRAM • {label}") } else { label };
        let fs = (10.0 / z).clamp(8.0, 14.0);
        ctx.set_font(&format!("bold {fs}px 'Space Mono', monospace"));
        let bw = badge.chars().count() as f64 * fs * 0.62 + 14.0 / z;
        let bh = 18.0 / z;
        let (bx, by) = (sx + (sw - bw) / 2.0, sy + sh + 8.0 / z);
        ctx.set_fill_style_str(if self.is_dark_mode { "#111111" } else { "#ffffff" });
        ctx.set_stroke_style_str("#2a2a2a");
        ctx.set_line_width(1.0 / z);
        ctx.fill_rect(bx, by, bw, bh);
        ctx.stroke_rect(bx, by, bw, bh);
        ctx.set_fill_style_str(accent);
        let _ = ctx.fill_text(&badge, bx + 7.0 / z, by + bh - 5.0 / z);
        ctx.restore();
    }
}
