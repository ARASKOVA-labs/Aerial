//! JS API: images, diagrams, scene load/save and the experimental CRDT hooks.

use super::*;

#[wasm_bindgen]
impl AerialCanvas {
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

    /// Source (a data URL for stored assets) of the image cached for an element,
    /// so a board can be exported with its images even where there is no store.
    pub fn cached_image_src(&self, id: u64) -> Option<String> {
        self.image_cache.get(&id).map(|img| img.src())
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
}
