//! Aerial collaboration relay — process entry point.
//!
//! Configuration (environment):
//!   AERIAL_COLLAB_SECRET   required, ≥ 32 bytes; HMAC key shared with the token issuer
//!   AERIAL_COLLAB_BIND     listen address (default 127.0.0.1:4000)
//!   AERIAL_ALLOWED_ORIGINS comma-separated Origin allowlist (recommended in production)
//!   RUST_LOG               log filter (default info)
//!
//! Token minting for operators / local testing:
//!   aerial-collab-server mint <subject> <room|*> [ttl_secs]

use std::net::SocketAddr;
use std::process::ExitCode;
use std::time::{SystemTime, UNIX_EPOCH};

use aerial_collab_server::auth::{Claims, Verifier, MAX_TOKEN_TTL_SECS};
use aerial_collab_server::{router, valid_room_id, AppState, Config, Limits};

fn load_verifier() -> Result<Verifier, String> {
    let secret = std::env::var("AERIAL_COLLAB_SECRET").map_err(|_| "AERIAL_COLLAB_SECRET is not set".to_string())?;
    Verifier::new(secret.as_bytes())
}

fn mint(args: &[String]) -> Result<(), String> {
    let (Some(sub), Some(room)) = (args.first(), args.get(1)) else {
        return Err("usage: aerial-collab-server mint <subject> <room|*> [ttl_secs]".to_string());
    };
    if room != "*" && !valid_room_id(room) {
        return Err("invalid room id".to_string());
    }
    let ttl: u64 = args.get(2).map(|t| t.parse().map_err(|_| "ttl must be an integer")).transpose()?.unwrap_or(300);
    let now = SystemTime::now().duration_since(UNIX_EPOCH).map_err(|e| e.to_string())?.as_secs();
    let claims = Claims { sub: sub.clone(), room: room.clone(), iat: now, exp: now + ttl.min(MAX_TOKEN_TTL_SECS) };
    let token = load_verifier()?.mint(&claims);
    // Printing the token is this subcommand's purpose.
    #[allow(clippy::print_stdout)]
    {
        println!("{token}");
    }
    Ok(())
}

async fn serve() -> Result<(), String> {
    let verifier = load_verifier()?;
    let bind: SocketAddr = std::env::var("AERIAL_COLLAB_BIND")
        .unwrap_or_else(|_| "127.0.0.1:4000".to_string())
        .parse()
        .map_err(|e| format!("invalid AERIAL_COLLAB_BIND: {e}"))?;
    let allowed_origins: Vec<String> = std::env::var("AERIAL_ALLOWED_ORIGINS")
        .unwrap_or_default()
        .split(',')
        .map(|s| s.trim().to_string())
        .filter(|s| !s.is_empty())
        .collect();
    if allowed_origins.is_empty() {
        tracing::warn!("AERIAL_ALLOWED_ORIGINS is empty: any Origin may connect (tokens are still required)");
    }

    let state = AppState::new(Config { verifier, allowed_origins, limits: Limits::default() });
    let listener = tokio::net::TcpListener::bind(bind).await.map_err(|e| format!("bind {bind}: {e}"))?;
    tracing::info!(%bind, "Aerial collab server listening");
    axum::serve(listener, router(state).into_make_service_with_connect_info::<SocketAddr>())
        .with_graceful_shutdown(shutdown_signal())
        .await
        .map_err(|e| e.to_string())
}

async fn shutdown_signal() {
    let ctrl_c = async {
        let _ = tokio::signal::ctrl_c().await;
    };
    #[cfg(unix)]
    let terminate = async {
        match tokio::signal::unix::signal(tokio::signal::unix::SignalKind::terminate()) {
            Ok(mut s) => {
                s.recv().await;
            }
            Err(_) => std::future::pending::<()>().await,
        }
    };
    #[cfg(not(unix))]
    let terminate = std::future::pending::<()>();
    tokio::select! { _ = ctrl_c => {}, _ = terminate => {} }
    tracing::info!("shutdown signal received");
}

#[tokio::main]
async fn main() -> ExitCode {
    tracing_subscriber::fmt()
        .json()
        .with_env_filter(
            tracing_subscriber::EnvFilter::try_from_default_env().unwrap_or_else(|_| tracing_subscriber::EnvFilter::new("info")),
        )
        .init();

    let args: Vec<String> = std::env::args().skip(1).collect();
    let result = match args.first().map(String::as_str) {
        Some("mint") => mint(&args[1..]),
        _ => serve().await,
    };
    match result {
        Ok(()) => ExitCode::SUCCESS,
        Err(e) => {
            tracing::error!(error = %e, "fatal");
            ExitCode::FAILURE
        }
    }
}
