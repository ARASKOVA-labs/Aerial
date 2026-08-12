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
    svg.push_str("<defs><marker id=\"arrow\" viewBox=\"0 0 10 10\" refX=\"6\" refY=\"5\" markerWidth=\"6\" markerHeight=\"6\" orient=\"auto-start-reverse\"><path d=\"M 0 0 L 10 5 L 0 10 z\" fill=\"#64748b\"/></marker></defs>");

    // Draw Groups background
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
                "<rect x=\"{:.1}\" y=\"{:.1}\" width=\"{:.1}\" height=\"{:.1}\" rx=\"12\" fill=\"#f8fafc\" stroke=\"#cbd5e1\" stroke-width=\"1.5\" stroke-dasharray=\"4 4\"/>",
                min_gx, min_gy, gw, gh
            ));
            svg.push_str(&format!(
                "<text x=\"{:.1}\" y=\"{:.1}\" font-family=\"sans-serif\" font-size=\"12\" font-weight=\"600\" fill=\"#475569\">{}</text>",
                min_gx + 12.0, min_gy + 20.0, group.name
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
                "<line x1=\"{:.1}\" y1=\"{:.1}\" x2=\"{:.1}\" y2=\"{:.1}\" stroke=\"#64748b\" stroke-width=\"2\" marker-end=\"url(#arrow)\"/>",
                f_cx, f_cy, t_cx, t_cy
            ));

            if let Some(lbl) = label {
                let mid_x = (f_cx + t_cx) / 2.0;
                let mid_y = (f_cy + t_cy) / 2.0 - 6.0;
                svg.push_str(&format!(
                    "<text x=\"{:.1}\" y=\"{:.1}\" text-anchor=\"middle\" font-family=\"sans-serif\" font-size=\"11\" fill=\"#334155\" bg-color=\"#ffffff\">{}</text>",
                    mid_x, mid_y, lbl
                ));
            }
        }
    }

    // Draw Nodes
    for (id, label) in &unique_nodes {
        if let Some(&(x, y)) = node_positions.get(id) {
            let style_map = styles.get(id);
            let fill = style_map.and_then(|m| m.get("fill")).map(|s| s.as_str()).unwrap_or("#ffffff");
            let stroke = style_map.and_then(|m| m.get("stroke")).map(|s| s.as_str()).unwrap_or("#3b82f6");

            svg.push_str(&format!(
                "<rect x=\"{:.1}\" y=\"{:.1}\" width=\"{:.1}\" height=\"{:.1}\" rx=\"8\" fill=\"{}\" stroke=\"{}\" stroke-width=\"2\" filter=\"drop-shadow(0 2px 4px rgba(0,0,0,0.05))\"/>",
                x, y, node_width, node_height, fill, stroke
            ));

            svg.push_str(&format!(
                "<text x=\"{:.1}\" y=\"{:.1}\" text-anchor=\"middle\" font-family=\"sans-serif\" font-size=\"13\" font-weight=\"500\" fill=\"#1e293b\">{}</text>",
                x + node_width / 2.0, y + node_height / 2.0 + 4.0, label
            ));
        }
    }

    svg.push_str("</svg>");
    (svg, hit_map)
}
