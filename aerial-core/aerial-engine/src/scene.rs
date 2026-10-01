//! Scene store: the single owner of committed elements.
//!
//! Keeps four structures in lock-step so every operation is O(log n) or better:
//!   * `elements`  id → Element
//!   * `order`     (z, id) set — paint order and stable serialisation order
//!   * `spatial`   hierarchical grid for viewport / hit queries
//!   * `pyramid`   density aggregates for zoomed-out level of detail
//!
//! It also records *what changed*: world-space dirty rects for the renderer's
//! layer cache, and upserted / deleted ids for incremental persistence.

use std::collections::BTreeSet;

use serde::Serialize;

use crate::element::{sanitize, Element};
use crate::geom::{FxHashMap, FxHashSet, Rect};
use crate::pyramid::DensityPyramid;
use crate::spatial::{Hit, OrderKey, SpatialIndex};

#[derive(Clone, Copy)]
struct Meta {
    key: OrderKey,
    vbounds: Rect,
    level: usize,
    rgb: (u8, u8, u8),
}

#[derive(Serialize)]
pub struct Changes<'a> {
    /// True when the whole board was replaced/cleared: drop stored rows first.
    pub reset: bool,
    pub upserts: Vec<&'a Element>,
    pub deletes: Vec<u64>,
}

#[derive(Default)]
pub struct Scene {
    // Boxed so table growth moves 8-byte pointers, not 300-byte elements —
    // measured 6× faster bulk loads at 1M elements.
    elements: FxHashMap<u64, Box<Element>>,
    meta: FxHashMap<u64, Meta>,
    order: BTreeSet<OrderKey>,
    spatial: SpatialIndex,
    pyramid: DensityPyramid,
    next_id: u64,
    next_z: u64,
    version: u64,
    dirty: Vec<(u64, Rect)>,
    full_dirty: bool,
    changed: FxHashSet<u64>,
    removed: FxHashSet<u64>,
    reset: bool,
}

impl Scene {
    pub fn new() -> Self {
        Scene { spatial: SpatialIndex::new(), next_id: 1, next_z: 1, full_dirty: true, ..Default::default() }
    }

    pub fn len(&self) -> usize {
        self.elements.len()
    }

    pub fn is_empty(&self) -> bool {
        self.elements.is_empty()
    }

    /// Monotonic counter bumped by every mutation. Consumers (autosave,
    /// onChange) compare against the last value they saw — no shared flag.
    pub fn version(&self) -> u64 {
        self.version
    }

    pub fn alloc_id(&mut self) -> u64 {
        let id = self.next_id;
        self.next_id += 1;
        id
    }

    pub fn alloc_z(&mut self) -> u64 {
        let z = self.next_z;
        self.next_z += 1;
        z
    }

    pub fn get(&self, id: u64) -> Option<&Element> {
        self.elements.get(&id).map(|b| b.as_ref())
    }

    pub fn contains(&self, id: u64) -> bool {
        self.elements.contains_key(&id)
    }

    pub fn visual_bounds(&self, id: u64) -> Option<Rect> {
        self.meta.get(&id).map(|m| m.vbounds)
    }

    pub fn pyramid(&self) -> &DensityPyramid {
        &self.pyramid
    }

    pub fn iter_ordered(&self) -> impl Iterator<Item = &Element> {
        self.order.iter().filter_map(move |(_, id)| self.elements.get(id).map(|b| b.as_ref()))
    }

    // ── Internal attach / detach (index maintenance only) ────────────────────

    fn attach(&mut self, el: Element) {
        let id = el.id;
        let key = (el.z, id);
        let vbounds = el.visual_bounds();
        let rgb = el.lod_rgb();
        self.spatial.insert(key, vbounds);
        let level = self.spatial.level_of(id).unwrap_or(0);
        self.pyramid.insert(level, vbounds.center(), rgb);
        self.order.insert(key);
        self.meta.insert(id, Meta { key, vbounds, level, rgb });
        self.next_id = self.next_id.max(id + 1);
        self.next_z = self.next_z.max(el.z + 1);
        self.dirty.push((id, vbounds));
        self.elements.insert(id, Box::new(el));
    }

    fn detach(&mut self, id: u64) -> Option<Element> {
        let el = *self.elements.remove(&id)?;
        if let Some(m) = self.meta.remove(&id) {
            self.spatial.remove(id);
            self.pyramid.remove(m.level, m.vbounds.center(), m.rgb);
            self.order.remove(&m.key);
            self.dirty.push((id, m.vbounds));
        }
        Some(el)
    }

    // ── Public mutations ──────────────────────────────────────────────────────

    /// Inserts (or replaces) an element after validation. Assigns id / z when
    /// zero. Returns the id, or None if the element was rejected.
    pub fn upsert(&mut self, mut el: Element) -> Option<u64> {
        if el.id == 0 {
            el.id = self.alloc_id();
        }
        if el.z == 0 {
            el.z = self.alloc_z();
        }
        let el = sanitize(el)?;
        let id = el.id;
        self.detach(id);
        self.attach(el);
        self.changed.insert(id);
        self.removed.remove(&id);
        self.version += 1;
        Some(id)
    }

    pub fn remove(&mut self, id: u64) -> Option<Element> {
        let el = self.detach(id)?;
        self.changed.remove(&id);
        self.removed.insert(id);
        self.version += 1;
        Some(el)
    }

    /// Mutates an element in place and re-indexes it. If the mutation leaves
    /// the element invalid it is removed. Returns whether it still exists.
    pub fn modify(&mut self, id: u64, f: impl FnOnce(&mut Element)) -> bool {
        let Some(mut el) = self.detach(id) else { return false };
        f(&mut el);
        el.id = id;
        match sanitize(el) {
            Some(valid) => {
                self.attach(valid);
                self.changed.insert(id);
                self.version += 1;
                true
            }
            None => {
                self.changed.remove(&id);
                self.removed.insert(id);
                self.version += 1;
                false
            }
        }
    }

    /// Flags an element's area for repaint without changing it (e.g. its
    /// image finished decoding).
    pub fn touch_visual(&mut self, id: u64) {
        if let Some(m) = self.meta.get(&id) {
            self.dirty.push((id, m.vbounds));
        }
    }

    /// Removes everything; returns the old elements in paint order.
    pub fn clear(&mut self) -> Vec<Element> {
        let ordered: Vec<u64> = self.order.iter().map(|k| k.1).collect();
        let mut out = Vec::with_capacity(ordered.len());
        for id in ordered {
            if let Some(el) = self.elements.remove(&id) {
                out.push(*el);
            }
        }
        self.meta.clear();
        self.order.clear();
        self.spatial.clear();
        self.pyramid.clear();
        self.dirty.clear();
        self.full_dirty = true;
        self.changed.clear();
        self.removed.clear();
        self.reset = true;
        self.version += 1;
        out
    }

    /// Bulk replace from storage. Elements without z get array order. Loading
    /// is not a user change, so persistence tracking is cleared afterwards.
    /// Returns how many elements were rejected by validation.
    pub fn load(&mut self, elements: Vec<Element>) -> usize {
        self.clear();
        let needs_z = elements.iter().all(|e| e.z == 0);
        let total = elements.len();
        self.elements.reserve(total);
        self.meta.reserve(total);
        let mut accepted = 0usize;
        for (i, mut el) in elements.into_iter().enumerate() {
            if needs_z {
                el.z = i as u64 + 1;
            }
            if el.id == 0 {
                el.id = self.alloc_id();
            }
            if self.elements.contains_key(&el.id) {
                continue; // duplicate id in untrusted input — first one wins
            }
            if let Some(valid) = sanitize(el) {
                self.attach(valid);
                accepted += 1;
            }
        }
        self.dirty.clear();
        self.full_dirty = true;
        self.changed.clear();
        self.removed.clear();
        self.reset = false;
        self.version += 1;
        total - accepted
    }

    // ── Queries ───────────────────────────────────────────────────────────────

    /// Hits intersecting `rect` with size class ≥ `min_level`, in paint order.
    pub fn query_sorted(&self, rect: &Rect, min_level: usize, out: &mut Vec<Hit>) {
        out.clear();
        self.spatial.query(rect, min_level, out);
        out.sort_unstable_by_key(|h| h.key);
    }

    /// Topmost element whose geometric bounds (plus a small grab margin) contain
    /// the point. Text gets a larger margin because glyph boxes are estimates.
    pub fn hit_test(&self, wx: f64, wy: f64, margin: f64) -> Option<u64> {
        let probe = Rect::new(wx, wy, wx, wy).expand(margin.max(16.0));
        let mut hits = Vec::new();
        self.spatial.query(&probe, 0, &mut hits);
        hits.sort_unstable_by_key(|h| std::cmp::Reverse(h.key));
        hits.into_iter().map(|h| h.key.1).find(|id| {
            self.elements.get(id).is_some_and(|el| {
                let pad = if el.kind == "Text" { 16.0 } else { margin };
                el.geom_bounds().expand(pad).contains_point(wx, wy)
            })
        })
    }

    pub fn candidates_in(&self, rect: &Rect) -> Vec<u64> {
        let mut hits = Vec::new();
        self.spatial.query(rect, 0, &mut hits);
        hits.sort_unstable_by_key(|h| h.key);
        hits.into_iter().map(|h| h.key.1).collect()
    }

    // ── Change feeds ──────────────────────────────────────────────────────────

    /// Drains repaint regions: (whole-scene invalidated?, [(id, world rect)]).
    pub fn take_dirty(&mut self) -> (bool, Vec<(u64, Rect)>) {
        let full = std::mem::take(&mut self.full_dirty);
        (full, std::mem::take(&mut self.dirty))
    }

    pub fn has_pending_dirty(&self) -> bool {
        self.full_dirty || !self.dirty.is_empty()
    }

    pub fn mark_full_dirty(&mut self) {
        self.full_dirty = true;
    }

    /// Drains the persistence change set as JSON. O(changed elements).
    pub fn take_changes_json(&mut self) -> String {
        let changed = std::mem::take(&mut self.changed);
        let removed = std::mem::take(&mut self.removed);
        let reset = std::mem::take(&mut self.reset);
        let mut upserts: Vec<&Element> = changed.iter().filter_map(|id| self.get(*id)).collect();
        upserts.sort_unstable_by_key(|e| (e.z, e.id));
        let mut deletes: Vec<u64> = removed.into_iter().collect();
        deletes.sort_unstable();
        let changes = Changes { reset, upserts, deletes };
        serde_json::to_string(&changes).unwrap_or_else(|_| r#"{"reset":false,"upserts":[],"deletes":[]}"#.to_string())
    }

    pub fn has_pending_changes(&self) -> bool {
        self.reset || !self.changed.is_empty() || !self.removed.is_empty()
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn stroke_at(x: f64, y: f64) -> Element {
        Element { kind: "FreeDraw".into(), points: vec![(x, y), (x + 10.0, y + 5.0)], ..Default::default() }
    }

    #[test]
    fn upsert_assigns_ids_and_order() {
        let mut s = Scene::new();
        let a = s.upsert(stroke_at(0.0, 0.0)).unwrap();
        let b = s.upsert(stroke_at(5.0, 5.0)).unwrap();
        assert!(b > a);
        let ids: Vec<u64> = s.iter_ordered().map(|e| e.id).collect();
        assert_eq!(ids, vec![a, b]);
        assert_eq!(s.hit_test(6.0, 6.0, 6.0), Some(b), "topmost wins");
    }

    #[test]
    fn modify_reindexes() {
        let mut s = Scene::new();
        let id = s.upsert(stroke_at(0.0, 0.0)).unwrap();
        s.modify(id, |el| {
            for p in el.points.iter_mut() {
                p.0 += 10_000.0;
            }
        });
        assert_eq!(s.hit_test(2.0, 2.0, 6.0), None);
        assert_eq!(s.hit_test(10_002.0, 2.0, 6.0), Some(id));
    }

    #[test]
    fn modify_to_invalid_removes() {
        let mut s = Scene::new();
        let id = s.upsert(stroke_at(0.0, 0.0)).unwrap();
        assert!(!s.modify(id, |el| el.points[0].0 = f64::NAN));
        assert!(!s.contains(id));
        let changes = s.take_changes_json();
        assert!(changes.contains(&format!("\"deletes\":[{id}]")), "{changes}");
    }

    #[test]
    fn load_derives_z_and_skips_duplicates() {
        let mut s = Scene::new();
        let mut a = stroke_at(0.0, 0.0);
        a.id = 9;
        let mut b = stroke_at(1.0, 1.0);
        b.id = 4;
        let mut dup = stroke_at(2.0, 2.0);
        dup.id = 9;
        let rejected = s.load(vec![a, b, dup]);
        assert_eq!(rejected, 1);
        let ids: Vec<u64> = s.iter_ordered().map(|e| e.id).collect();
        assert_eq!(ids, vec![9, 4], "array order preserved for legacy scenes");
        assert!(!s.has_pending_changes(), "loading is not a user change");
        let next = s.upsert(stroke_at(3.0, 3.0)).unwrap();
        assert_eq!(next, 10);
    }

    #[test]
    fn change_feed_is_incremental() {
        let mut s = Scene::new();
        let a = s.upsert(stroke_at(0.0, 0.0)).unwrap();
        let _ = s.take_changes_json();
        let b = s.upsert(stroke_at(1.0, 1.0)).unwrap();
        s.remove(a);
        let json = s.take_changes_json();
        let v: serde_json::Value = serde_json::from_str(&json).unwrap();
        assert_eq!(v["upserts"].as_array().unwrap().len(), 1);
        assert_eq!(v["upserts"][0]["id"], b);
        assert_eq!(v["deletes"][0], a);
        assert_eq!(v["reset"], false);
    }

    #[test]
    fn version_bumps_on_every_mutation() {
        let mut s = Scene::new();
        let v0 = s.version();
        let id = s.upsert(stroke_at(0.0, 0.0)).unwrap();
        let v1 = s.version();
        s.modify(id, |_| {});
        let v2 = s.version();
        s.remove(id);
        assert!(v0 < v1 && v1 < v2 && v2 < s.version());
    }
}

