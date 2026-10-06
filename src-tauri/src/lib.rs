// Prevents additional console window on Windows in release, DO NOT REMOVE!!
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]
// The MCP tool catalogue (mcp.rs) is one large json! literal.
#![recursion_limit = "512"]

//! Aerial desktop shell.
//!
//! IPC surface (all inputs validated in `security`):
//!   boards   load_board_scene · save_board_changes · delete_board
//!   assets   save_asset · load_asset · read_dropped_image
//!   storage  storage_status
//!   agent    agent_respond (MCP bridge, see agent.rs / mcp.rs)
//!   files    save_aerial_file · open_aerial_file · take_opened_files
//!   diagrams render_diagram · update_diagram_node · openrouter_generate

mod agent;
mod ai;
mod diagram;
mod files;
mod mcp;
mod security;
mod storage;
mod vault;

use std::sync::Arc;

use base64::{engine::general_purpose::STANDARD, Engine as _};
use tauri::{Manager, State};

use security::{image_mime_for, DropGrants, MAX_DROPPED_FILE_BYTES};
use storage::Store;

struct AppState {
    store: Arc<Store>,
    drops: DropGrants,
}

/// Runs blocking storage work on the blocking pool, off the async runtime.
async fn blocking<T: Send + 'static>(
    state: &State<'_, AppState>,
    f: impl FnOnce(&Store) -> Result<T, String> + Send + 'static,
) -> Result<T, String> {
    let store = Arc::clone(&state.store);
    tokio::task::spawn_blocking(move || f(&store)).await.map_err(|_| "storage task failed".to_string())?
}

#[tauri::command]
async fn load_board_scene(state: State<'_, AppState>, board_id: String) -> Result<Option<String>, String> {
    blocking(&state, move |s| s.load_scene(&board_id)).await
}

#[tauri::command]
async fn save_board_changes(state: State<'_, AppState>, board_id: String, changes: String) -> Result<(), String> {
    blocking(&state, move |s| s.apply_changes(&board_id, &changes)).await
}

#[tauri::command]
async fn delete_board(state: State<'_, AppState>, board_id: String) -> Result<usize, String> {
    blocking(&state, move |s| s.delete_board(&board_id)).await
}

#[tauri::command]
async fn save_asset(state: State<'_, AppState>, id: String, base64_data: String) -> Result<(), String> {
    blocking(&state, move |s| s.save_asset(&id, &base64_data)).await
}

#[tauri::command]
async fn load_asset(state: State<'_, AppState>, id: String) -> Result<String, String> {
    blocking(&state, move |s| s.load_asset(&id)).await
}

/// Whether stored boards are encrypted at rest (`encrypted`), the key is
/// unavailable (`locked`), or the platform has no credential store.
#[tauri::command]
fn storage_status(state: State<'_, AppState>) -> vault::VaultState {
    state.store.vault_state()
}

/// Reads an image the user just dropped onto the window and returns it as a
/// data URL. Only paths reported by the OS drop event in the last minute are
/// readable, only image extensions are accepted, and size is capped.
#[tauri::command]
async fn read_dropped_image(state: State<'_, AppState>, path: String) -> Result<String, String> {
    let path = std::path::PathBuf::from(path);
    if !state.drops.is_granted(&path) {
        tracing::warn!(target: "audit", "rejected read of a path that was not dropped by the user");
        return Err("file was not dropped onto Aerial".to_string());
    }
    let mime = image_mime_for(&path).ok_or("unsupported file type")?;
    let meta = std::fs::metadata(&path).map_err(|_| "file not readable".to_string())?;
    if !meta.is_file() || meta.len() > MAX_DROPPED_FILE_BYTES {
        return Err("file is too large or not a regular file".to_string());
    }
    let bytes = tokio::task::spawn_blocking(move || std::fs::read(path))
        .await
        .map_err(|_| "read failed".to_string())?
        .map_err(|_| "file not readable".to_string())?;
    Ok(format!("data:{mime};base64,{}", STANDARD.encode(bytes)))
}

fn init_tracing() {
    // Structured logs to stderr. `audit` target lines record security-relevant
    // events (rejected input, deletions, AI requests) without user content.
    let _ = tracing_subscriber::fmt()
        .with_env_filter(
            tracing_subscriber::EnvFilter::try_from_default_env().unwrap_or_else(|_| tracing_subscriber::EnvFilter::new("info")),
        )
        .with_target(true)
        .try_init();
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    init_tracing();

    let builder = tauri::Builder::default().plugin(tauri_plugin_http::init()).plugin(tauri_plugin_dialog::init());

    let builder = builder.on_window_event(|window, event| match event {
        tauri::WindowEvent::DragDrop(tauri::DragDropEvent::Drop { paths, .. }) => {
            if let Some(state) = window.try_state::<AppState>() {
                state.drops.grant(paths);
            }
        }
        _ => {}
    });

    let result = builder
        .setup(|app| {
            let app_data_dir = app.path().app_data_dir().map_err(|e| e.to_string())?;
            let store = Store::open(&app_data_dir, vault::Vault::open())?;
            app.manage(AppState { store: Arc::new(store), drops: DropGrants::default() });
            app.manage(files::PendingOpens::default());
            app.manage(agent::AgentBridge::default());
            agent::start(app.handle(), &app_data_dir);

            // Windows and Linux pass files opened with Aerial as arguments.
            #[cfg(any(target_os = "windows", target_os = "linux"))]
            files::handle_opened_paths(app.handle(), std::env::args_os().skip(1).map(std::path::PathBuf::from));

            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            load_board_scene,
            save_board_changes,
            delete_board,
            save_asset,
            load_asset,
            storage_status,
            read_dropped_image,
            ai::openrouter_generate,
            diagram::render_diagram,
            diagram::update_diagram_node,
            files::save_aerial_file,
            files::open_aerial_file,
            files::take_opened_files,
            agent::agent_respond
        ])
        .build(tauri::generate_context!());

    let app = match result {
        Ok(app) => app,
        Err(e) => {
            tracing::error!(error = %e, "Aerial failed to start");
            std::process::exit(1);
        }
    };
    app.run(|app, event| match event {
        // macOS / iOS deliver files opened with Aerial (Finder, Open With) here.
        #[cfg(any(target_os = "macos", target_os = "ios"))]
        tauri::RunEvent::Opened { urls } => {
            files::handle_opened_paths(app, urls.into_iter().filter_map(|u| u.to_file_path().ok()));
        }
        tauri::RunEvent::Exit => {
            if let Ok(dir) = app.path().app_data_dir() {
                agent::stop(&dir);
            }
        }
        _ => {}
    });
}

/// `Aerial mcp`: serve the Model Context Protocol on stdio (no window).
pub fn run_mcp() {
    mcp::run_stdio();
}
