//! Hierarchical spatial hash ("size-classed grid").
//!
//! Every element is filed in exactly one *level*: the finest grid whose cell
//! size is at least the element's extent. At that level the element overlaps at
//! most 2×2 cells, so insert/remove are O(1) regardless of element size, and a
//! viewport query costs O(cells touched + hits) instead of O(total elements).
//!
//! Level l has cell size `BASE_CELL * 4^l`. Because size classes are explicit,
//! the renderer can ask for "only elements of level ≥ k" — that is the hook the
//! level-of-detail system uses to skip sub-pixel content entirely.

use crate::geom::{FxHashMap, Rect};

pub const BASE_CELL: f64 = 64.0;
pub const LEVELS: usize = 16;

/// Ordering key: (z, id). Stored next to the bounds so query results can be
/// z-sorted without touching the element table.
pub type OrderKey = (u64, u64);

#[inline]
pub fn cell_size(level: usize) -> f64 {
    BASE_CELL * 4f64.powi(level as i32)
}

/// Finest level whose cells are at least as large as the rect's longest side.
pub fn level_for(r: &Rect) -> usize {
    let extent = r.width().max(r.height()).max(0.0);
    let mut level = 0;
    while level < LEVELS - 1 && extent > cell_size(level) {
        level += 1;
    }
    level
}

#[inline]
pub fn cell_coord(v: f64, size: f64) -> i64 {
    // Inputs are pre-validated to ±WORLD_LIMIT, the clamp is belt-and-braces.
    (v / size).floor().clamp(-1.0e15, 1.0e15) as i64
}

#[derive(Clone, Copy, Debug)]
struct Entry {
    level: u8,
    bounds: Rect,
}

#[derive(Clone, Copy, Debug)]
pub struct Hit {
    pub key: OrderKey,
    pub bounds: Rect,
}

#[derive(Default)]
pub struct SpatialIndex {
    levels: Vec<FxHashMap<(i64, i64), Vec<Hit>>>,
    entries: FxHashMap<u64, Entry>,
}

impl SpatialIndex {
    pub fn new() -> Self {
        SpatialIndex {
            levels: (0..LEVELS).map(|_| FxHashMap::default()).collect(),
            entries: FxHashMap::default(),
        }
    }

    #[cfg(test)]
    pub fn len(&self) -> usize {
        self.entries.len()
    }

    pub fn clear(&mut self) {
        for l in &mut self.levels {
            l.clear();
        }
        self.entries.clear();
    }

    pub fn level_of(&self, id: u64) -> Option<usize> {
        self.entries.get(&id).map(|e| e.level as usize)
    }

    pub fn insert(&mut self, key: OrderKey, bounds: Rect) {
        let id = key.1;
        if self.entries.contains_key(&id) {
            self.remove(id);
        }
        let level = level_for(&bounds);
        let size = cell_size(level);
        let (cx0, cy0) = (cell_coord(bounds.min_x, size), cell_coord(bounds.min_y, size));
        let (cx1, cy1) = (cell_coord(bounds.max_x, size), cell_coord(bounds.max_y, size));
        let grid = &mut self.levels[level];
        for cx in cx0..=cx1 {
            for cy in cy0..=cy1 {
                grid.entry((cx, cy)).or_default().push(Hit { key, bounds });
            }
        }
        self.entries.insert(id, Entry { level: level as u8, bounds });
    }

    pub fn remove(&mut self, id: u64) -> bool {
        let Some(entry) = self.entries.remove(&id) else { return false };
        let level = entry.level as usize;
        let size = cell_size(level);
        let b = entry.bounds;
        let (cx0, cy0) = (cell_coord(b.min_x, size), cell_coord(b.min_y, size));
        let (cx1, cy1) = (cell_coord(b.max_x, size), cell_coord(b.max_y, size));
        let grid = &mut self.levels[level];
        for cx in cx0..=cx1 {
            for cy in cy0..=cy1 {
                if let Some(cell) = grid.get_mut(&(cx, cy)) {
                    if let Some(pos) = cell.iter().position(|h| h.key.1 == id) {
                        cell.swap_remove(pos);
                    }
                    if cell.is_empty() {
                        grid.remove(&(cx, cy));
                    }
                }
            }
        }
        true
    }

    /// Collects every element whose bounds intersect `rect` and whose level is
    /// within `[min_level, LEVELS)`. Each hit is reported exactly once.
    pub fn query(&self, rect: &Rect, min_level: usize, out: &mut Vec<Hit>) {
        for level in min_level..LEVELS {
            let grid = &self.levels[level];
            if grid.is_empty() {
                continue;
            }
            let size = cell_size(level);
            let (qx0, qy0) = (cell_coord(rect.min_x, size), cell_coord(rect.min_y, size));
            let (qx1, qy1) = (cell_coord(rect.max_x, size), cell_coord(rect.max_y, size));
            let span = ((qx1 - qx0 + 1) as f64) * ((qy1 - qy0 + 1) as f64);

            // Dedup rule: an element spanning several cells is reported only
            // from the cell holding the top-left corner of (element ∩ query).
            let mut visit = |cx: i64, cy: i64, cell: &Vec<Hit>| {
                for h in cell {
                    if !h.bounds.intersects(rect) {
                        continue;
                    }
                    let ox = cell_coord(h.bounds.min_x, size).max(qx0);
                    let oy = cell_coord(h.bounds.min_y, size).max(qy0);
                    if ox == cx && oy == cy {
                        out.push(*h);
                    }
                }
            };

            // Adaptive traversal: walk whichever is smaller — the query's cell
            // range or the level's occupied cells. Keeps zoomed-out queries on
            // sparse levels from iterating millions of empty cells.
            if span <= grid.len() as f64 {
                for cx in qx0..=qx1 {
                    for cy in qy0..=qy1 {
                        if let Some(cell) = grid.get(&(cx, cy)) {
                            visit(cx, cy, cell);
                        }
                    }
                }
            } else {
                for (&(cx, cy), cell) in grid.iter() {
                    if cx >= qx0 && cx <= qx1 && cy >= qy0 && cy <= qy1 {
                        visit(cx, cy, cell);
                    }
                }
            }
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn brute(items: &[(u64, Rect)], q: &Rect) -> Vec<u64> {
        let mut v: Vec<u64> = items.iter().filter(|(_, r)| r.intersects(q)).map(|(id, _)| *id).collect();
        v.sort_unstable();
        v
    }

    fn lcg(seed: &mut u64) -> f64 {
        *seed = seed.wrapping_mul(6364136223846793005).wrapping_add(1442695040888963407);
        ((*seed >> 11) as f64) / ((1u64 << 53) as f64)
    }

    #[test]
    fn level_selection() {
        assert_eq!(level_for(&Rect::new(0.0, 0.0, 10.0, 10.0)), 0);
        assert_eq!(level_for(&Rect::new(0.0, 0.0, 64.0, 1.0)), 0);
        assert_eq!(level_for(&Rect::new(0.0, 0.0, 65.0, 1.0)), 1);
        assert_eq!(level_for(&Rect::new(0.0, 0.0, 1.0e12, 1.0)), LEVELS - 1);
    }

    #[test]
    fn query_matches_brute_force_without_duplicates() {
        let mut seed = 7u64;
        let mut idx = SpatialIndex::new();
        let mut items = Vec::new();
        for id in 1..=5_000u64 {
            let x = (lcg(&mut seed) - 0.5) * 20_000.0;
            let y = (lcg(&mut seed) - 0.5) * 20_000.0;
            let s = lcg(&mut seed).powi(4) * 3_000.0;
            let r = Rect::new(x, y, x + s, y + s * lcg(&mut seed));
            idx.insert((id, id), r);
            items.push((id, r));
        }
        for _ in 0..200 {
            let x = (lcg(&mut seed) - 0.5) * 25_000.0;
            let y = (lcg(&mut seed) - 0.5) * 25_000.0;
            let w = lcg(&mut seed) * 8_000.0;
            let q = Rect::new(x, y, x + w, y + w * 0.6);
            let mut out = Vec::new();
            idx.query(&q, 0, &mut out);
            let mut got: Vec<u64> = out.iter().map(|h| h.key.1).collect();
            got.sort_unstable();
            let before = got.len();
            got.dedup();
            assert_eq!(before, got.len(), "duplicate hits");
            assert_eq!(got, brute(&items, &q));
        }
    }

    #[test]
    fn remove_and_reinsert() {
        let mut idx = SpatialIndex::new();
        idx.insert((1, 1), Rect::new(0.0, 0.0, 100.0, 100.0));
        idx.insert((2, 2), Rect::new(50.0, 50.0, 60.0, 60.0));
        assert!(idx.remove(1));
        assert!(!idx.remove(1));
        let mut out = Vec::new();
        idx.query(&Rect::new(0.0, 0.0, 200.0, 200.0), 0, &mut out);
        assert_eq!(out.len(), 1);
        // Re-inserting an existing id moves it rather than duplicating it.
        idx.insert((3, 2), Rect::new(5000.0, 5000.0, 5001.0, 5001.0));
        out.clear();
        idx.query(&Rect::new(0.0, 0.0, 200.0, 200.0), 0, &mut out);
        assert!(out.is_empty());
        assert_eq!(idx.len(), 1);
    }

    #[test]
    fn min_level_filters_small_elements() {
        let mut idx = SpatialIndex::new();
        idx.insert((1, 1), Rect::new(0.0, 0.0, 10.0, 10.0)); // level 0
        idx.insert((2, 2), Rect::new(0.0, 0.0, 1000.0, 10.0)); // level 2
        let mut out = Vec::new();
        idx.query(&Rect::new(-1.0, -1.0, 2000.0, 2000.0), 1, &mut out);
        assert_eq!(out.iter().map(|h| h.key.1).collect::<Vec<_>>(), vec![2]);
    }
}
