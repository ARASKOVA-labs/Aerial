use crate::ast::*;

pub fn print(diagram: &Diagram) -> String {
    let mut out = String::new();
    for stmt in &diagram.stmts {
        print_stmt(stmt, &mut out, 0);
    }
    out
}

fn print_stmt(stmt: &Stmt, out: &mut String, indent: usize) {
    let pad = "  ".repeat(indent);
    match stmt {
        Stmt::Type(t) => {
            out.push_str(&format!("{}@type: {}\n", pad, t));
        }
        Stmt::Group(group) => {
            out.push_str(&format!("{}group \"{}\" {{\n", pad, group.name));
            for s in &group.stmts {
                print_stmt(s, out, indent + 1);
            }
            out.push_str(&format!("{}}}\n", pad));
        }
        Stmt::NodeDecl(id, label) => {
            out.push_str(&format!("{}[{}]: \"{}\"\n", pad, id.0, label));
        }
        Stmt::Node(id) => {
            out.push_str(&format!("{}[{}]\n", pad, id.0));
        }
        Stmt::Conn(from, to, label) => {
            if let Some(lbl) = label {
                out.push_str(&format!("{}[{}] --> [{}]: \"{}\"\n", pad, from.0, to.0, lbl));
            } else {
                out.push_str(&format!("{}[{}] --> [{}]\n", pad, from.0, to.0));
            }
        }
        Stmt::Style(id, props) => {
            let prop_strs: Vec<String> = props.iter().map(|(k, v)| format!("{}: \"{}\"", k, v)).collect();
            out.push_str(&format!("{}style [{}] {{ {} }}\n", pad, id.0, prop_strs.join(", ")));
        }
    }
}
