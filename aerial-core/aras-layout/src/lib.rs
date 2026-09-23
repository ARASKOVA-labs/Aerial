use aras_dsl::ast::{Diagram, Stmt, Group};
use std::collections::HashMap;

pub fn render_svg(diagram: &Diagram) -> (String, HashMap<String, (f64, f64, f64, f64)>) {
    let mut hit_map: HashMap<String, (f64, f64, f64, f64)> = HashMap::new();
    let mut nodes: Vec<(String, String)> = Vec::new(); // (id, label)
    let mut groups: Vec<Group> = Vec::new();
    let mut connections: Vec<(String, String, Option<String>)> = Vec::new(); // (from, to, label)
    let mut styles: HashMap<String, HashMap<String, String>> = HashMap::new(); // id -> {key -> val}

    // Collect AST elements
    for stmt in &diagram.stmts {
        match stmt {
            Stmt::NodeDecl(id, label) => {
                nodes.push((id.0.clone(), label.clone()));
            }
            Stmt::Node(id) => {
                if !nodes.iter().any(|(nid, _)| nid == &id.0) {
                    nodes.push((id.0.clone(), id.0.clone()));
                }
            }
            Stmt::Group(group) => {
                groups.push(group.clone());
                for inner in &group.stmts {
                    if let Stmt::NodeDecl(id, label) = inner {
                        nodes.push((id.0.clone(), label.clone()));
                    } else if let Stmt::Node(id) = inner {
                        if !nodes.iter().any(|(nid, _)| nid == &id.0) {
                            nodes.push((id.0.clone(), id.0.clone()));
                        }
                    }
                }
            }
            Stmt::Conn(from, to, label) => {
                connections.push((from.0.clone(), to.0.clone(), label.clone()));
                if !nodes.iter().any(|(nid, _)| nid == &from.0) {
                    nodes.push((from.0.clone(), from.0.clone()));
                }
                if !nodes.iter().any(|(nid, _)| nid == &to.0) {
                    nodes.push((to.0.clone(), to.0.clone()));
                }
            }
            Stmt::Style(id, props) => {
                let map = styles.entry(id.0.clone()).or_default();
                for (k, v) in props {
                    map.insert(k.clone(), v.clone());
                }
            }
            _ => {}
        }
    }

    // Deduplicate nodes while preserving labels
    let mut unique_nodes: Vec<(String, String)> = Vec::new();
    for (id, label) in nodes {
        if let Some(existing) = unique_nodes.iter_mut().find(|(nid, _)| nid == &id) {
            if existing.1 == existing.0 && label != id {
                existing.1 = label;
            }
        } else {
            unique_nodes.push((id, label));
        }
    }

    // Grid layout parameters
    let node_width = 160.0;
    let node_height = 60.0;
    let gap_x = 80.0;
    let gap_y = 60.0;

    let cols = ((unique_nodes.len() as f64).sqrt().ceil() as usize).max(2);
    let mut node_positions: HashMap<String, (f64, f64)> = HashMap::new();

    let start_x = 60.0;
    let start_y = 60.0;

    for (idx, (id, _)) in unique_nodes.iter().enumerate() {
        let r = idx / cols;
        let c = idx % cols;
        let x = start_x + c as f64 * (node_width + gap_x);
        let y = start_y + r as f64 * (node_height + gap_y);

        node_positions.insert(id.clone(), (x, y));
        hit_map.insert(id.clone(), (x, y, node_width, node_height));
    }

    // Calculate canvas size
    let max_x = unique_nodes.len().min(cols) as f64 * (node_width + gap_x) + start_x + 100.0;
    let rows = (unique_nodes.len() + cols - 1) / cols;
    let max_y = rows as f64 * (node_height + gap_y) + start_y + 100.0;

    let mut svg = String::new();
    svg.push_str(&format!(
        "<svg xmlns=\"http://www.w3.org/2000/svg\" viewBox=\"0 0 {:.0} {:.0}\" width=\"{:.0}\" height=\"{:.0}\">",
        max_x, max_y, max_x, max_y
    ));
    svg.push_str("<defs>");
    svg.push_str("<style>");
    svg.push_str("@import url('https://fonts.googleapis.com/css2?family=Inter:wght@600;700;900&family=Space+Mono:wght@700&display=swap');");
    svg.push_str("</style>");
    svg.push_str("<marker id=\"araskova-arrow\" viewBox=\"0 0 10 10\" refX=\"7\" refY=\"5\" markerWidth=\"6\" markerHeight=\"6\" orient=\"auto-start-reverse\"><path d=\"M 0 1.5 L 8 5 L 0 8.5 L 2 5 Z\" fill=\"#e73f07\"/></marker>");
    svg.push_str("</defs>");

    // Draw Groups background (Tactical Wireframe Enclosure)
    for group in &groups {
        let mut group_nodes = Vec::new();
        for stmt in &group.stmts {
            if let Stmt::NodeDecl(id, _) | Stmt::Node(id) = stmt {
                if let Some(&(nx, ny)) = node_positions.get(&id.0) {
                    group_nodes.push((nx, ny));
                }
            }
        }
        if !group_nodes.is_empty() {
            let min_gx = group_nodes.iter().map(|(x, _)| *x).fold(f64::INFINITY, f64::min) - 20.0;
            let min_gy = group_nodes.iter().map(|(_, y)| *y).fold(f64::INFINITY, f64::min) - 35.0;
            let max_gx = group_nodes.iter().map(|(x, _)| *x + node_width).fold(f64::NEG_INFINITY, f64::max) + 20.0;
            let max_gy = group_nodes.iter().map(|(_, y)| *y + node_height).fold(f64::NEG_INFINITY, f64::max) + 20.0;
            let gw = max_gx - min_gx;
            let gh = max_gy - min_gy;

            svg.push_str(&format!(
                "<rect x=\"{:.1}\" y=\"{:.1}\" width=\"{:.1}\" height=\"{:.1}\" rx=\"8\" fill=\"#0d0d0d\" fill-opacity=\"0.7\" stroke=\"#2a2a2a\" stroke-width=\"1.5\" stroke-dasharray=\"6 3\"/>",
                min_gx, min_gy, gw, gh
            ));
            svg.push_str(&format!(
                "<rect x=\"{:.1}\" y=\"{:.1}\" width=\"{:.1}\" height=\"3\" rx=\"1.5\" fill=\"#e73f07\"/>",
                min_gx + 8.0, min_gy, gw.min(90.0)
            ));
            svg.push_str(&format!(
                "<text x=\"{:.1}\" y=\"{:.1}\" font-family=\"'Space Mono', monospace\" font-size=\"10\" font-weight=\"700\" letter-spacing=\"0.15em\" text-transform=\"uppercase\" fill=\"#e73f07\">// SYS.{}</text>",
                min_gx + 12.0, min_gy + 20.0, group.name.to_uppercase()
            ));
        }
    }

    // Draw Connections
    for (from, to, label) in &connections {
        if let (Some(&(fx, fy)), Some(&(tx, ty))) = (node_positions.get(from), node_positions.get(to)) {
            let f_cx = fx + node_width / 2.0;
            let f_cy = fy + node_height / 2.0;
            let t_cx = tx + node_width / 2.0;
            let t_cy = ty + node_height / 2.0;

            svg.push_str(&format!(
                "<line x1=\"{:.1}\" y1=\"{:.1}\" x2=\"{:.1}\" y2=\"{:.1}\" stroke=\"#81868b\" stroke-width=\"1.5\" stroke-linecap=\"square\" marker-end=\"url(#araskova-arrow)\"/>",
                f_cx, f_cy, t_cx, t_cy
            ));

            if let Some(lbl) = label {
                let mid_x = (f_cx + t_cx) / 2.0;
                let mid_y = (f_cy + t_cy) / 2.0 - 6.0;
                svg.push_str(&format!(
                    "<rect x=\"{:.1}\" y=\"{:.1}\" width=\"{:.1}\" height=\"16\" rx=\"3\" fill=\"#141414\" stroke=\"#2a2a2a\" stroke-width=\"1\"/>",
                    mid_x - 30.0, mid_y - 11.0, 60.0
                ));
                svg.push_str(&format!(
                    "<text x=\"{:.1}\" y=\"{:.1}\" text-anchor=\"middle\" font-family=\"'Space Mono', monospace\" font-size=\"9\" font-weight=\"700\" letter-spacing=\"0.1em\" text-transform=\"uppercase\" fill=\"#e73f07\">{}</text>",
                    mid_x, mid_y, lbl
                ));
            }
        }
    }

    // Draw Nodes (Machinery Surfaces with Tactical Corner Reticles)
    let tick = 6.0;
    for (idx, (id, label)) in unique_nodes.iter().enumerate() {
        if let Some(&(x, y)) = node_positions.get(id) {
            let style_map = styles.get(id);
            let fill = style_map.and_then(|m| m.get("fill")).map(|s| s.as_str()).unwrap_or("#111111");
            let stroke = style_map.and_then(|m| m.get("stroke")).map(|s| s.as_str()).unwrap_or("#2a2a2a");

            // Main node card
            svg.push_str(&format!(
                "<rect x=\"{:.1}\" y=\"{:.1}\" width=\"{:.1}\" height=\"{:.1}\" rx=\"4\" fill=\"{}\" stroke=\"{}\" stroke-width=\"1.5\" filter=\"drop-shadow(0 2px 6px rgba(0,0,0,0.5))\"/>",
                x, y, node_width, node_height, fill, stroke
            ));

            // Tactical Corner Reticles (L-bracket ticks)
            svg.push_str(&format!(
                "<path d=\"M {:.1} {:.1} L {:.1} {:.1} L {:.1} {:.1}\" fill=\"none\" stroke=\"#e73f07\" stroke-width=\"1.5\" stroke-linecap=\"square\"/>",
                x, y + tick, x, y, x + tick, y
            ));
            svg.push_str(&format!(
                "<path d=\"M {:.1} {:.1} L {:.1} {:.1} L {:.1} {:.1}\" fill=\"none\" stroke=\"#e73f07\" stroke-width=\"1.5\" stroke-linecap=\"square\"/>",
                x + node_width - tick, y, x + node_width, y, x + node_width, y + tick
            ));
            svg.push_str(&format!(
                "<path d=\"M {:.1} {:.1} L {:.1} {:.1} L {:.1} {:.1}\" fill=\"none\" stroke=\"#e73f07\" stroke-width=\"1.5\" stroke-linecap=\"square\"/>",
                x, y + node_height - tick, x, y + node_height, x + tick, y + node_height
            ));
            svg.push_str(&format!(
                "<path d=\"M {:.1} {:.1} L {:.1} {:.1} L {:.1} {:.1}\" fill=\"none\" stroke=\"#e73f07\" stroke-width=\"1.5\" stroke-linecap=\"square\"/>",
                x + node_width - tick, y + node_height, x + node_width, y + node_height, x + node_width, y + node_height - tick
            ));

            // Status indicator dot
            if idx == 0 || idx % 2 == 0 {
                svg.push_str(&format!(
                    "<circle cx=\"{:.1}\" cy=\"{:.1}\" r=\"2\" fill=\"#e73f07\"/>",
                    x + 6.0, y + 6.0
                ));
            }

            // Node title text
            svg.push_str(&format!(
                "<text x=\"{:.1}\" y=\"{:.1}\" text-anchor=\"middle\" font-family=\"'Inter', 'Roboto', sans-serif\" font-size=\"12\" font-weight=\"700\" letter-spacing=\"-0.01em\" fill=\"#f3f3f2\">{}</text>",
                x + node_width / 2.0, y + node_height / 2.0 + 4.0, label
            ));
        }
    }

    svg.push_str("</svg>");
    (svg, hit_map)
}
