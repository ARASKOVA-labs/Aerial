use crate::ast::*;

pub fn parse(input: &str) -> Result<Diagram, String> {
    let lines: Vec<&str> = input.lines().collect();
    let mut diagram = Diagram::default();
    let mut i = 0;

    while i < lines.len() {
        let line = lines[i].trim();
        if line.is_empty() || line.starts_with("//") || line.starts_with("#") {
            i += 1;
            continue;
        }

        if line.starts_with("@type:") {
            let t = line.trim_start_matches("@type:").trim().to_string();
            diagram.stmts.push(Stmt::Type(t));
            i += 1;
            continue;
        }

        if line.starts_with("group ") {
            let (group, next_i) = parse_group(&lines, i)?;
            diagram.stmts.push(Stmt::Group(group));
            i = next_i;
            continue;
        }

        if let Some(stmt) = parse_single_stmt(line) {
            diagram.stmts.push(stmt);
        }

        i += 1;
    }

    Ok(diagram)
}

fn parse_group(lines: &[&str], start: usize) -> Result<(Group, usize), String> {
    let first_line = lines[start].trim();
    // Format: group "Name" {
    let name_part = first_line.trim_start_matches("group").trim();
    let name = extract_quoted_string(name_part).unwrap_or_else(|| "Group".to_string());

    let mut stmts = Vec::new();
    let mut i = start + 1;

    while i < lines.len() {
        let line = lines[i].trim();
        if line == "}" {
            return Ok((Group { name, stmts }, i + 1));
        }
        if !line.is_empty() && !line.starts_with("//") {
            if let Some(stmt) = parse_single_stmt(line) {
                stmts.push(stmt);
            }
        }
        i += 1;
    }

    Ok((Group { name, stmts }, i))
}

fn parse_single_stmt(line: &str) -> Option<Stmt> {
    let line = line.trim();

    // Style statement: style [id] { icon: "client" }
    if line.starts_with("style ") {
        if let Some(bracket_start) = line.find('[') {
            if let Some(bracket_end) = line.find(']') {
                let id_str = &line[bracket_start + 1..bracket_end];
                let mut props = Vec::new();
                if let Some(brace_start) = line.find('{') {
                    if let Some(brace_end) = line.rfind('}') {
                        let content = &line[brace_start + 1..brace_end];
                        for pair in content.split(',') {
                            let pair = pair.trim();
                            if let Some(colon) = pair.find(':') {
                                let key = pair[..colon].trim().to_string();
                                let val = extract_quoted_string(pair[colon + 1..].trim())
                                    .unwrap_or_else(|| pair[colon + 1..].trim().to_string());
                                props.push((key, val));
                            }
                        }
                    }
                }
                return Some(Stmt::Style(NodeId(id_str.to_string()), props));
            }
        }
    }

    // Connection statement: [a] --> [b]: "label" or [a] --> [b]
    if line.contains("-->") {
        let parts: Vec<&str> = line.split("-->").collect();
        if parts.len() >= 2 {
            let left = parts[0].trim();
            let right_part = parts[1].trim();

            let from_id = extract_node_id(left)?;
            
            let (to_str, label) = if let Some(colon) = right_part.find(':') {
                let to_raw = right_part[..colon].trim();
                let label_raw = right_part[colon + 1..].trim();
                (to_raw, extract_quoted_string(label_raw))
            } else {
                (right_part, None)
            };

            let to_id = extract_node_id(to_str)?;
            return Some(Stmt::Conn(NodeId(from_id), NodeId(to_id), label));
        }
    }

    // Node declaration: [id]: "label"
    if line.starts_with('[') && line.contains("]:") {
        if let Some(bracket_end) = line.find("]:") {
            let id = line[1..bracket_end].trim().to_string();
            let label_part = line[bracket_end + 2..].trim();
            let label = extract_quoted_string(label_part).unwrap_or_else(|| label_part.to_string());
            return Some(Stmt::NodeDecl(NodeId(id), label));
        }
    }

    // Simple Node reference: [id]
    if line.starts_with('[') && line.ends_with(']') {
        let id = line[1..line.len() - 1].trim().to_string();
        if !id.is_empty() {
            return Some(Stmt::Node(NodeId(id)));
        }
    }

    None
}

fn extract_node_id(s: &str) -> Option<String> {
    let s = s.trim();
    if s.starts_with('[') && s.ends_with(']') {
        Some(s[1..s.len() - 1].trim().to_string())
    } else {
        None
    }
}

fn extract_quoted_string(s: &str) -> Option<String> {
    let s = s.trim();
    if (s.starts_with('"') && s.ends_with('"')) || (s.starts_with('\'') && s.ends_with('\'')) {
        Some(s[1..s.len() - 1].to_string())
    } else {
        None
    }
}
