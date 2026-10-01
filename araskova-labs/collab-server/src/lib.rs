//! Aerial collaboration relay.
//!
//! Relays binary CRDT update frames between members of a room. The server is
//! deliberately content-blind: it never parses, stores, or logs payloads.
//!
//! Controls (see docs/compliance/SOC2.md):
//!   * authentication   HMAC-signed, expiring, room-scoped tokens (`auth`)
//!   * input validation room ids, frame size, text frames rejected
//!   * availability     per-connection rate limits, per-room and global caps,
//!     idle timeouts, empty rooms reclaimed
//!   * audit logging    structured JSON events for every accept / deny / drop

pub mod auth;

use std::collections::HashMap;
use std::net::SocketAddr;
use std::sync::atomic::{AtomicU64, AtomicUsize, Ordering};
use std::sync::Arc;
use std::time::{Duration, Instant, SystemTime, UNIX_EPOCH};

use axum::extract::ws::{Message, WebSocket, WebSocketUpgrade};
use axum::extract::{ConnectInfo, Path, Query, State};
use axum::http::{HeaderMap, StatusCode};
use axum::response::{IntoResponse, Response};
use axum::routing::get;
use axum::Router;
use dashmap::DashMap;
use futures_util::{SinkExt, StreamExt};
use tokio::sync::broadcast;

use auth::Verifier;

#[derive(Clone, Debug)]
pub struct Limits {
    pub max_frame_bytes: usize,
    pub max_conns_per_room: usize,
    pub max_rooms: usize,
    pub frames_per_sec: f64,
    pub frame_burst: f64,
    pub bytes_per_sec: f64,
    pub idle_timeout: Duration,
    pub room_buffer: usize,
}

impl Default for Limits {
    fn default() -> Self {
        Limits {
            max_frame_bytes: 1024 * 1024,
            max_conns_per_room: 64,
            max_rooms: 10_000,
            frames_per_sec: 60.0,
            frame_burst: 240.0,
            bytes_per_sec: 4.0 * 1024.0 * 1024.0,
            idle_timeout: Duration::from_secs(300),
            room_buffer: 256,
        }
    }
}

pub struct Config {
    pub verifier: Verifier,
    /// When non-empty, the WebSocket `Origin` header must match one of these.
    pub allowed_origins: Vec<String>,
    pub limits: Limits,
}

#[derive(Clone)]
struct Frame {
    from: u64,
    bytes: Arc<Vec<u8>>,
}

struct Room {
    tx: broadcast::Sender<Frame>,
    members: AtomicUsize,
}

pub struct AppState {
    cfg: Config,
    rooms: DashMap<String, Arc<Room>>,
    next_conn: AtomicU64,
}

impl AppState {
    pub fn new(cfg: Config) -> Arc<AppState> {
        Arc::new(AppState { cfg, rooms: DashMap::new(), next_conn: AtomicU64::new(1) })
    }

    pub fn room_count(&self) -> usize {
        self.rooms.len()
    }
}

pub fn router(state: Arc<AppState>) -> Router {
    Router::new()
        .route("/healthz", get(|| async { "ok" }))
        .route("/ws/room/:room_id", get(ws_handler))
        .with_state(state)
}

pub fn valid_room_id(id: &str) -> bool {
    !id.is_empty() && id.len() <= 128 && id.bytes().all(|b| b.is_ascii_alphanumeric() || b == b'_' || b == b'-')
}

fn unix_now() -> u64 {
    SystemTime::now().duration_since(UNIX_EPOCH).map(|d| d.as_secs()).unwrap_or(0)
}

/// Seat in a room; releasing it reclaims the room when it was the last one.
struct Membership {
    state: Arc<AppState>,
    room_id: String,
    room: Arc<Room>,
}

impl Drop for Membership {
    fn drop(&mut self) {
        if self.room.members.fetch_sub(1, Ordering::AcqRel) == 1 {
            self.state.rooms.remove_if(&self.room_id, |_, r| r.members.load(Ordering::Acquire) == 0);
        }
    }
}

fn join(state: &Arc<AppState>, room_id: &str) -> Option<Membership> {
    let limits = &state.cfg.limits;
    if !state.rooms.contains_key(room_id) && state.rooms.len() >= limits.max_rooms {
        return None;
    }
    let room = state
        .rooms
        .entry(room_id.to_string())
        .or_insert_with(|| Arc::new(Room { tx: broadcast::channel(limits.room_buffer).0, members: AtomicUsize::new(0) }))
        .clone();
    if room.members.fetch_add(1, Ordering::AcqRel) >= limits.max_conns_per_room {
        room.members.fetch_sub(1, Ordering::AcqRel);
        return None;
    }
    Some(Membership { state: Arc::clone(state), room_id: room_id.to_string(), room })
}

async fn ws_handler(
    Path(room_id): Path<String>,
    Query(query): Query<HashMap<String, String>>,
    ConnectInfo(peer): ConnectInfo<SocketAddr>,
    headers: HeaderMap,
    ws: WebSocketUpgrade,
    State(state): State<Arc<AppState>>,
) -> Response {
    let peer_ip = peer.ip().to_string();
    if !valid_room_id(&room_id) {
        tracing::warn!(target: "audit", event = "connect_denied", reason = "invalid_room", peer = %peer_ip);
        return (StatusCode::BAD_REQUEST, "invalid room id").into_response();
    }
    if !state.cfg.allowed_origins.is_empty() {
        let origin = headers.get("origin").and_then(|v| v.to_str().ok()).unwrap_or("");
        if !state.cfg.allowed_origins.iter().any(|o| o == origin) {
            tracing::warn!(target: "audit", event = "connect_denied", reason = "origin", room = %room_id, peer = %peer_ip);
            return (StatusCode::FORBIDDEN, "origin not allowed").into_response();
        }
    }
    let token = query.get("token").map(String::as_str).unwrap_or("");
    let claims = match state.cfg.verifier.verify(token, &room_id, unix_now()) {
        Ok(c) => c,
        Err(e) => {
            tracing::warn!(target: "audit", event = "connect_denied", reason = e.reason(), room = %room_id, peer = %peer_ip);
            return (StatusCode::UNAUTHORIZED, "unauthorized").into_response();
        }
    };
    let Some(membership) = join(&state, &room_id) else {
        tracing::warn!(target: "audit", event = "connect_denied", reason = "capacity", room = %room_id, sub = %claims.sub);
        return (StatusCode::SERVICE_UNAVAILABLE, "room at capacity").into_response();
    };

    let conn_id = state.next_conn.fetch_add(1, Ordering::Relaxed);
    tracing::info!(target: "audit", event = "connect", conn = conn_id, room = %room_id, sub = %claims.sub, peer = %peer_ip);
    let limits = state.cfg.limits.clone();
    ws.max_message_size(limits.max_frame_bytes)
        .max_frame_size(limits.max_frame_bytes)
        .on_upgrade(move |socket| relay(socket, conn_id, claims.sub, membership, limits))
}

struct Bucket {
    frames: f64,
    bytes: f64,
    last: Instant,
}

impl Bucket {
    fn allow(&mut self, len: usize, l: &Limits) -> bool {
        let now = Instant::now();
        let dt = now.duration_since(self.last).as_secs_f64();
        self.last = now;
        self.frames = (self.frames + dt * l.frames_per_sec).min(l.frame_burst);
        self.bytes = (self.bytes + dt * l.bytes_per_sec).min(l.bytes_per_sec * 2.0);
        if self.frames < 1.0 || self.bytes < len as f64 {
            return false;
        }
        self.frames -= 1.0;
        self.bytes -= len as f64;
        true
    }
}

async fn relay(socket: WebSocket, conn_id: u64, sub: String, membership: Membership, limits: Limits) {
    let started = Instant::now();
    let (mut sink, mut stream) = socket.split();
    let room = Arc::clone(&membership.room);
    let mut rx = room.tx.subscribe();

    let mut send_task = tokio::spawn(async move {
        loop {
            match rx.recv().await {
                Ok(frame) if frame.from == conn_id => continue, // never echo to the sender
                Ok(frame) => {
                    if sink.send(Message::Binary(frame.bytes.as_ref().clone())).await.is_err() {
                        return "send_failed";
                    }
                }
                // A peer that fell behind has missed updates; disconnect so it
                // reconnects and resyncs rather than silently diverging.
                Err(broadcast::error::RecvError::Lagged(_)) => {
                    let _ = sink.send(Message::Close(None)).await;
                    return "lagged";
                }
                Err(broadcast::error::RecvError::Closed) => return "room_closed",
            }
        }
    });

    let tx = room.tx.clone();
    let recv_limits = limits.clone();
    let mut recv_task = tokio::spawn(async move {
        let mut bucket = Bucket { frames: recv_limits.frame_burst, bytes: recv_limits.bytes_per_sec, last: Instant::now() };
        let mut bytes_in = 0u64;
        loop {
            let next = tokio::time::timeout(recv_limits.idle_timeout, stream.next()).await;
            let msg = match next {
                Err(_) => return ("idle_timeout", bytes_in),
                Ok(None) | Ok(Some(Err(_))) => return ("closed", bytes_in),
                Ok(Some(Ok(m))) => m,
            };
            match msg {
                Message::Binary(bytes) => {
                    if !bucket.allow(bytes.len(), &recv_limits) {
                        return ("rate_limited", bytes_in);
                    }
                    bytes_in += bytes.len() as u64;
                    let _ = tx.send(Frame { from: conn_id, bytes: Arc::new(bytes) });
                }
                Message::Text(_) => return ("text_frame_rejected", bytes_in),
                Message::Close(_) => return ("closed", bytes_in),
                Message::Ping(_) | Message::Pong(_) => {}
            }
        }
    });

    let (reason, bytes_in) = tokio::select! {
        r = &mut send_task => { recv_task.abort(); (r.unwrap_or("send_task_failed"), 0) }
        r = &mut recv_task => { send_task.abort(); r.unwrap_or(("recv_task_failed", 0)) }
    };
    let level_warn = matches!(reason, "rate_limited" | "text_frame_rejected" | "lagged");
    if level_warn {
        tracing::warn!(target: "audit", event = "disconnect", conn = conn_id, room = %membership.room_id, sub = %sub, reason, bytes_in, secs = started.elapsed().as_secs());
    } else {
        tracing::info!(target: "audit", event = "disconnect", conn = conn_id, room = %membership.room_id, sub = %sub, reason, bytes_in, secs = started.elapsed().as_secs());
    }
    drop(membership);
}
