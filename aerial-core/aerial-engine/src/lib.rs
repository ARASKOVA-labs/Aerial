//! Aerial WASM engine.
//!
//! `AerialCanvas` is the JS-facing façade. State lives in focused modules:
//!   scene     — committed elements + spatial index + LOD pyramid + change feeds
//!   history   — diff-based undo/redo transactions
//!   render    — cached static layer, dirty-rect repaint, LOD painting
//!   freehand  — pressure-sensitive variable-width stroke outlines
//!   rough     — hand-drawn shapes and hachure fills
//!   interact  — pointer handling, selection, eraser, shape constraints
//!   overlay   — selection UI, marquee, eraser trail, guidelines
//!
//! Every cost that used to scale with board size per frame / per action
//! (full redraw on each pointer move, full-board undo snapshots, O(n²) stroke
//! bounds) now scales with what is visible or what changed.

mod element;
mod freehand;
mod geom;
mod history;
mod interact;
mod overlay;
mod path;
mod pyramid;
mod render;
mod rough;
mod scene;
mod spatial;
mod style;

pub use element::Element;
pub use geom::Rect;
pub use pyramid::lod_level as lod_level_for;
pub use scene::Scene;

use std::collections::HashMap;

use serde::{Deserialize, Serialize};
use wasm_bindgen::prelude::*;
use web_sys::{CanvasRenderingContext2d, HtmlCanvasElement, HtmlImageElement};
use yrs::{updates::decoder::Decode, updates::encoder::Encode, Doc, ReadTxn, StateVector, Transact, Update};

use geom::FxHashSet;
use history::History;
use render::{paint_element, LayerCache, PaintEnv, Scratch, Theme, View};

pub const MIN_ZOOM: f64 = 0.0005;
pub const MAX_ZOOM: f64 = 64.0;
/// Freehand strokes are simplified on commit to this many CSS px of error.
const COMMIT_SIMPLIFY_PX: f64 = 0.25;
/// Frames of no view change before a sub-pixel pan residual is repainted crisp.
const IDLE_REFINE_FRAMES: u32 = 6;
/// Canonical (light-theme) paper colour; dark mode shows it as #121212.
const DEFAULT_PAPER: &str = "#ffffff";

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
pub enum Tool {
    Select,
    FreeDraw,
    FountainPen,
    Marker,
    Highlighter,
    Rectangle,
    Diamond,
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
    /// Excalidraw-style: touched elements fade while dragging and are deleted
    /// on release; Alt restores.
    Stroke,
    /// Removes only the touched part of freehand strokes, immediately.
    Precision,
    /// Alias of `Stroke` kept for API compatibility.
    Element,
}

/// Current drawing style — applied to new elements and, via `apply_style`,
/// to the selection. Field names match the JS side (camelCase).
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", default)]
pub struct DrawStyle {
    pub stroke_color: String,
    pub background_color: String,
    pub fill_style: String,
    pub stroke_width: f64,
    pub stroke_style: String,
    pub roughness: f64,
    pub roundness: String,
    pub opacity: f64,
    pub font_family: String,
    pub font_size: f64,
}

impl Default for DrawStyle {
    fn default() -> Self {
        DrawStyle {
            stroke_color: style::DEFAULT_INK.to_string(),
            background_color: "transparent".to_string(),
            fill_style: "hachure".to_string(),
            stroke_width: 2.0,
            stroke_style: "solid".to_string(),
            roughness: 1.0,
            roundness: "round".to_string(),
            opacity: 100.0,
            font_family: "Kalam, Caveat, cursive".to_string(),
            font_size: 24.0,
        }
    }
}

/// Partial style update from JS: only present fields change.
#[derive(Debug, Default, Deserialize)]
#[serde(rename_all = "camelCase")]
struct StylePatch {
    stroke_color: Option<String>,
    background_color: Option<String>,
    fill_style: Option<String>,
    stroke_width: Option<f64>,
    stroke_style: Option<String>,
    roughness: Option<f64>,
    roundness: Option<String>,
    opacity: Option<f64>,
    font_family: Option<String>,
    font_size: Option<f64>,
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
    ((max_chars as f64 * size * 0.6).max(size * 1.5), (lines.len() as f64 * size * 1.25).max(size * 1.4))
}

/// Eraser drag state (object mode).
#[derive(Default)]
struct EraserState {
    pending: FxHashSet<u64>,
    last: Option<(f64, f64)>,
    /// Trail points in world space with remaining life (1 → 0).
    trail: Vec<(f64, f64, f64)>,
}

#[wasm_bindgen]
pub struct AerialCanvas {
    canvas: HtmlCanvasElement,
    ctx: CanvasRenderingContext2d,
    scene: Scene,
    history: History,
    cache: LayerCache,
    scratch: Scratch,
    active_stroke: Option<Element>,
    shape_anchor: (f64, f64),
    laser_strokes: Vec<Element>,
    magic_strokes: Vec<Element>,
    image_cache: HashMap<u64, HtmlImageElement>,
    tool: Tool,
    tool_locked: bool,
    pending_tool_switch: Option<&'static str>,
    style: DrawStyle,
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
    drag_last: (f64, f64),
    drag_moved: bool,
    is_resizing: bool,
    resize_handle: u8,
    resize_start: (f64, f64),
    resize_orig: Rect,
    resize_orig_points: Vec<(f64, f64)>,
    marquee: Option<(f64, f64, f64, f64)>,
    marquee_base: Vec<u64>,
    selected: Vec<u64>,
    selection_version: u64,
    accent_color: String,
    eraser_radius: f64,
    eraser_type: EraserType,
    eraser: EraserState,
    shift: bool,
    alt: bool,
    last_mouse_x: f64,
    last_mouse_y: f64,
    needs_render: bool,
    legacy_seen_version: u64,
    last_view: (f64, f64, f64),
    idle_frames: u32,
    last_load_rejected: u32,
    exclude_buf: FxHashSet<u64>,
    /// Elements not painted at all (e.g. text being edited inline).
    hidden: FxHashSet<u64>,
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
            scratch: Scratch::default(),
            active_stroke: None,
            shape_anchor: (0.0, 0.0),
            laser_strokes: Vec::new(),
            magic_strokes: Vec::new(),
            image_cache: HashMap::new(),
            tool: Tool::FreeDraw,
            tool_locked: false,
            pending_tool_switch: None,
            style: DrawStyle::default(),
            is_rough: true,
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
            drag_last: (0.0, 0.0),
            drag_moved: false,
            is_resizing: false,
            resize_handle: 0,
            resize_start: (0.0, 0.0),
            resize_orig: Rect::new(0.0, 0.0, 0.0, 0.0),
            resize_orig_points: Vec::new(),
            marquee: None,
            marquee_base: Vec::new(),
            selected: Vec::new(),
            selection_version: 0,
            accent_color: "#6965db".to_string(),
            eraser_radius: 10.0,
            eraser_type: EraserType::Stroke,
            eraser: EraserState::default(),
            shift: false,
            alt: false,
            last_mouse_x: 0.0,
            last_mouse_y: 0.0,
            needs_render: true,
            legacy_seen_version: 0,
            last_view: (0.0, 0.0, 1.0),
            idle_frames: 0,
            last_load_rejected: 0,
            exclude_buf: FxHashSet::default(),
            hidden: FxHashSet::default(),
            doc: Doc::new(),
        })
    }

    // ── Tools ─────────────────────────────────────────────────────────────────
    pub fn set_tool_freedraw(&mut self) { self.switch_tool(Tool::FreeDraw, false); }
    pub fn set_tool_fountain_pen(&mut self) { self.switch_tool(Tool::FountainPen, false); }
    pub fn set_tool_marker(&mut self) { self.switch_tool(Tool::Marker, false); }
    pub fn set_tool_highlighter(&mut self) { self.switch_tool(Tool::Highlighter, false); }
    pub fn set_tool_rectangle(&mut self) { self.switch_tool(Tool::Rectangle, false); }
    pub fn set_tool_diamond(&mut self) { self.switch_tool(Tool::Diamond, false); }
    pub fn set_tool_ellipse(&mut self) { self.switch_tool(Tool::Ellipse, false); }
    pub fn set_tool_line(&mut self) { self.switch_tool(Tool::Line, false); }
    pub fn set_tool_arrow(&mut self) { self.switch_tool(Tool::Arrow, false); }
    pub fn set_tool_select(&mut self) { self.switch_tool(Tool::Select, true); }
    pub fn set_tool_hand(&mut self) { self.switch_tool(Tool::Hand, false); }
    pub fn set_tool_text(&mut self) { self.switch_tool(Tool::Text, false); }
    pub fn set_tool_eraser(&mut self) { self.switch_tool(Tool::Eraser, false); }
    pub fn set_tool_laser_pen(&mut self) { self.switch_tool(Tool::LaserPen, false); }
    pub fn set_tool_magic_pen(&mut self) {
        self.switch_tool(Tool::MagicPen, false);
        self.magic_baseline_y = None;
    }

    /// When locked, drawing a shape keeps the tool instead of switching to
    /// selection (Excalidraw's lock, `Q`).
    pub fn set_tool_locked(&mut self, locked: bool) {
        self.tool_locked = locked;
    }

    /// The tool the engine switched to on its own since the last call
    /// (`"select"` after drawing a shape while unlocked), if any.
    pub fn take_tool_switch(&mut self) -> Option<String> {
        self.pending_tool_switch.take().map(str::to_string)
    }

    /// Modifier keys: Shift constrains shapes (square / 15° lines) and extends
    /// selections; Alt draws shapes from the centre and restores while erasing.
    pub fn set_modifiers(&mut self, shift: bool, alt: bool) {
        self.shift = shift;
        self.alt = alt;
    }

    // ── Style ─────────────────────────────────────────────────────────────────
    /// Updates the drawing style with the fields present in `json` and applies
    /// them to every selected element (one undo step).
    pub fn apply_style(&mut self, json: &str) {
        let Ok(patch) = serde_json::from_str::<StylePatch>(json) else { return };
        self.apply_patch(&patch);
    }

    pub fn get_style(&self) -> String {
        serde_json::to_string(&self.style).unwrap_or_else(|_| "{}".to_string())
    }

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
        self.set_selection(vec![id]);
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
        self.set_selection(Vec::new());
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
    /// Pointer down with pen pressure (0..1), or a negative value when the
    /// device reports none (mouse) — pressure is then simulated from speed.
    pub fn pointer_down(&mut self, raw_x: f64, raw_y: f64, pressure: f64) {
        self.handle_down(raw_x, raw_y, pressure);
    }

    pub fn pointer_move(&mut self, raw_x: f64, raw_y: f64, pressure: f64) {
        self.handle_move(raw_x, raw_y, pressure);
    }

    pub fn pointer_up(&mut self, raw_x: f64, raw_y: f64) {
        self.handle_up(raw_x, raw_y);
    }

    pub fn on_mouse_down(&mut self, raw_x: f64, raw_y: f64) {
        self.handle_down(raw_x, raw_y, -1.0);
    }

    pub fn on_mouse_move(&mut self, raw_x: f64, raw_y: f64) {
        self.handle_move(raw_x, raw_y, -1.0);
    }

    pub fn on_mouse_up(&mut self, raw_x: f64, raw_y: f64) {
        self.handle_up(raw_x, raw_y);
    }

    pub fn on_double_click(&mut self, raw_x: f64, raw_y: f64) -> Option<String> {
        let id = self.hit_test_world(self.screen_to_world_x(raw_x), self.screen_to_world_y(raw_y))?;
        self.set_selection(vec![id]);
        Some(id.to_string())
    }

    pub fn on_wheel(&mut self, dx: f64, dy: f64, ctrl: bool, sx: f64, sy: f64) -> f64 {
        if !(dx.is_finite() && dy.is_finite() && sx.is_finite() && sy.is_finite()) {
            return self.zoom;
        }
        if ctrl {
            // Proportional to the wheel delta so trackpad pinches are smooth;
            // clamped so one mouse-wheel notch is a comfortable ~14% step.
            let factor = (-dy.clamp(-25.0, 25.0) * 0.006).exp();
            self.zoom_about(factor, sx, sy);
        } else {
            self.offset_x -= dx;
            self.offset_y -= dy;
        }
        self.needs_render = true;
        self.zoom
    }

    // ── Frame loop ────────────────────────────────────────────────────────────
    /// Called every animation frame. Renders only when something changed.
    /// Returns true while animations (laser fade, eraser trail) run.
    pub fn tick_animations(&mut self) -> bool {
        let mut animating = false;

        if !self.laser_strokes.is_empty() {
            for stroke in &mut self.laser_strokes {
                stroke.font_size -= 0.04; // ~25 frames to fully fade at 60fps
            }
            self.laser_strokes.retain(|s| s.font_size > 0.0);
            self.needs_render = true;
            animating = true;
        }

        if !self.eraser.trail.is_empty() {
            for p in &mut self.eraser.trail {
                p.2 -= 0.12;
            }
            self.eraser.trail.retain(|p| p.2 > 0.0);
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
        let is_dark = self.is_dark_mode;
        let paper = style::themed(self.bg_color.as_deref().unwrap_or(DEFAULT_PAPER), is_dark).into_owned();
        let theme = Theme { is_dark, bg: paper.clone(), grid: self.grid_type.clone(), lod_px: self.lod_px };

        // Elements shown in the dynamic layer: the dragged selection and the
        // eraser's pending deletions.
        let mut exclude = std::mem::take(&mut self.exclude_buf);
        exclude.clear();
        if self.is_dragging || self.is_resizing {
            exclude.extend(self.selected.iter().copied());
        }
        exclude.extend(self.eraser.pending.iter().copied());
        exclude.extend(self.hidden.iter().copied());

        let env = PaintEnv { images: &self.image_cache, is_dark, zoom: self.zoom, scratch: &self.scratch, alpha: 1.0 };
        self.cache.update(&mut self.scene, view, &theme, &exclude, &env);
        let (rx, ry) = self.cache.residual(&view);
        let static_layer = self.cache.canvas();

        let ctx = &self.ctx;
        ctx.save();
        let _ = ctx.set_transform(1.0, 0.0, 0.0, 1.0, 0.0, 0.0);
        ctx.clear_rect(0.0, 0.0, view.w, view.h);
        if paper != "transparent" && (rx != 0.0 || ry != 0.0) {
            ctx.set_fill_style_str(&paper);
            ctx.fill_rect(0.0, 0.0, view.w, view.h);
        }
        let _ = ctx.draw_image_with_html_canvas_element(static_layer, rx, ry);
        view.apply(ctx);

        self.paint_magic_guidelines(is_dark, view.w / view.dpr, view.h / view.dpr);
        if self.is_dragging || self.is_resizing {
            for id in self.selected.iter().filter(|id| !self.hidden.contains(id)) {
                if let Some(el) = self.scene.get(*id) {
                    paint_element(ctx, el, &env, false);
                }
            }
        }
        let faded = PaintEnv { alpha: 0.2, ..env };
        for id in &self.eraser.pending {
            if let Some(el) = self.scene.get(*id) {
                paint_element(ctx, el, &faded, false);
            }
        }
        if let Some(stroke) = &self.active_stroke {
            paint_element(ctx, stroke, &env, false);
        }
        for stroke in self.laser_strokes.iter().chain(self.magic_strokes.iter()) {
            paint_element(ctx, stroke, &env, false);
        }
        self.paint_eraser_trail(is_dark);
        if self.tool == Tool::Select {
            self.paint_selection();
        }
        self.paint_marquee();
        self.ctx.restore();
        self.exclude_buf = exclude;
        self.needs_render = false;
        if let (Some(t0), Some(t1)) = (t0, web_sys::window().and_then(|w| w.performance()).map(|p| p.now())) {
            self.cache.stats.last_frame_ms = t1 - t0;
        }
    }
}

// ── Internal helpers shared by interact / overlay ───────────────────────────
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

    fn zoom_about(&mut self, factor: f64, sx: f64, sy: f64) -> f64 {
        let old = self.zoom;
        self.zoom = (self.zoom * factor).clamp(MIN_ZOOM, MAX_ZOOM);
        self.offset_x = sx - (sx - self.offset_x) * (self.zoom / old);
        self.offset_y = sy - (sy - self.offset_y) * (self.zoom / old);
        self.needs_render = true;
        self.zoom
    }

    fn zoom_about_center(&mut self, factor: f64) -> f64 {
        let (cx, cy) = (self.canvas.width() as f64 / self.dpr / 2.0, self.canvas.height() as f64 / self.dpr / 2.0);
        self.zoom_about(factor, cx, cy)
    }

    fn reset_interaction_state(&mut self) {
        self.active_stroke = None;
        self.is_drawing = false;
        self.is_panning = false;
        self.is_dragging = false;
        self.is_resizing = false;
        self.resize_handle = 0;
        self.marquee = None;
        self.eraser.pending.clear();
        self.eraser.last = None;
        self.history.commit(&self.scene);
        self.needs_render = true;
    }

    fn switch_tool(&mut self, tool: Tool, keep_selection: bool) {
        self.reset_interaction_state();
        if !keep_selection {
            self.set_selection(Vec::new());
        }
        self.tool = tool;
    }

    fn set_selection(&mut self, ids: Vec<u64>) {
        if ids != self.selected {
            self.selected = ids;
            self.selection_version += 1;
        }
        self.needs_render = true;
    }

    fn insert_recorded(&mut self, el: Element) {
        self.history.commit(&self.scene);
        self.history.begin();
        self.history.touch(&self.scene, el.id);
        self.scene.upsert(el);
        self.history.commit(&self.scene);
        self.needs_render = true;
    }

    /// New element pre-filled with the current style.
    fn styled_element(&self, kind: &str, wx: f64, wy: f64) -> Element {
        let s = &self.style;
        let is_shape = matches!(kind, "Rectangle" | "Diamond" | "Ellipse");
        let linear = matches!(kind, "Line" | "Arrow");
        Element {
            id: 0,
            kind: kind.to_string(),
            points: vec![(wx, wy)],
            x: wx,
            y: wy,
            w: 1.0,
            h: 1.0,
            stroke_color: s.stroke_color.clone(),
            fill_color: if is_shape { s.background_color.clone() } else { "transparent".to_string() },
            stroke_width: s.stroke_width,
            font_size: 14.0,
            is_rough: self.is_rough,
            is_curved: self.is_curved,
            roughness: if is_shape || linear { s.roughness } else { 0.0 },
            fill_style: s.fill_style.clone(),
            stroke_style: if is_shape || linear { s.stroke_style.clone() } else { "solid".to_string() },
            roundness: if matches!(kind, "Rectangle" | "Diamond") { s.roundness.clone() } else { "sharp".to_string() },
            opacity: s.opacity,
            seed: (js_sys::Math::random() * 4_294_967_295.0) as u32 | 1,
            ..Default::default()
        }
    }

    fn apply_patch(&mut self, p: &StylePatch) {
        let ok_color = |c: &Option<String>| c.as_ref().filter(|c| c.len() <= element::MAX_COLOR_LEN).cloned();
        if let Some(c) = ok_color(&p.stroke_color) {
            self.style.stroke_color = c;
        }
        if let Some(c) = ok_color(&p.background_color) {
            self.style.background_color = c;
        }
        if let Some(v) = p.fill_style.as_ref().filter(|v| element::FILL_STYLES.contains(&v.as_str())) {
            self.style.fill_style = v.clone();
        }
        if let Some(w) = p.stroke_width.filter(|w| w.is_finite()) {
            self.style.stroke_width = w.clamp(0.1, element::MAX_STROKE_WIDTH);
        }
        if let Some(v) = p.stroke_style.as_ref().filter(|v| element::STROKE_STYLES.contains(&v.as_str())) {
            self.style.stroke_style = v.clone();
        }
        if let Some(r) = p.roughness.filter(|r| r.is_finite()) {
            self.style.roughness = r.clamp(0.0, 3.0);
        }
        if let Some(v) = p.roundness.as_ref().filter(|v| element::ROUNDNESS.contains(&v.as_str())) {
            self.style.roundness = v.clone();
        }
        if let Some(o) = p.opacity.filter(|o| o.is_finite()) {
            self.style.opacity = o.clamp(0.0, 100.0);
        }
        if let Some(f) = p.font_family.as_ref().filter(|f| f.len() <= 256) {
            self.style.font_family = f.clone();
        }
        if let Some(sz) = p.font_size.filter(|s| s.is_finite()) {
            self.style.font_size = sz.clamp(4.0, 400.0);
        }

        if self.selected.is_empty() {
            return;
        }
        let s = self.style.clone();
        self.history.begin();
        for id in self.selected.clone() {
            self.history.touch(&self.scene, id);
            self.scene.modify(id, |el| {
                let shape = el.is_shape();
                let linear = el.is_linear();
                let text = el.kind == "Text";
                if p.stroke_color.is_some() && el.kind != "Image" && el.kind != "Diagram" {
                    el.stroke_color = s.stroke_color.clone();
                    if text {
                        el.fill_color = s.stroke_color.clone();
                    }
                }
                if shape {
                    if p.background_color.is_some() {
                        el.fill_color = s.background_color.clone();
                    }
                    if p.fill_style.is_some() {
                        el.fill_style = s.fill_style.clone();
                    }
                }
                if p.stroke_width.is_some() && !text {
                    el.stroke_width = s.stroke_width;
                }
                if shape || linear {
                    if p.stroke_style.is_some() {
                        el.stroke_style = s.stroke_style.clone();
                    }
                    if p.roughness.is_some() {
                        el.roughness = s.roughness;
                    }
                }
                if p.roundness.is_some() && matches!(el.kind.as_str(), "Rectangle" | "Diamond") {
                    el.roundness = s.roundness.clone();
                }
                if p.opacity.is_some() {
                    el.opacity = s.opacity;
                }
                if text {
                    if p.font_family.is_some() {
                        el.font_family = s.font_family.clone();
                    }
                    if p.font_size.is_some() {
                        el.font_size = s.font_size;
                        let (w, h) = text_box(&el.text, el.font_size);
                        el.w = w;
                        el.h = h;
                    }
                }
            });
        }
        self.history.commit(&self.scene);
        self.needs_render = true;
    }
}
