//! `.aerial` board files: native Save / Open dialogs, and files the OS opens
//! with Aerial (double-click in Finder, "Open With", or a launch argument).
//!
//! The webview never gets a file path or a general file-system capability: it
//! hands over finished file contents to save, and receives the contents of a
//! file the user picked or opened. Encryption and validation of the contents
//! happen in the frontend (`src/lib/aerial-file.ts`) so files stay portable to
//! the web build.

use std::io::Write;
use std::path::{Path, PathBuf};
use std::sync::Mutex;

use serde::Serialize;
use tauri::{AppHandle, Emitter, Manager, Runtime, State};
use tauri_plugin_dialog::DialogExt;

use crate::security::validate_len;

pub const EXTENSION: &str = "aerial";
/// Mirrors MAX_AERIAL_FILE_BYTES in src/lib/aerial-file.ts.
pub const MAX_AERIAL_FILE_BYTES: usize = 512 * 1024 * 1024;
/// Event telling the webview that `take_opened_files` has something for it.
pub const OPENED_EVENT: &str = "aerial://file-opened";

#[derive(Serialize, Clone)]
pub struct OpenedFile {
    /// File name without the extension (used as the board name).
    name: String,
    contents: String,
}

/// Files opened by the OS before (or while) the webview listens for them.
#[derive(Default)]
pub struct PendingOpens(Mutex<Vec<OpenedFile>>);

fn has_aerial_extension(path: &Path) -> bool {
    path.extension().and_then(|e| e.to_str()).is_some_and(|e| e.eq_ignore_ascii_case(EXTENSION))
}

/// Reads an `.aerial` file: right extension, a regular file, size-capped, UTF-8.
fn read_aerial(path: &Path) -> Result<OpenedFile, String> {
    if !has_aerial_extension(path) {
        return Err("not an .aerial file".to_string());
    }
    let meta = std::fs::metadata(path).map_err(|_| "file not readable".to_string())?;
    if !meta.is_file() || meta.len() > MAX_AERIAL_FILE_BYTES as u64 {
        return Err("file is too large or not a regular file".to_string());
    }
    let contents = std::fs::read_to_string(path).map_err(|_| "file is not a readable .aerial file".to_string())?;
    let name = path.file_stem().and_then(|s| s.to_str()).unwrap_or("Board").chars().take(80).collect();
    tracing::info!(target: "audit", bytes = contents.len(), "opened .aerial file");
    Ok(OpenedFile { name, contents })
}

/// A file name the save dialog can propose: no separators or control chars.
fn safe_file_name(suggested: &str) -> String {
    let base: String = suggested
        .trim_end_matches(&format!(".{EXTENSION}"))
        .chars()
        .map(|c| if c.is_control() || "\\/:*?\"<>|".contains(c) { ' ' } else { c })
        .take(80)
        .collect();
    let base = base.trim();
    format!("{}.{EXTENSION}", if base.is_empty() { "Board" } else { base })
}

/// Writes via a temporary sibling and a rename, so a crash never leaves a
/// half-written file in place of a good one.
fn write_atomic(path: &Path, contents: &[u8]) -> std::io::Result<()> {
    let tmp = path.with_extension(format!("{EXTENSION}.tmp-{}", std::process::id()));
    {
        let mut f = std::fs::File::create(&tmp)?;
        f.write_all(contents)?;
        f.sync_all()?;
    }
    std::fs::rename(&tmp, path).inspect_err(|_| {
        let _ = std::fs::remove_file(&tmp);
    })
}

/// Shows the Save dialog and writes `contents`. Returns the saved file name,
/// or None if the user cancelled.
#[tauri::command]
pub async fn save_aerial_file(app: AppHandle, suggested_name: String, contents: String) -> Result<Option<String>, String> {
    validate_len(".aerial file", contents.len(), MAX_AERIAL_FILE_BYTES)?;
    let file_name = safe_file_name(&suggested_name);
    tokio::task::spawn_blocking(move || {
        let Some(picked) = app.dialog().file().set_file_name(&file_name).add_filter("Aerial board", &[EXTENSION]).blocking_save_file() else {
            return Ok(None);
        };
        let mut path: PathBuf = picked.into_path().map_err(|_| "unsupported save location".to_string())?;
        if !has_aerial_extension(&path) {
            path.set_extension(EXTENSION);
        }
        write_atomic(&path, contents.as_bytes()).map_err(|e| {
            tracing::error!(error = %e, "saving .aerial file failed");
            "could not write the file".to_string()
        })?;
        tracing::info!(target: "audit", bytes = contents.len(), "saved .aerial file");
        Ok(path.file_name().and_then(|n| n.to_str()).map(str::to_string))
    })
    .await
    .map_err(|_| "save task failed".to_string())?
}

/// Shows the Open dialog for `.aerial` files. None if the user cancelled.
#[tauri::command]
pub async fn open_aerial_file(app: AppHandle) -> Result<Option<OpenedFile>, String> {
    tokio::task::spawn_blocking(move || {
        let Some(picked) = app.dialog().file().add_filter("Aerial board", &[EXTENSION]).blocking_pick_file() else {
            return Ok(None);
        };
        let path = picked.into_path().map_err(|_| "unsupported file location".to_string())?;
        read_aerial(&path).map(Some)
    })
    .await
    .map_err(|_| "open task failed".to_string())?
}

/// Hands the webview every file the OS asked Aerial to open, once.
#[tauri::command]
pub fn take_opened_files(state: State<'_, PendingOpens>) -> Vec<OpenedFile> {
    state.0.lock().map(|mut q| std::mem::take(&mut *q)).unwrap_or_default()
}

/// Queues OS-opened `.aerial` paths and tells the webview to collect them.
pub fn handle_opened_paths<R: Runtime>(app: &AppHandle<R>, paths: impl IntoIterator<Item = PathBuf>) {
    let mut opened = Vec::new();
    for path in paths {
        if !has_aerial_extension(&path) {
            continue;
        }
        match read_aerial(&path) {
            Ok(file) => opened.push(file),
            Err(e) => tracing::warn!(error = %e, "ignored a file the OS asked Aerial to open"),
        }
    }
    if opened.is_empty() {
        return;
    }
    if let Some(state) = app.try_state::<PendingOpens>() {
        if let Ok(mut q) = state.0.lock() {
            q.extend(opened);
        }
    }
    if let Some(window) = app.get_webview_window("main") {
        let _ = window.show();
        let _ = window.set_focus();
    }
    let _ = app.emit(OPENED_EVENT, ());
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn file_names_are_sanitised() {
        assert_eq!(safe_file_name("Roadmap"), "Roadmap.aerial");
        assert_eq!(safe_file_name("Roadmap.aerial"), "Roadmap.aerial");
        assert_eq!(safe_file_name("../../etc/passwd"), ".. .. etc passwd.aerial");
        assert_eq!(safe_file_name("  "), "Board.aerial");
    }

    #[test]
    fn reads_only_aerial_files_and_writes_atomically() {
        let dir = std::env::temp_dir().join(format!("aerial-files-test-{}", std::process::id()));
        std::fs::create_dir_all(&dir).unwrap();
        let good = dir.join("Plan.aerial");
        write_atomic(&good, br#"{"format":"aerial"}"#).unwrap();
        let f = read_aerial(&good).unwrap();
        assert_eq!(f.name, "Plan");
        assert_eq!(f.contents, r#"{"format":"aerial"}"#);
        let other = dir.join("notes.txt");
        std::fs::write(&other, "x").unwrap();
        assert!(read_aerial(&other).is_err());
        assert!(read_aerial(&dir).is_err());
        // No temporary files are left behind.
        assert_eq!(std::fs::read_dir(&dir).unwrap().count(), 2);
        std::fs::remove_dir_all(&dir).unwrap();
    }
}
