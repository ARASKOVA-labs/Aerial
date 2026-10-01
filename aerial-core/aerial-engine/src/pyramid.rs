//! Density pyramid — the level-of-detail half of the scale story.
//!
//! The spatial index answers "what is visible"; this answers "what does a
//! region look like when its contents are smaller than a pixel". Each pyramid
//! cell at level p stores the count and summed colour of every element whose
//! size class is ≤ p and whose centre falls in the cell.
//!
//! When zoomed far out, the renderer picks the level p* whose cells are a few
//! pixels wide, draws level-p* cells as tinted blocks (covering every element
//! of class ≤ p*), and draws only elements of class > p* exactly. The two sets
//! partition the scene, so nothing is drawn twice, and the block count is
//! bounded by the number of screen pixels — not by how much content exists.

use crate::geom::{FxHashMap, Rect};
use crate::spatial::{cell_coord, cell_size, LEVELS};

#[derive(Clone, Copy, Debug, Default, PartialEq)]
pub struct CellAgg {
    pub count: u32,
    pub r: u64,
    pub g: u64,
    pub b: u64,
}

impl CellAgg {
    pub fn mean_rgb(&self) -> (u8, u8, u8) {
        if self.count == 0 {
            return (0, 0, 0);
        }
        let n = self.count as u64;
        ((self.r / n) as u8, (self.g / n) as u8, (self.b / n) as u8)
    }
}

pub struct DensityPyramid {
    levels: Vec<FxHashMap<(i64, i64), CellAgg>>,
}

impl Default for DensityPyramid {
    fn default() -> Self {
        Self::new()
    }
}

impl DensityPyramid {
    pub fn new() -> Self {
        DensityPyramid { levels: (0..LEVELS).map(|_| FxHashMap::default()).collect() }
    }

    pub fn clear(&mut self) {
        for l in &mut self.levels {
            l.clear();
        }
    }

    pub fn insert(&mut self, size_level: usize, center: (f64, f64), rgb: (u8, u8, u8)) {
        for p in size_level..LEVELS {
            let s = cell_size(p);
            let agg = self.levels[p].entry((cell_coord(center.0, s), cell_coord(center.1, s))).or_default();
            agg.count += 1;
            agg.r += rgb.0 as u64;
            agg.g += rgb.1 as u64;
            agg.b += rgb.2 as u64;
        }
    }

    pub fn remove(&mut self, size_level: usize, center: (f64, f64), rgb: (u8, u8, u8)) {
        for p in size_level..LEVELS {
            let s = cell_size(p);
            let key = (cell_coord(center.0, s), cell_coord(center.1, s));
            let grid = &mut self.levels[p];
            if let Some(agg) = grid.get_mut(&key) {
                agg.count = agg.count.saturating_sub(1);
                agg.r = agg.r.saturating_sub(rgb.0 as u64);
                agg.g = agg.g.saturating_sub(rgb.1 as u64);
                agg.b = agg.b.saturating_sub(rgb.2 as u64);
                if agg.count == 0 {
                    grid.remove(&key);
                }
            }
        }
    }

    /// Visits every non-empty level-`p` cell intersecting `rect`, passing the
    /// cell's world-space bounds.
    pub fn for_each_cell(&self, p: usize, rect: &Rect, mut f: impl FnMut(Rect, &CellAgg)) {
        let grid = &self.levels[p];
        if grid.is_empty() {
            return;
        }
        let s = cell_size(p);
        let (qx0, qy0) = (cell_coord(rect.min_x, s), cell_coord(rect.min_y, s));
        let (qx1, qy1) = (cell_coord(rect.max_x, s), cell_coord(rect.max_y, s));
        let span = ((qx1 - qx0 + 1) as f64) * ((qy1 - qy0 + 1) as f64);
        let bounds = |cx: i64, cy: i64| Rect::new(cx as f64 * s, cy as f64 * s, (cx + 1) as f64 * s, (cy + 1) as f64 * s);
        if span <= grid.len() as f64 {
            for cx in qx0..=qx1 {
                for cy in qy0..=qy1 {
                    if let Some(agg) = grid.get(&(cx, cy)) {
                        f(bounds(cx, cy), agg);
                    }
                }
            }
        } else {
            for (&(cx, cy), agg) in grid.iter() {
                if cx >= qx0 && cx <= qx1 && cy >= qy0 && cy <= qy1 {
                    f(bounds(cx, cy), agg);
                }
            }
        }
    }

    pub fn total(&self) -> u64 {
        self.levels[LEVELS - 1].values().map(|a| a.count as u64).sum()
    }
}

/// Picks the aggregation level for a zoom factor: the coarsest level whose
/// cells are still at most `lod_px` CSS pixels wide. None → draw everything.
pub fn lod_level(zoom: f64, lod_px: f64) -> Option<usize> {
    if lod_px <= 0.0 || !zoom.is_finite() || zoom <= 0.0 {
        return None;
    }
    let mut best = None;
    for p in 0..LEVELS {
        if cell_size(p) * zoom <= lod_px {
            best = Some(p);
        } else {
            break;
        }
    }
    best
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn insert_remove_roundtrip() {
        let mut p = DensityPyramid::new();
        p.insert(0, (10.0, 10.0), (255, 0, 0));
        p.insert(2, (10.0, 10.0), (0, 0, 255));
        assert_eq!(p.total(), 2);
        let mut seen = Vec::new();
        p.for_each_cell(0, &Rect::new(0.0, 0.0, 63.0, 63.0), |_, a| seen.push(*a));
        assert_eq!(seen.len(), 1);
        assert_eq!(seen[0].count, 1, "level-2 element must not appear at level 0");
        p.remove(0, (10.0, 10.0), (255, 0, 0));
        p.remove(2, (10.0, 10.0), (0, 0, 255));
        assert_eq!(p.total(), 0);
    }

    #[test]
    fn lod_level_picks_subpixel_cells() {
        assert_eq!(lod_level(1.0, 2.0), None);
        // 64 * 0.01 = 0.64px ≤ 2px, 256 * 0.01 = 2.56px > 2px → level 0.
        assert_eq!(lod_level(0.01, 2.0), Some(0));
        // 1024 * 0.001 = 1.02px ≤ 2px, 4096 * 0.001 = 4.1px > 2px → level 2.
        assert_eq!(lod_level(0.001, 2.0), Some(2));
        assert_eq!(lod_level(0.01, 0.0), None);
    }
}
