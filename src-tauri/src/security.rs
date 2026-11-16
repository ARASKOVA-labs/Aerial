//! Input validation and capability checks for IPC commands.
//!
//! Every value arriving over IPC is treated as untrusted: the webview renders
//! user and AI-generated content, so a compromised page must not be able to
//! escape the app data directory, exhaust memory, or read arbitrary files.

use std::collections::HashSet;
use std::path::{Path, PathBuf};
use std::sync::Mutex;
use std::time::{Duration, Instant};

pub const MAX_ID_LEN: usize = 128;
/// Upper bound for a single base64 image asset (data URL).
pub const MAX_ASSET_BYTES: usize = 40 * 1024 * 1024;
/// Upper bound for one autosave change batch.
pub const MAX_CHANGES_BYTES: usize = 256 * 1024 * 1024;
/// Upper bound for a single dropped file read from disk.
pub const MAX_DROPPED_FILE_BYTES: u64 = 25 * 1024 * 1024;
pub const MAX_DIAGRAM_SOURCE_BYTES: usize = 64 * 1024;
pub const MAX_PROMPT_BYTES: usize = 32 * 1024;
/// Dropped paths stay readable for this long after the drop event.
const DROP_GRANT_TTL: Duration = Duration::from_secs(60);

pub const IMAGE_EXTENSIONS: &[(&str, &str)] = &[
    ("png", "image/png"),
    ("jpg", "image/jpeg"),
    ("jpeg", "image/jpeg"),
    ("webp", "image/webp"),
    ("gif", "image/gif"),
    ("bmp", "image/bmp"),
    ("tif", "image/tiff"),
    ("tiff", "image/tiff"),
    ("svg", "image/svg+xml"),
];

/// Board and asset identifiers become file names and database keys, so they
/// are restricted to a filename-safe alphabet with no path separators.
pub fn validate_id(kind: &str, id: &str) -> Result<(), String> {
    let ok = !id.is_empty()
        && id.len() <= MAX_ID_LEN
        && id.bytes().all(|b| b.is_ascii_alphanumeric() || b == b'_' || b == b'-')
        && !id.starts_with('-');
    if ok {
        Ok(())
    } else {
        tracing::warn!(target: "audit", kind, "rejected invalid identifier");
        Err(format!("invalid {kind} id"))
    }
}

pub fn validate_len(what: &str, len: usize, max: usize) -> Result<(), String> {
    if len > max {
        tracing::warn!(target: "audit", what, len, max, "rejected oversized payload");
        Err(format!("{what} exceeds the {max}-byte limit"))
    } else {
        Ok(())
    }
}

/// Image assets are stored as data URLs; only raster/SVG image types are
/// accepted (SVG is only ever rendered through <img>, where scripts never run).
pub fn validate_image_data_url(data: &str) -> Result<(), String> {
    validate_len("asset", data.len(), MAX_ASSET_BYTES)?;
    let allowed = IMAGE_EXTENSIONS.iter().any(|(_, mime)| data.starts_with(&format!("data:{mime};base64,")));
    if allowed {
        Ok(())
    } else {
        tracing::warn!(target: "audit", "rejected asset with unsupported data URL type");
        Err("unsupported asset type".to_string())
    }
}

/// Reads a regular file of at most `max` bytes.
///
/// The limit is enforced on the bytes actually read, not on a size checked
/// beforehand: a file can grow (or be swapped) between the check and the
/// read, and the whole thing would otherwise be pulled into memory.
pub fn read_capped(path: &Path, max: u64) -> Result<Vec<u8>, String> {
    use std::io::Read;
    let file = std::fs::File::open(path).map_err(|_| "file not readable".to_string())?;
    let meta = file.metadata().map_err(|_| "file not readable".to_string())?;
    if !meta.is_file() || meta.len() > max {
        return Err("file is too large or not a regular file".to_string());
    }
    let mut bytes = Vec::with_capacity(meta.len() as usize);
    file.take(max + 1).read_to_end(&mut bytes).map_err(|_| "file not readable".to_string())?;
    if bytes.len() as u64 > max {
        tracing::warn!(target: "audit", "rejected a file that grew past the size limit while being read");
        return Err("file is too large".to_string());
    }
    Ok(bytes)
}

/// Restricts a directory to its owner (0700). Boards are plaintext on disk
/// where the platform has no credential store, and the MCP socket lives here
/// too; other local accounts have no business reading either.
#[cfg(unix)]
pub fn make_private_dir(dir: &Path) {
    use std::os::unix::fs::PermissionsExt;
    if let Err(e) = std::fs::set_permissions(dir, std::fs::Permissions::from_mode(0o700)) {
        tracing::warn!(error = %e, "could not restrict the data directory to its owner");
    }
}

#[cfg(not(unix))]
pub fn make_private_dir(_dir: &Path) {}

pub fn image_mime_for(path: &Path) -> Option<&'static str> {
    let ext = path.extension()?.to_str()?.to_ascii_lowercase();
    IMAGE_EXTENSIONS.iter().find(|(e, _)| *e == ext).map(|(_, m)| *m)
}

/// Paths the user dropped onto the window. The webview can only read a file
/// from disk if the OS reported it in a drop event moments earlier — this
/// replaces the old `fs:scope ["**"]` grant, which let any script read any
/// file the user could.
#[derive(Default)]
pub struct DropGrants {
    inner: Mutex<(HashSet<PathBuf>, Option<Instant>)>,
}

impl DropGrants {
    pub fn grant(&self, paths: &[PathBuf]) {
        if let Ok(mut g) = self.inner.lock() {
            g.0 = paths.iter().filter_map(|p| p.canonicalize().ok()).collect();
            g.1 = Some(Instant::now());
        }
    }

    #[cfg(test)]
    pub fn is_granted(&self, path: &Path) -> bool {
        self.resolve(path).is_some()
    }

    /// The canonical path of a granted file. Read *this* path, not the one
    /// that was asked for: resolving again later would let a symlink be
    /// re-pointed between the check and the read.
    pub fn resolve(&self, path: &Path) -> Option<PathBuf> {
        let canonical = path.canonicalize().ok()?;
        let g = self.inner.lock().ok()?;
        (g.1.is_some_and(|t| t.elapsed() < DROP_GRANT_TTL) && g.0.contains(&canonical)).then_some(canonical)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn ids_reject_traversal_and_junk() {
        for bad in ["", "../etc/passwd", "a/b", "a\\b", "..", "-rf", "a b", "x".repeat(129).as_str(), "é"] {
            assert!(validate_id("asset", bad).is_err(), "{bad:?}");
        }
        for good in ["default_board", "board-1695", "asset_9f8e7d"] {
            assert!(validate_id("board", good).is_ok(), "{good:?}");
        }
    }

    #[test]
    fn data_url_allowlist() {
        assert!(validate_image_data_url("data:image/png;base64,AAAA").is_ok());
        assert!(validate_image_data_url("data:text/html;base64,AAAA").is_err());
        assert!(validate_image_data_url("javascript:alert(1)").is_err());
    }

    #[test]
    fn capped_read_enforces_the_limit_on_what_is_read() {
        let dir = std::env::temp_dir().join(format!("aerial-read-test-{}", std::process::id()));
        std::fs::create_dir_all(&dir).unwrap();
        let file = dir.join("a.bin");
        std::fs::write(&file, vec![7u8; 1000]).unwrap();
        assert_eq!(read_capped(&file, 1000).unwrap().len(), 1000);
        assert!(read_capped(&file, 999).is_err());
        assert!(read_capped(&dir, 1000).is_err(), "directories are not files");
        assert!(read_capped(&dir.join("missing"), 1000).is_err());
        std::fs::remove_dir_all(&dir).unwrap();
    }

    #[cfg(unix)]
    #[test]
    fn data_directory_is_owner_only() {
        use std::os::unix::fs::PermissionsExt;
        let dir = std::env::temp_dir().join(format!("aerial-private-test-{}", std::process::id()));
        std::fs::create_dir_all(&dir).unwrap();
        make_private_dir(&dir);
        assert_eq!(std::fs::metadata(&dir).unwrap().permissions().mode() & 0o777, 0o700);
        std::fs::remove_dir_all(&dir).unwrap();
    }

    #[test]
    fn drop_grants_are_exact_and_expire() {
        let dir = std::env::temp_dir().join(format!("aerial-grant-test-{}", std::process::id()));
        std::fs::create_dir_all(&dir).unwrap();
        let file = dir.join("shot.png");
        std::fs::write(&file, b"x").unwrap();
        let grants = DropGrants::default();
        assert!(!grants.is_granted(&file));
        grants.grant(std::slice::from_ref(&file));
        assert!(grants.is_granted(&file));
        assert!(!grants.is_granted(&dir.join("other.png")));
        // A traversal spelling of the same file still resolves to the grant…
        assert!(grants.is_granted(&dir.join("..").join(dir.file_name().unwrap()).join("shot.png")));
        // …but a new drop replaces the previous grant set.
        grants.grant(&[]);
        assert!(!grants.is_granted(&file));
        std::fs::remove_dir_all(&dir).unwrap();
    }
}
