//! JS API for programmatic editing (hosts, automation, the MCP bridge).
//!
//! Elements go in and out as JSON. Every batch is one undo step, and every
//! element passes the same validation as a loaded scene, so a buggy or hostile
//! caller cannot put the board into a state the editor itself could not.

use super::*;

/// Upper bound on elements per batch call.
const MAX_BATCH: usize = 5_000;

#[derive(Deserialize)]
struct Patch {
    id: u64,
    #[serde(flatten)]
    fields: serde_json::Map<String, serde_json::Value>,
}

#[wasm_bindgen]
impl AerialCanvas {
    /// Adds elements (a JSON array of partial elements; omitted fields take
    /// defaults, ids are assigned). Returns a JSON array with the new id of
    /// each element, or null where it was rejected by validation.
    pub fn add_elements_json(&mut self, json: &str) -> String {
        let Ok(items) = serde_json::from_str::<Vec<serde_json::Value>>(json) else { return "[]".to_string() };
        self.history.commit(&self.scene);
        self.history.begin();
        let mut ids: Vec<Option<u64>> = Vec::with_capacity(items.len().min(MAX_BATCH));
        for item in items.into_iter().take(MAX_BATCH) {
            let parsed = serde_json::from_value::<Element>(item).ok().map(|mut el| {
                el.id = self.scene.alloc_id();
                el.z = 0; // appended on top
                el
            });
            let id = parsed.and_then(|el| {
                let id = el.id;
                self.history.touch(&self.scene, id);
                self.scene.upsert(el)
            });
            ids.push(id);
        }
        self.history.commit(&self.scene);
        self.needs_render = true;
        serde_json::to_string(&ids).unwrap_or_else(|_| "[]".to_string())
    }

    /// Merges field patches into existing elements (`[{ "id": 7, "x": 10, ... }]`).
    /// Returns the ids that were updated and are still valid.
    pub fn update_elements_json(&mut self, json: &str) -> String {
        let Ok(patches) = serde_json::from_str::<Vec<Patch>>(json) else { return "[]".to_string() };
        self.history.commit(&self.scene);
        self.history.begin();
        let mut updated = Vec::new();
        for patch in patches.into_iter().take(MAX_BATCH) {
            let Some(current) = self.scene.get(patch.id) else { continue };
            let Ok(serde_json::Value::Object(mut merged)) = serde_json::to_value(current) else { continue };
            for (k, v) in patch.fields {
                if k != "id" {
                    merged.insert(k, v);
                }
            }
            let Ok(mut next) = serde_json::from_value::<Element>(serde_json::Value::Object(merged)) else { continue };
            next.id = patch.id;
            self.history.touch(&self.scene, patch.id);
            let ok = self.scene.modify(patch.id, |el| {
                *el = next;
                el.refresh_bounds();
            });
            if ok {
                updated.push(patch.id);
            }
        }
        self.history.commit(&self.scene);
        self.needs_render = true;
        serde_json::to_string(&updated).unwrap_or_else(|_| "[]".to_string())
    }

    /// Moves elements by (dx, dy) world units, as one undo step.
    pub fn move_elements_json(&mut self, ids_json: &str, dx: f64, dy: f64) -> u32 {
        let Ok(ids) = serde_json::from_str::<Vec<u64>>(ids_json) else { return 0 };
        if !dx.is_finite() || !dy.is_finite() {
            return 0;
        }
        self.history.commit(&self.scene);
        self.history.begin();
        let mut moved = 0;
        for id in ids.into_iter().take(MAX_BATCH) {
            self.history.touch(&self.scene, id);
            if self.scene.modify(id, |el| {
                el.x += dx;
                el.y += dy;
                for p in el.points.iter_mut() {
                    p.0 += dx;
                    p.1 += dy;
                }
            }) {
                moved += 1;
            }
        }
        self.history.commit(&self.scene);
        self.needs_render = true;
        moved
    }

    /// Deletes elements by id (a JSON array), as one undo step. Returns how many were removed.
    pub fn delete_elements_json(&mut self, ids_json: &str) -> u32 {
        let Ok(ids) = serde_json::from_str::<Vec<u64>>(ids_json) else { return 0 };
        self.history.commit(&self.scene);
        self.history.begin();
        let mut removed = 0;
        for id in ids.into_iter().take(MAX_BATCH) {
            self.history.touch(&self.scene, id);
            if self.scene.remove(id).is_some() {
                removed += 1;
            }
        }
        self.history.commit(&self.scene);
        let selected: Vec<u64> = self.selected.iter().copied().filter(|id| self.scene.contains(*id)).collect();
        self.set_selection(selected);
        self.needs_render = true;
        removed
    }
}
