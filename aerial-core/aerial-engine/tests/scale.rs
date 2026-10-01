//! Scale checks for the scene store. The fast tests run in CI; the 1M-element
//! benchmark is `#[ignore]`d — run it with:
//!   cargo test -p aerial-engine --release --test scale -- --ignored --nocapture

use std::time::Instant;

use aerial_engine::{Element, Rect, Scene};

fn lcg(seed: &mut u64) -> f64 {
    *seed = seed.wrapping_mul(6364136223846793005).wrapping_add(1442695040888963407);
    ((*seed >> 11) as f64) / ((1u64 << 53) as f64)
}

fn stroke(seed: &mut u64, extent: f64) -> Element {
    let (mut x, mut y) = ((lcg(seed) - 0.5) * extent, (lcg(seed) - 0.5) * extent);
    let points = (0..24)
        .map(|_| {
            x += (lcg(seed) - 0.5) * 14.0;
            y += (lcg(seed) - 0.5) * 14.0;
            (x, y)
        })
        .collect();
    Element { kind: "FreeDraw".into(), points, ..Default::default() }
}

fn build(n: usize, extent: f64) -> Scene {
    let mut seed = 42;
    let mut scene = Scene::new();
    scene.load((0..n).map(|_| stroke(&mut seed, extent)).collect());
    scene
}

#[test]
fn viewport_query_returns_only_visible() {
    let scene = build(20_000, 200_000.0);
    let view = Rect::new(-800.0, -500.0, 800.0, 500.0);
    let ids = scene.candidates_in(&view);
    let brute = scene.iter_ordered().filter(|e| e.visual_bounds().intersects(&view)).count();
    assert_eq!(ids.len(), brute);
    assert!(ids.len() < 200, "a 1600×500 window over a 200k² board should see a tiny fraction");
}

#[test]
#[ignore]
fn bench_one_million_elements() {
    for (label, extent) in [("dense 40k²", 40_000.0), ("sparse 2M²", 2_000_000.0)] {
        let n = 1_000_000;
        let mut seed = 42;
        let elements: Vec<Element> = (0..n).map(|_| stroke(&mut seed, extent)).collect();
        let mut scene = Scene::new();
        let t = Instant::now();
        scene.load(elements);
        let load = t.elapsed();

        let view = Rect::new(-800.0, -500.0, 800.0, 500.0);
        let t = Instant::now();
        let mut visible = 0;
        for _ in 0..100 {
            visible = scene.candidates_in(&view).len();
        }
        let query = t.elapsed() / 100;

        let t = Instant::now();
        for i in 0..1000 {
            let _ = scene.hit_test(i as f64, (i % 97) as f64, 6.0);
        }
        let hit = t.elapsed() / 1000;

        let t = Instant::now();
        for _ in 0..10_000 {
            scene.upsert(stroke(&mut seed, extent));
        }
        let insert = t.elapsed() / 10_000;

        // Zoomed all the way out: count density cells the renderer would splat.
        let world = Rect::new(-extent, -extent, extent, extent);
        let zoom = 1600.0 / (extent * 2.0);
        let mut cells = 0usize;
        let t = Instant::now();
        if let Some(p) = aerial_engine::lod_level_for(zoom, 2.0) {
            scene.pyramid().for_each_cell(p, &world, |_, _| cells += 1);
        }
        let lod = t.elapsed();

        println!(
            "{label}: load {load:?} | viewport query {query:?} ({visible} visible) | hit-test {hit:?} | insert {insert:?} | zoomed-out LOD {cells} cells in {lod:?}"
        );
        assert!(query.as_millis() < 20);
        assert!(insert.as_micros() < 500);
    }
}
