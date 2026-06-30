use axum::{
    extract::{ws::{Message, WebSocket, WebSocketUpgrade}, Path, State, Query},
    response::IntoResponse,
    routing::get,
    Router,
    http::StatusCode,
};
use dashmap::DashMap;
use futures_util::{SinkExt, StreamExt};
use serde::Deserialize;
use std::sync::Arc;
use tokio::sync::broadcast;

// Define a Room containing a broadcast channel for binary updates
struct Room {
    tx: broadcast::Sender<Vec<u8>>,
}

// Global thread-safe state tracking active rooms
struct AppState {
    rooms: DashMap<String, Arc<Room>>,
}

#[derive(Deserialize)]
struct AuthQuery {
    token: String,
}

// 🔐 Premium validation logic
fn verify_premium_token(token: &str) -> bool {
    if token.is_empty() { return false; }
    // TODO: Add your JWT validation or cryptographic public-key signature check here.
    // For now, we will simulate a valid check.
    token.starts_with("premium_")
}

#[tokio::main]
async fn main() {
    tracing_subscriber::fmt::init();

    let shared_state = Arc::new(AppState {
        rooms: DashMap::new(),
    });

    let app = Router::new()
        .route("/ws/room/:room_id", get(ws_handler))
        .with_state(shared_state);

    let listener = tokio::net::TcpListener::bind("0.0.0.0:4000").await.unwrap();
    println!("🚀 Aerial Collab Server running on port 4000");
    axum::serve(listener, app).await.unwrap();
}

async fn ws_handler(
    Path(room_id): Path<String>,
    Query(auth): Query<AuthQuery>,
    ws: WebSocketUpgrade,
    State(state): State<Arc<AppState>>,
) -> impl IntoResponse {
    // Guard clause: Deny access immediately to unauthenticated non-premium clients
    if !verify_premium_token(&auth.token) {
        return (StatusCode::UNAUTHORIZED, "Unauthorized: Premium subscription required").into_response();
    }
    
    ws.on_upgrade(move |socket| handle_socket(socket, room_id, state))
}

async fn handle_socket(socket: WebSocket, room_id: String, state: Arc<AppState>) {
    let (mut sender, mut receiver) = socket.split();

    // Get existing room or instantiate a new one atomically
    let room = state.rooms.entry(room_id.clone()).or_insert_with(|| {
        let (tx, _) = broadcast::channel(100); // Buffer up to 100 updates
        Arc::new(Room { tx })
    }).clone();

    let mut rx = room.tx.subscribe();

    // Task 1: Listen for room broadcast events and shoot them down this WebSocket
    let mut send_task = tokio::spawn(async move {
        while let Ok(bytes) = rx.recv().await {
            if sender.send(Message::Binary(bytes)).await.is_err() {
                break; // Connection dropped
            }
        }
    });

    // Task 2: Listen to binary updates from this specific client and broadcast to the room
    let tx = room.tx.clone();
    let mut recv_task = tokio::spawn(async move {
        while let Some(Ok(msg)) = receiver.next().await {
            if let Message::Binary(bytes) = msg {
                // Blast the delta update vector out to every other peer in the room
                let _ = tx.send(bytes);
            }
        }
    });

    // Clean up when either task finishes (client disconnects)
    tokio::select! {
        _ = (&mut send_task) => recv_task.abort(),
        _ = (&mut recv_task) => send_task.abort(),
    };
}
