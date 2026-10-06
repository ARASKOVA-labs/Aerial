//! `Aerial mcp`: a Model Context Protocol server on stdio.
//!
//! An MCP client (Claude Desktop, Claude Code, …) starts the Aerial binary
//! with the `mcp` argument. This process does not open a window: it speaks
//! JSON-RPC 2.0 on stdin/stdout and relays tool calls to the running app over
//! the user-only Unix socket in `agent.rs`, starting Aerial if needed. The
//! tools themselves run inside the app (`src/lib/agent/tools.ts`).

use std::io::{BufRead, BufReader, Write};
use std::path::PathBuf;
use std::time::{Duration, Instant};

use serde_json::{json, Value};

const PROTOCOL_VERSION: &str = "2025-06-18";
const APP_IDENTIFIER: &str = "com.araskova.aerial";
const LAUNCH_WAIT: Duration = Duration::from_secs(20);

const INSTRUCTIONS: &str = "Aerial is an infinite-canvas whiteboard. Coordinates are world units (1 unit = 1 screen pixel at 100% zoom, y grows downward). \
Start with get_board to see what is there, place new content with explicit x/y (or omit them to place it beside existing content), and call get_snapshot to look at the result. \
Colours are stored in light-theme form (e.g. #1e1e1e for ink); Aerial adapts them in dark mode. Every tool call is a single undo step for the user.";

/// Tool catalogue: names and schemas mirror src/lib/agent/tools.ts.
fn tools() -> Value {
    let color = json!({ "type": "string", "description": "Hex colour such as #1e1e1e, #e03131, #2f9e44, #1971c2, #f08c00, or 'transparent'." });
    let point = json!({ "type": "array", "items": { "type": "number" }, "minItems": 2, "maxItems": 2, "description": "[x, y]" });
    json!([
        {
            "name": "get_board",
            "title": "Read the board",
            "description": "Returns the open board: its elements (id, kind, position, size, text, colours, diagram source), content bounds, zoom and theme.",
            "inputSchema": { "type": "object", "properties": {
                "kinds": { "type": "array", "items": { "type": "string" }, "description": "Only list these element kinds, e.g. [\"Text\", \"Rectangle\"]." }
            } },
            "annotations": { "readOnlyHint": true }
        },
        {
            "name": "get_snapshot",
            "title": "Look at the board",
            "description": "Returns a PNG image of the board so you can see the result of your edits.",
            "inputSchema": { "type": "object", "properties": {
                "fit": { "type": "boolean", "description": "Zoom to fit all content first (default true)." }
            } },
            "annotations": { "readOnlyHint": true }
        },
        {
            "name": "list_boards",
            "title": "List boards",
            "description": "Lists the user's boards and which one is open.",
            "inputSchema": { "type": "object", "properties": {} },
            "annotations": { "readOnlyHint": true }
        },
        {
            "name": "open_board",
            "title": "Open a board",
            "description": "Opens a board by id or by exact name.",
            "inputSchema": { "type": "object", "properties": { "id": { "type": "string" }, "name": { "type": "string" } } }
        },
        {
            "name": "create_board",
            "title": "Create a board",
            "description": "Creates a new empty board and opens it.",
            "inputSchema": { "type": "object", "properties": { "name": { "type": "string" } } }
        },
        {
            "name": "draw_shapes",
            "title": "Draw shapes",
            "description": "Draws hand-drawn style rectangles, ellipses or diamonds, optionally with a centred label. Returns one {id, label_id} per shape (use id with draw_connectors).",
            "inputSchema": { "type": "object", "required": ["shapes"], "properties": { "shapes": { "type": "array", "items": {
                "type": "object",
                "properties": {
                    "type": { "type": "string", "enum": ["rectangle", "ellipse", "diamond"] },
                    "x": { "type": "number" }, "y": { "type": "number" },
                    "width": { "type": "number" }, "height": { "type": "number" },
                    "label": { "type": "string" }, "label_size": { "type": "number" },
                    "stroke_color": color, "fill_color": color,
                    "fill_style": { "type": "string", "enum": ["solid", "hachure", "cross-hatch"] },
                    "stroke_width": { "type": "number" },
                    "stroke_style": { "type": "string", "enum": ["solid", "dashed", "dotted"] },
                    "sloppiness": { "type": "number", "description": "0 crisp, 1 artist (default), 2 cartoonist" },
                    "rounded": { "type": "boolean" },
                    "opacity": { "type": "number", "description": "0–100" }
                }
            } } } }
        },
        {
            "name": "draw_connectors",
            "title": "Draw arrows and lines",
            "description": "Draws arrows or lines, either between two elements (from_id/to_id, edge to edge) or through explicit points, with an optional label.",
            "inputSchema": { "type": "object", "required": ["connectors"], "properties": { "connectors": { "type": "array", "items": {
                "type": "object",
                "properties": {
                    "type": { "type": "string", "enum": ["arrow", "line"] },
                    "from_id": { "type": "integer" }, "to_id": { "type": "integer" },
                    "points": { "type": "array", "items": point },
                    "label": { "type": "string" }, "label_size": { "type": "number" },
                    "color": color, "stroke_width": { "type": "number" },
                    "stroke_style": { "type": "string", "enum": ["solid", "dashed", "dotted"] },
                    "sloppiness": { "type": "number" }
                }
            } } } }
        },
        {
            "name": "draw_freehand",
            "title": "Draw with a pen",
            "description": "Draws freehand ink strokes through the given points with the pen, brush, marker or highlighter (pressure is simulated like a real pen). Use dense points for smooth curves.",
            "inputSchema": { "type": "object", "required": ["strokes"], "properties": { "strokes": { "type": "array", "items": {
                "type": "object", "required": ["points"],
                "properties": {
                    "points": { "type": "array", "items": point },
                    "pen": { "type": "string", "enum": ["pen", "brush", "marker", "highlighter"] },
                    "color": color, "width": { "type": "number", "description": "Pen width, about 1–6." }
                }
            } } } }
        },
        {
            "name": "write_handwriting",
            "title": "Write a note by hand",
            "description": "Writes text with the pen as real handwritten strokes (print or cursive), e.g. notes, annotations, labels. Supports newlines and wrapping. Returns the stroke ids and the note's bounds.",
            "inputSchema": { "type": "object", "required": ["text"], "properties": {
                "text": { "type": "string" },
                "x": { "type": "number" }, "y": { "type": "number" },
                "size": { "type": "number", "description": "Letter height in world units (default 28)." },
                "style": { "type": "string", "enum": ["print", "cursive"] },
                "pen": { "type": "string", "enum": ["pen", "brush", "marker", "highlighter"] },
                "color": color, "width": { "type": "number" },
                "max_width": { "type": "number", "description": "Wrap lines longer than this." }
            } }
        },
        {
            "name": "add_text",
            "title": "Add typed text",
            "description": "Adds an editable text element (hand-drawn, normal or code font).",
            "inputSchema": { "type": "object", "required": ["text"], "properties": {
                "text": { "type": "string" }, "x": { "type": "number" }, "y": { "type": "number" },
                "size": { "type": "number" }, "color": color,
                "font": { "type": "string", "enum": ["hand", "normal", "code"] }
            } }
        },
        {
            "name": "add_diagram",
            "title": "Add a diagram",
            "description": "Renders Mermaid source (flowchart, sequence, state, class, ER…) as a styled diagram on the board.",
            "inputSchema": { "type": "object", "required": ["mermaid"], "properties": {
                "mermaid": { "type": "string" }, "x": { "type": "number" }, "y": { "type": "number" },
                "style": { "type": "string", "enum": ["light", "dark", "blueprint"] },
                "accent": color, "scale": { "type": "number" }
            } }
        },
        {
            "name": "update_elements",
            "title": "Edit elements",
            "description": "Changes position, size, text or style of elements by id.",
            "inputSchema": { "type": "object", "required": ["updates"], "properties": { "updates": { "type": "array", "items": {
                "type": "object", "required": ["id"],
                "properties": {
                    "id": { "type": "integer" }, "x": { "type": "number" }, "y": { "type": "number" },
                    "width": { "type": "number" }, "height": { "type": "number" }, "text": { "type": "string" },
                    "stroke_color": color, "fill_color": color, "stroke_width": { "type": "number" },
                    "stroke_style": { "type": "string", "enum": ["solid", "dashed", "dotted"] },
                    "fill_style": { "type": "string", "enum": ["solid", "hachure", "cross-hatch"] },
                    "opacity": { "type": "number" }, "font_size": { "type": "number" }
                }
            } } } }
        },
        {
            "name": "move_elements",
            "title": "Move elements",
            "description": "Moves elements by (dx, dy).",
            "inputSchema": { "type": "object", "required": ["ids"], "properties": {
                "ids": { "type": "array", "items": { "type": "integer" } }, "dx": { "type": "number" }, "dy": { "type": "number" }
            } }
        },
        {
            "name": "delete_elements",
            "title": "Delete elements",
            "description": "Deletes elements by id (the user can undo).",
            "inputSchema": { "type": "object", "required": ["ids"], "properties": { "ids": { "type": "array", "items": { "type": "integer" } } } },
            "annotations": { "destructiveHint": true }
        },
        {
            "name": "clear_board",
            "title": "Clear the board",
            "description": "Removes everything from the open board. Requires confirm: true. The user can undo.",
            "inputSchema": { "type": "object", "required": ["confirm"], "properties": { "confirm": { "type": "boolean" } } },
            "annotations": { "destructiveHint": true }
        },
        {
            "name": "history",
            "title": "Undo or redo",
            "description": "Undoes or redoes the last steps.",
            "inputSchema": { "type": "object", "properties": {
                "action": { "type": "string", "enum": ["undo", "redo"] }, "steps": { "type": "integer", "minimum": 1, "maximum": 50 }
            } }
        },
        {
            "name": "zoom_to_fit",
            "title": "Zoom to fit",
            "description": "Frames all content in the user's view.",
            "inputSchema": { "type": "object", "properties": {} }
        }
    ])
}

/// Where the running app put its socket (Tauri's app data directory).
fn socket_path() -> Option<PathBuf> {
    let home = std::env::var_os("HOME").map(PathBuf::from)?;
    #[cfg(target_os = "macos")]
    let base = home.join("Library").join("Application Support");
    #[cfg(not(target_os = "macos"))]
    let base = std::env::var_os("XDG_DATA_HOME").map(PathBuf::from).unwrap_or_else(|| home.join(".local").join("share"));
    Some(crate::agent::socket_path(&base.join(APP_IDENTIFIER)))
}

#[cfg(unix)]
mod link {
    use super::*;
    use std::os::unix::net::UnixStream;

    pub struct AppLink {
        stream: Option<(UnixStream, BufReader<UnixStream>)>,
        next: u64,
    }

    impl AppLink {
        pub fn new() -> Self {
            AppLink { stream: None, next: 1 }
        }

        fn connect() -> Result<(UnixStream, BufReader<UnixStream>), String> {
            let path = socket_path().ok_or("cannot locate Aerial's data folder")?;
            let try_connect = || UnixStream::connect(&path);
            let stream = match try_connect() {
                Ok(s) => s,
                Err(_) => {
                    launch_app();
                    let start = Instant::now();
                    loop {
                        std::thread::sleep(Duration::from_millis(400));
                        if let Ok(s) = try_connect() {
                            break s;
                        }
                        if start.elapsed() > LAUNCH_WAIT {
                            return Err("Aerial is not running and could not be started. Open Aerial and try again.".to_string());
                        }
                    }
                }
            };
            stream.set_read_timeout(Some(Duration::from_secs(90))).ok();
            let reader = BufReader::new(stream.try_clone().map_err(|e| e.to_string())?);
            Ok((stream, reader))
        }

        /// Sends one tool call and waits for the app's answer.
        pub fn call(&mut self, tool: &str, args: &Value) -> Result<(bool, Value), String> {
            for attempt in 0..2 {
                if self.stream.is_none() {
                    self.stream = Some(Self::connect()?);
                }
                let id = self.next;
                self.next += 1;
                let Some((stream, reader)) = self.stream.as_mut() else { continue };
                let mut line = serde_json::to_vec(&json!({ "id": id, "tool": tool, "args": args })).map_err(|e| e.to_string())?;
                line.push(b'\n');
                let mut reply = String::new();
                let ok = stream.write_all(&line).is_ok() && reader.read_line(&mut reply).map(|n| n > 0).unwrap_or(false);
                if !ok {
                    // The app restarted: reconnect once.
                    self.stream = None;
                    if attempt == 0 {
                        continue;
                    }
                    return Err("lost the connection to Aerial".to_string());
                }
                let v: Value = serde_json::from_str(reply.trim_end()).map_err(|_| "Aerial sent an unreadable reply".to_string())?;
                return Ok((v["ok"].as_bool().unwrap_or(false), v["result"].clone()));
            }
            Err("could not reach Aerial".to_string())
        }
    }

    fn launch_app() {
        #[cfg(target_os = "macos")]
        let _ = std::process::Command::new("open").args(["-g", "-b", APP_IDENTIFIER]).status();
        #[cfg(not(target_os = "macos"))]
        if let Ok(exe) = std::env::current_exe() {
            let _ = std::process::Command::new(exe).spawn();
        }
    }
}

/// Turns the app's tool result into MCP `content`.
fn to_content(ok: bool, result: Value) -> Value {
    if !ok {
        let msg = result["message"].as_str().unwrap_or("The tool failed.").to_string();
        return json!({ "content": [{ "type": "text", "text": msg }], "isError": true });
    }
    if result["kind"] == "image" {
        let mut content = vec![json!({ "type": "image", "data": result["base64"], "mimeType": result["mime"] })];
        if let Some(note) = result["note"].as_str() {
            content.push(json!({ "type": "text", "text": note }));
        }
        return json!({ "content": content });
    }
    let value = result.get("value").cloned().unwrap_or(Value::Null);
    let text = serde_json::to_string_pretty(&value).unwrap_or_else(|_| "null".to_string());
    json!({ "content": [{ "type": "text", "text": text }], "structuredContent": value })
}

fn rpc_result(id: &Value, result: Value) -> Value {
    json!({ "jsonrpc": "2.0", "id": id, "result": result })
}

fn rpc_error(id: &Value, code: i64, message: &str) -> Value {
    json!({ "jsonrpc": "2.0", "id": id, "error": { "code": code, "message": message } })
}

/// Runs the MCP server until stdin closes.
pub fn run_stdio() {
    #[cfg(not(unix))]
    {
        eprintln!("Aerial's MCP server is available on macOS and Linux.");
        std::process::exit(1);
    }
    #[cfg(unix)]
    {
        let mut app = link::AppLink::new();
        let stdin = std::io::stdin();
        let mut stdout = std::io::stdout();
        for line in stdin.lock().lines() {
            let Ok(line) = line else { break };
            if line.trim().is_empty() {
                continue;
            }
            let Ok(msg) = serde_json::from_str::<Value>(&line) else {
                let _ = writeln!(stdout, "{}", rpc_error(&Value::Null, -32700, "parse error"));
                let _ = stdout.flush();
                continue;
            };
            // Notifications (no id) get no response.
            let Some(id) = msg.get("id").cloned() else { continue };
            let method = msg["method"].as_str().unwrap_or("");
            let response = match method {
                "initialize" => {
                    let requested = msg["params"]["protocolVersion"].as_str().unwrap_or(PROTOCOL_VERSION);
                    rpc_result(
                        &id,
                        json!({
                            "protocolVersion": requested,
                            "capabilities": { "tools": { "listChanged": false } },
                            "serverInfo": { "name": "aerial", "title": "Aerial", "version": env!("CARGO_PKG_VERSION") },
                            "instructions": INSTRUCTIONS
                        }),
                    )
                }
                "ping" => rpc_result(&id, json!({})),
                "tools/list" => rpc_result(&id, json!({ "tools": tools() })),
                "tools/call" => {
                    let name = msg["params"]["name"].as_str().unwrap_or("");
                    let args = msg["params"].get("arguments").cloned().unwrap_or_else(|| json!({}));
                    let known = tools().as_array().is_some_and(|t| t.iter().any(|x| x["name"] == name));
                    if !known {
                        rpc_error(&id, -32602, &format!("unknown tool: {name}"))
                    } else {
                        match app.call(name, &args) {
                            Ok((ok, result)) => rpc_result(&id, to_content(ok, result)),
                            Err(e) => rpc_result(&id, json!({ "content": [{ "type": "text", "text": e }], "isError": true })),
                        }
                    }
                }
                _ => rpc_error(&id, -32601, "method not found"),
            };
            let _ = writeln!(stdout, "{response}");
            let _ = stdout.flush();
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn tool_catalogue_is_well_formed() {
        let tools = tools();
        let list = tools.as_array().unwrap();
        assert!(list.len() >= 15);
        let mut names: Vec<&str> = list.iter().map(|t| t["name"].as_str().unwrap()).collect();
        for t in list {
            assert_eq!(t["inputSchema"]["type"], "object", "{}", t["name"]);
            assert!(t["description"].as_str().unwrap().len() > 20);
        }
        names.sort();
        names.dedup();
        assert_eq!(names.len(), list.len(), "tool names must be unique");
    }

    #[test]
    fn results_map_to_mcp_content() {
        let text = to_content(true, json!({ "kind": "json", "value": { "ids": [1] } }));
        assert_eq!(text["structuredContent"]["ids"][0], 1);
        let img = to_content(true, json!({ "kind": "image", "mime": "image/png", "base64": "AAAA", "note": "n" }));
        assert_eq!(img["content"][0]["type"], "image");
        assert_eq!(img["content"][0]["mimeType"], "image/png");
        let err = to_content(false, json!({ "message": "nope" }));
        assert_eq!(err["isError"], true);
        assert_eq!(err["content"][0]["text"], "nope");
    }
}
