// Prevents additional console window on Windows in release, DO NOT REMOVE!!
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

//! Aerial desktop shell.
//!
//! IPC surface (all inputs validated in `security`):
//!   boards   load_board_scene · save_board_changes · delete_board
//!   assets   save_asset · load_asset · read_dropped_image
//!   diagrams render_diagram · update_diagram_node · openrouter_generate
//!   window   hide_window

mod ai;
mod diagram;
mod security;
mod storage;

use std::sync::Arc;

use base64::{engine::general_purpose::STANDARD, Engine as _};
use tauri::{Emitter, Manager, State, Window};

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

#[tauri::command]
fn hide_window(window: Window) -> Result<(), String> {
    window.hide().map_err(|e| e.to_string())
}

fn show_main(app: &tauri::AppHandle, quick_note: bool) {
    if let Some(window) = app.get_webview_window("main") {
        let _ = window.unminimize();
        let _ = window.show();
        let _ = window.set_focus();
        if quick_note {
            let _ = window.emit("quick-canvas:open", true);
        }
    }
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

    let builder = tauri::Builder::default().plugin(tauri_plugin_http::init());

    let builder = builder.on_window_event(|window, event| match event {
        tauri::WindowEvent::DragDrop(tauri::DragDropEvent::Drop { paths, .. }) => {
            if let Some(state) = window.try_state::<AppState>() {
                state.drops.grant(paths);
            }
        }
        #[cfg(desktop)]
        tauri::WindowEvent::CloseRequested { api, .. } => {
            // Keep the app resident in the background (menu bar / tray).
            let _ = window.hide();
            api.prevent_close();
        }
        _ => {}
    });

    #[cfg(desktop)]
    let builder = builder.plugin(
        tauri_plugin_global_shortcut::Builder::new()
            .with_handler(|app, _shortcut, event| {
                if event.state() == tauri_plugin_global_shortcut::ShortcutState::Pressed {
                    show_main(app, true);
                }
            })
            .build(),
    );

    let result = builder
        .setup(|app| {
            let app_data_dir = app.path().app_data_dir().map_err(|e| e.to_string())?;
            let store = Store::open(&app_data_dir)?;
            app.manage(AppState { store: Arc::new(store), drops: DropGrants::default() });

            #[cfg(desktop)]
            setup_desktop(app);
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            load_board_scene,
            save_board_changes,
            delete_board,
            save_asset,
            load_asset,
            read_dropped_image,
            hide_window,
            ai::openrouter_generate,
            diagram::render_diagram,
            diagram::update_diagram_node
        ])
        .run(tauri::generate_context!());

    if let Err(e) = result {
        tracing::error!(error = %e, "Aerial failed to start");
        std::process::exit(1);
    }
}

#[cfg(desktop)]
fn setup_desktop(app: &tauri::App) {
    use tauri::menu::{Menu, MenuItem};
    use tauri::tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent};
    use tauri_plugin_global_shortcut::GlobalShortcutExt;

    // Global shortcuts for the instant Quick Canvas.
    for combo in ["alt+space", "super+shift+a"] {
        match combo.parse::<tauri_plugin_global_shortcut::Shortcut>() {
            Ok(shortcut) => {
                if let Err(e) = app.global_shortcut().register(shortcut) {
                    tracing::warn!(combo, error = %e, "global shortcut unavailable");
                }
            }
            Err(e) => tracing::warn!(combo, error = %e, "invalid shortcut"),
        }
    }

    // Menu bar tray icon.
    let items = (
        MenuItem::with_id(app, "quick_note", "Quick Note (⌥Space / ⌘⇧A)", true, None::<&str>),
        MenuItem::with_id(app, "show", "Open Aerial Canvas", true, None::<&str>),
        MenuItem::with_id(app, "quit", "Quit Aerial", true, None::<&str>),
    );
    let (Ok(note), Ok(show), Ok(quit)) = items else {
        tracing::warn!("tray menu items could not be created");
        return;
    };
    let Ok(menu) = Menu::with_items(app, &[&note, &show, &quit]) else {
        tracing::warn!("tray menu could not be created");
        return;
    };
    let mut tray = TrayIconBuilder::new()
        .menu(&menu)
        .show_menu_on_left_click(false)
        .on_menu_event(|app, event| match event.id.as_ref() {
            "quit" => app.exit(0),
            "show" => show_main(app, false),
            "quick_note" => show_main(app, true),
            _ => {}
        })
        .on_tray_icon_event(|tray, event| {
            if let TrayIconEvent::Click { button: MouseButton::Left, button_state: MouseButtonState::Up, .. } = event {
                show_main(tray.app_handle(), true);
            }
        });
    if let Some(icon) = app.default_window_icon() {
        tray = tray.icon(icon.clone());
    }
    if let Err(e) = tray.build(app) {
        tracing::warn!(error = %e, "tray icon could not be created");
    }
}
