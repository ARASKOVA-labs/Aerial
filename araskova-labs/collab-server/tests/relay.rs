//! End-to-end tests against a real listener with real WebSocket clients.

use std::net::SocketAddr;
use std::time::{Duration, SystemTime, UNIX_EPOCH};

use aerial_collab_server::auth::{Claims, Verifier};
use aerial_collab_server::{router, AppState, Config, Limits};
use futures_util::{SinkExt, StreamExt};
use tokio_tungstenite::tungstenite::Message;

const SECRET: &[u8] = b"test-secret-test-secret-test-secret!";

fn now() -> u64 {
    SystemTime::now().duration_since(UNIX_EPOCH).unwrap().as_secs()
}

fn token(room: &str, exp_in: i64) -> String {
    let v = Verifier::new(SECRET).unwrap();
    v.mint(&Claims { sub: "tester".into(), room: room.into(), iat: now(), exp: (now() as i64 + exp_in) as u64 })
}

async fn spawn(limits: Limits) -> (SocketAddr, std::sync::Arc<AppState>) {
    let state = AppState::new(Config { verifier: Verifier::new(SECRET).unwrap(), allowed_origins: vec![], limits });
    let listener = tokio::net::TcpListener::bind("127.0.0.1:0").await.unwrap();
    let addr = listener.local_addr().unwrap();
    let app = router(state.clone()).into_make_service_with_connect_info::<SocketAddr>();
    tokio::spawn(async move { axum::serve(listener, app).await.unwrap() });
    (addr, state)
}

fn url(addr: SocketAddr, room: &str, token: &str) -> String {
    format!("ws://{addr}/ws/room/{room}?token={token}")
}

fn http_status(err: tokio_tungstenite::tungstenite::Error) -> u16 {
    match err {
        tokio_tungstenite::tungstenite::Error::Http(resp) => resp.status().as_u16(),
        other => panic!("expected HTTP rejection, got {other:?}"),
    }
}

#[tokio::test]
async fn relays_to_peers_but_not_back_to_sender() {
    let (addr, _) = spawn(Limits::default()).await;
    let (mut a, _) = tokio_tungstenite::connect_async(url(addr, "room1", &token("room1", 60))).await.unwrap();
    let (mut b, _) = tokio_tungstenite::connect_async(url(addr, "room1", &token("room1", 60))).await.unwrap();
    tokio::time::sleep(Duration::from_millis(50)).await;

    a.send(Message::Binary(vec![1, 2, 3])).await.unwrap();
    let got = tokio::time::timeout(Duration::from_secs(2), b.next()).await.unwrap().unwrap().unwrap();
    assert_eq!(got, Message::Binary(vec![1, 2, 3]));
    let echo = tokio::time::timeout(Duration::from_millis(300), a.next()).await;
    assert!(echo.is_err(), "sender must not receive its own frame");
}

#[tokio::test]
async fn rejects_bad_tokens_rooms_and_the_old_bypass() {
    let (addr, _) = spawn(Limits::default()).await;
    let cases = [
        (url(addr, "room1", "premium_letmein"), 401),
        (url(addr, "room1", &token("room1", -10)), 401),
        (url(addr, "room2", &token("room1", 60)), 401),
        (url(addr, "bad%2Froom", &token("*", 60)), 400),
    ];
    for (u, expected) in cases {
        let err = tokio_tungstenite::connect_async(u.clone()).await.expect_err(&u);
        assert_eq!(http_status(err), expected, "{u}");
    }
}

#[tokio::test]
async fn enforces_room_capacity_and_reclaims_empty_rooms() {
    let limits = Limits { max_conns_per_room: 1, ..Limits::default() };
    let (addr, state) = spawn(limits).await;
    let (a, _) = tokio_tungstenite::connect_async(url(addr, "solo", &token("solo", 60))).await.unwrap();
    let err = tokio_tungstenite::connect_async(url(addr, "solo", &token("solo", 60))).await.unwrap_err();
    assert_eq!(http_status(err), 503);
    assert_eq!(state.room_count(), 1);
    drop(a);
    for _ in 0..50 {
        if state.room_count() == 0 {
            break;
        }
        tokio::time::sleep(Duration::from_millis(20)).await;
    }
    assert_eq!(state.room_count(), 0, "empty room should be reclaimed");
}

#[tokio::test]
async fn disconnects_oversized_and_text_frames() {
    let limits = Limits { max_frame_bytes: 1024, ..Limits::default() };
    let (addr, _) = spawn(limits).await;

    let (mut a, _) = tokio_tungstenite::connect_async(url(addr, "r", &token("r", 60))).await.unwrap();
    let _ = a.send(Message::Binary(vec![0; 4096])).await;
    let next = tokio::time::timeout(Duration::from_secs(2), a.next()).await.unwrap();
    assert!(matches!(next, None | Some(Err(_)) | Some(Ok(Message::Close(_)))), "{next:?}");

    let (mut b, _) = tokio_tungstenite::connect_async(url(addr, "r", &token("r", 60))).await.unwrap();
    b.send(Message::Text("hello".into())).await.unwrap();
    let next = tokio::time::timeout(Duration::from_secs(2), b.next()).await.unwrap();
    assert!(matches!(next, None | Some(Err(_)) | Some(Ok(Message::Close(_)))), "{next:?}");
}

#[tokio::test]
async fn rate_limits_floods() {
    let limits = Limits { frames_per_sec: 5.0, frame_burst: 5.0, ..Limits::default() };
    let (addr, _) = spawn(limits).await;
    let (mut a, _) = tokio_tungstenite::connect_async(url(addr, "flood", &token("flood", 60))).await.unwrap();
    for _ in 0..50 {
        if a.send(Message::Binary(vec![1])).await.is_err() {
            break;
        }
    }
    let next = tokio::time::timeout(Duration::from_secs(2), a.next()).await.unwrap();
    assert!(matches!(next, None | Some(Err(_)) | Some(Ok(Message::Close(_)))), "{next:?}");
}
