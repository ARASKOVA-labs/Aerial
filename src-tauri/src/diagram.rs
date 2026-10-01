use aras_dsl::{
    ast::{NodeId, Stmt},
    parser, printer,
};
use aras_layout::render_svg;
use serde::Serialize;
use std::collections::HashMap;

use crate::security::{validate_len, MAX_DIAGRAM_SOURCE_BYTES};

/// Node labels are written back into DSL source; newlines or quotes would let
/// a label inject extra statements, so they are stripped.
fn clean_label(label: &str) -> String {
    label.chars().filter(|c| !c.is_control() && *c != '"').take(256).collect()
}

#[derive(Serialize)]
pub struct RenderResult {
    pub svg: String,
    pub hit_map: HashMap<String, (f64, f64, f64, f64)>,
}

#[tauri::command]
pub async fn render_diagram(code: String) -> Result<RenderResult, String> {
    validate_len("diagram source", code.len(), MAX_DIAGRAM_SOURCE_BYTES)?;
    tokio::task::spawn_blocking(move || {
        let ast = parser::parse(&code).map_err(|e| format!("Failed to parse diagram: {}", e))?;

        let (svg, hit_map) = render_svg(&ast);

        Ok(RenderResult { svg, hit_map })
    })
    .await
    .map_err(|e| e.to_string())?
}

#[tauri::command]
pub async fn update_diagram_node(
    code: String,
    node_id: String,
    new_label: String,
) -> Result<String, String> {
    validate_len("diagram source", code.len(), MAX_DIAGRAM_SOURCE_BYTES)?;
    if node_id.is_empty() || node_id.len() > 128 || node_id.chars().any(|c| c.is_control() || "[]\"{}".contains(c)) {
        return Err("invalid node id".to_string());
    }
    let new_label = clean_label(&new_label);
    tokio::task::spawn_blocking(move || {
        let mut ast =
            parser::parse(&code).map_err(|e| format!("Failed to parse diagram: {}", e))?;

        let mut found = false;

        // Search and update NodeDecl
        for stmt in &mut ast.stmts {
            match stmt {
                Stmt::NodeDecl(id, label) if id.0 == node_id => {
                    *label = new_label.clone();
                    found = true;
                }
                Stmt::Group(group) => {
                    for inner_stmt in &mut group.stmts {
                        if let Stmt::NodeDecl(id, label) = inner_stmt {
                            if id.0 == node_id {
                                *label = new_label.clone();
                                found = true;
                            }
                        }
                    }
                }
                _ => {}
            }
        }

        // If node decl wasn't found but node exists, promote Stmt::Node to Stmt::NodeDecl
        if !found {
            for stmt in &mut ast.stmts {
                if let Stmt::Node(id) = stmt {
                    if id.0 == node_id {
                        *stmt = Stmt::NodeDecl(id.clone(), new_label.clone());
                        found = true;
                        break;
                    }
                }
            }
        }

        // If it STILL wasn't found (implicitly defined in an edge), add it at the top
        if !found {
            ast.stmts
                .insert(0, Stmt::NodeDecl(NodeId(node_id), new_label));
        }

        Ok(printer::print(&ast))
    })
    .await
    .map_err(|e| e.to_string())?
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn label_cannot_inject_statements() {
        let cleaned = clean_label("ok\"\n[evil] --> [x]");
        assert!(!cleaned.contains('\n') && !cleaned.contains('"'));
    }
}
