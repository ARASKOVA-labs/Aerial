//! Undo/redo as element-level diffs.
//!
//! The previous implementation cloned the entire element list on every action
//! (50 deep), so each stroke cost O(board size) time and memory. A transaction
//! here stores only the before/after state of the elements it touched.
//!
//! Protocol: `begin()` → `touch(scene, id)` for each element *before* mutating
//! it (or before inserting a new id) → mutate the scene → `commit(scene)`.

use std::collections::VecDeque;

use crate::element::Element;
use crate::geom::FxHashMap;
use crate::scene::Scene;

#[derive(Debug, Clone)]
pub struct Change {
    pub id: u64,
    pub before: Option<Element>,
    pub after: Option<Element>,
}

#[derive(Default)]
struct Pending {
    order: Vec<u64>,
    before: FxHashMap<u64, Option<Element>>,
}

pub struct History {
    undo: VecDeque<Vec<Change>>,
    redo: VecDeque<Vec<Change>>,
    pending: Option<Pending>,
    limit: usize,
}

impl Default for History {
    fn default() -> Self {
        Self::new(200)
    }
}

impl History {
    pub fn new(limit: usize) -> Self {
        History { undo: VecDeque::new(), redo: VecDeque::new(), pending: None, limit: limit.max(1) }
    }

    pub fn begin(&mut self) {
        if self.pending.is_none() {
            self.pending = Some(Pending::default());
        }
    }

    /// Records the pre-mutation state of `id` (first touch wins).
    pub fn touch(&mut self, scene: &Scene, id: u64) {
        if let Some(p) = &mut self.pending {
            if let std::collections::hash_map::Entry::Vacant(slot) = p.before.entry(id) {
                slot.insert(scene.get(id).cloned());
                p.order.push(id);
            }
        }
    }

    /// Closes the open transaction. No-op changes are dropped; an empty
    /// transaction leaves the stacks untouched.
    pub fn commit(&mut self, scene: &Scene) {
        let Some(mut p) = self.pending.take() else { return };
        let mut changes = Vec::with_capacity(p.order.len());
        for id in p.order {
            let before = p.before.remove(&id).flatten();
            let after = scene.get(id).cloned();
            if before != after {
                changes.push(Change { id, before, after });
            }
        }
        if changes.is_empty() {
            return;
        }
        self.undo.push_back(changes);
        if self.undo.len() > self.limit {
            self.undo.pop_front();
        }
        self.redo.clear();
    }

    pub fn clear(&mut self) {
        self.undo.clear();
        self.redo.clear();
        self.pending = None;
    }

    fn apply(scene: &mut Scene, id: u64, state: &Option<Element>) {
        match state {
            Some(el) => {
                scene.upsert(el.clone());
            }
            None => {
                scene.remove(id);
            }
        }
    }

    pub fn undo(&mut self, scene: &mut Scene) -> bool {
        self.commit(scene);
        let Some(txn) = self.undo.pop_back() else { return false };
        for c in txn.iter().rev() {
            Self::apply(scene, c.id, &c.before);
        }
        self.redo.push_back(txn);
        true
    }

    pub fn redo(&mut self, scene: &mut Scene) -> bool {
        self.commit(scene);
        let Some(txn) = self.redo.pop_back() else { return false };
        for c in &txn {
            Self::apply(scene, c.id, &c.after);
        }
        self.undo.push_back(txn);
        true
    }

    pub fn undo_depth(&self) -> usize {
        self.undo.len()
    }

    pub fn redo_depth(&self) -> usize {
        self.redo.len()
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn stroke(x: f64) -> Element {
        Element { kind: "FreeDraw".into(), points: vec![(x, 0.0), (x + 5.0, 5.0)], ..Default::default() }
    }

    fn ids(s: &Scene) -> Vec<u64> {
        s.iter_ordered().map(|e| e.id).collect()
    }

    #[test]
    fn insert_undo_redo() {
        let mut s = Scene::new();
        let mut h = History::default();
        h.begin();
        let id = s.alloc_id();
        h.touch(&s, id);
        s.upsert(Element { id, ..stroke(0.0) });
        h.commit(&s);
        assert_eq!(ids(&s), vec![id]);
        assert!(h.undo(&mut s));
        assert!(s.is_empty());
        assert!(h.redo(&mut s));
        assert_eq!(ids(&s), vec![id]);
    }

    #[test]
    fn delete_restores_original_z_position() {
        let mut s = Scene::new();
        let a = s.upsert(stroke(0.0)).unwrap();
        let b = s.upsert(stroke(1.0)).unwrap();
        let c = s.upsert(stroke(2.0)).unwrap();
        let mut h = History::default();
        h.begin();
        h.touch(&s, b);
        s.remove(b);
        h.commit(&s);
        assert_eq!(ids(&s), vec![a, c]);
        h.undo(&mut s);
        assert_eq!(ids(&s), vec![a, b, c]);
    }

    #[test]
    fn move_undo_restores_position() {
        let mut s = Scene::new();
        let id = s.upsert(stroke(0.0)).unwrap();
        let mut h = History::default();
        h.begin();
        h.touch(&s, id);
        for _ in 0..10 {
            s.modify(id, |el| {
                el.points.iter_mut().for_each(|p| p.0 += 3.0);
                el.refresh_bounds();
            });
        }
        h.commit(&s);
        assert_eq!(s.get(id).unwrap().x, 30.0);
        h.undo(&mut s);
        assert_eq!(s.get(id).unwrap().x, 0.0);
    }

    #[test]
    fn noop_transaction_not_recorded() {
        let mut s = Scene::new();
        let id = s.upsert(stroke(0.0)).unwrap();
        let mut h = History::default();
        h.begin();
        h.touch(&s, id);
        h.commit(&s);
        assert_eq!(h.undo_depth(), 0);
    }

    #[test]
    fn new_action_clears_redo_and_limit_applies() {
        let mut s = Scene::new();
        let mut h = History::new(3);
        for i in 0..5 {
            h.begin();
            let id = s.alloc_id();
            h.touch(&s, id);
            s.upsert(Element { id, ..stroke(i as f64) });
            h.commit(&s);
        }
        assert_eq!(h.undo_depth(), 3);
        h.undo(&mut s);
        h.begin();
        let id = s.alloc_id();
        h.touch(&s, id);
        s.upsert(Element { id, ..stroke(99.0) });
        h.commit(&s);
        assert!(!h.redo(&mut s));
    }
}
