//! Agent bridge (app side): a Unix socket that MCP clients reach through
//! `Aerial mcp` (see `mcp.rs`). Each request is forwarded to the webview, which
//! runs the tool against the live canvas and answers with `agent_respond`.
//!
//! The socket lives in the app data directory with mode 0600, so only the
//! user's own processes can connect; no network port is opened. Tools cannot
//! read or write files, and the user can turn agent access off in the menu.

use std::collections::HashMap;
use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicU64, Ordering};
use std::sync::Mutex;
use std::time::Duration;

use serde::{Deserialize, Serialize};
use serde_json::Value;
use tauri::{AppHandle, Emitter, Manager, State};
use tokio::io::{AsyncBufReadExt, AsyncReadExt, AsyncWriteExt, BufReader};
use tokio::sync::oneshot;

pub const SOCKET_NAME: &str = "mcp.sock";
/// Event the webview listens on for tool calls.
pub const REQUEST_EVENT: &str = "aerial://agent-request";
/// A request line may carry a diagram or many strokes, but not unbounded data.
const MAX_REQUEST_BYTES: usize = 4 * 1024 * 1024;
const TOOL_TIMEOUT: Duration = Duration::from_secs(60);

#[derive(Default)]
pub struct AgentBridge {
    pending: Mutex<HashMap<String, oneshot::Sender<Reply>>>,
    next: AtomicU64,
}

struct Reply {
    ok: bool,
    result: Value,
}

#[derive(Deserialize)]
struct WireRequest {
    id: Value,
    tool: String,
    #[serde(default)]
    args: Value,
}

#[derive(Serialize)]
pub struct WireReply {
    pub id: Value,
    pub ok: bool,
    pub result: Value,
}

#[derive(Serialize, Clone)]
struct ToolCall<'a> {
    rid: &'a str,
    tool: &'a str,
    args: &'a Value,
}

pub fn socket_path(app_data_dir: &Path) -> PathBuf {
    app_data_dir.join(SOCKET_NAME)
}

fn error_reply(id: Value, message: &str) -> WireReply {
    WireReply { id, ok: false, result: serde_json::json!({ "message": message }) }
}

/// The webview's answer to a tool call.
#[tauri::command]
pub fn agent_respond(bridge: State<'_, AgentBridge>, rid: String, ok: bool, result: Value) {
    let sender = bridge.pending.lock().ok().and_then(|mut p| p.remove(&rid));
    if let Some(tx) = sender {
        let _ = tx.send(Reply { ok, result });
    }
}

async fn call_webview(app: &AppHandle, tool: &str, args: &Value) -> Result<Reply, String> {
    let bridge = app.state::<AgentBridge>();
    let rid = format!("r{}", bridge.next.fetch_add(1, Ordering::Relaxed));
    let (tx, rx) = oneshot::channel();
    bridge.pending.lock().map_err(|_| "bridge unavailable".to_string())?.insert(rid.clone(), tx);
    if app.emit_to("main", REQUEST_EVENT, ToolCall { rid: &rid, tool, args }).is_err() {
        bridge.pending.lock().ok().map(|mut p| p.remove(&rid));
        return Err("Aerial's window is not available".to_string());
    }
    match tokio::time::timeout(TOOL_TIMEOUT, rx).await {
        Ok(Ok(reply)) => Ok(reply),
        _ => {
            bridge.pending.lock().ok().map(|mut p| p.remove(&rid));
            Err("Aerial did not answer in time (is a dialog open?)".to_string())
        }
    }
}

#[cfg(unix)]
async fn serve_connection(app: AppHandle, stream: tokio::net::UnixStream) {
    let (read, mut write) = stream.into_split();
    let mut reader = BufReader::new(read);
    let mut line = String::new();
    loop {
        line.clear();
        let n = match (&mut reader).take(MAX_REQUEST_BYTES as u64 + 1).read_line(&mut line).await {
            Ok(0) | Err(_) => return,
            Ok(n) => n,
        };
        let reply = if n > MAX_REQUEST_BYTES {
            error_reply(Value::Null, "request too large")
        } else {
            match serde_json::from_str::<WireRequest>(line.trim_end()) {
                Err(_) => error_reply(Value::Null, "malformed request"),
                Ok(req) if req.tool.is_empty() || req.tool.len() > 64 || !req.tool.bytes().all(|b| b.is_ascii_lowercase() || b == b'_') => {
                    error_reply(req.id, "unknown tool")
                }
                Ok(req) => {
                    tracing::info!(target: "audit", tool = %req.tool, "agent tool call");
                    match call_webview(&app, &req.tool, &req.args).await {
                        Ok(r) => WireReply { id: req.id, ok: r.ok, result: r.result },
                        Err(e) => error_reply(req.id, &e),
                    }
                }
            }
        };
        let Ok(mut out) = serde_json::to_vec(&reply) else { return };
        out.push(b'\n');
        if write.write_all(&out).await.is_err() {
            return;
        }
        if n > MAX_REQUEST_BYTES {
            return; // the rest of the oversized line is unparseable
        }
    }
}

/// Starts listening for MCP bridge connections (Unix only).
#[cfg(unix)]
pub fn start(app: &AppHandle, app_data_dir: &Path) {
    use std::os::unix::fs::PermissionsExt;

    let path = socket_path(app_data_dir);
    // A socket file left by a crashed run would make bind fail.
    if std::os::unix::net::UnixStream::connect(&path).is_err() {
        let _ = std::fs::remove_file(&path);
    }
    let listener = match std::os::unix::net::UnixListener::bind(&path) {
        Ok(l) => l,
        Err(e) => {
            tracing::warn!(error = %e, "MCP bridge unavailable (is another Aerial running?)");
            return;
        }
    };
    if let Err(e) = std::fs::set_permissions(&path, std::fs::Permissions::from_mode(0o600)) {
        tracing::warn!(error = %e, "could not restrict the MCP socket; not starting it");
        let _ = std::fs::remove_file(&path);
        return;
    }
    if listener.set_nonblocking(true).is_err() {
        return;
    }
    let app = app.clone();
    tauri::async_runtime::spawn(async move {
        let Ok(listener) = tokio::net::UnixListener::from_std(listener) else { return };
        tracing::info!("MCP bridge listening");
        loop {
            match listener.accept().await {
                Ok((stream, _)) => {
                    tauri::async_runtime::spawn(serve_connection(app.clone(), stream));
                }
                Err(e) => {
                    tracing::warn!(error = %e, "MCP bridge accept failed");
                    tokio::time::sleep(Duration::from_millis(200)).await;
                }
            }
        }
    });
}

#[cfg(not(unix))]
pub fn start(_app: &AppHandle, _app_data_dir: &Path) {
    tracing::info!("MCP bridge is not available on this platform yet");
}

/// Removes the socket file on exit so a stale one never lingers.
pub fn stop(app_data_dir: &Path) {
    let _ = std::fs::remove_file(socket_path(app_data_dir));
}
