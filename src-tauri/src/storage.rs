//! Board persistence on redb.
//!
//! Schema v3 stores one row per element keyed by (board_id, element_id), so an
//! autosave writes only what changed instead of re-serialising the whole board
//! every 500 ms. Boards saved by older builds (one JSON blob per board in
//! `boards_v2`) are migrated transparently on first load.

use std::path::{Path, PathBuf};

use redb::{Database, ReadableTable, TableDefinition};
use serde::Deserialize;
use serde_json::value::RawValue;

use crate::security::{validate_id, validate_image_data_url, validate_len, MAX_CHANGES_BYTES};

const LEGACY_BOARDS: TableDefinition<&str, &[u8]> = TableDefinition::new("boards_v2");
const ELEMENTS: TableDefinition<(&str, u64), &[u8]> = TableDefinition::new("board_elements_v3");
const BOARD_META: TableDefinition<&str, &[u8]> = TableDefinition::new("board_meta_v3");

/// Per-element ceiling (diagrams embed SVG). Mirrors the engine's own limit.
const MAX_ELEMENT_BYTES: usize = 32 * 1024 * 1024;

fn db_err(e: impl std::fmt::Display) -> String {
    tracing::error!(error = %e, "storage error");
    "storage error".to_string()
}

#[derive(Deserialize)]
struct ElementKey {
    id: u64,
    #[serde(default)]
    z: u64,
    #[serde(default)]
    asset_id: Option<String>,
}

#[derive(Deserialize)]
struct ChangeSet<'a> {
    #[serde(default)]
    reset: bool,
    #[serde(borrow, default)]
    upserts: Vec<&'a RawValue>,
    #[serde(default)]
    deletes: Vec<u64>,
}

#[derive(Deserialize)]
struct LegacyScene<'a> {
    #[serde(borrow, default)]
    elements: Vec<&'a RawValue>,
}

pub struct Store {
    db: Database,
    assets_dir: PathBuf,
}

impl Store {
    pub fn open(app_data_dir: &Path) -> Result<Store, String> {
        std::fs::create_dir_all(app_data_dir).map_err(db_err)?;
        let db = Database::create(app_data_dir.join("aerial_store.redb")).map_err(db_err)?;
        let txn = db.begin_write().map_err(db_err)?;
        {
            txn.open_table(LEGACY_BOARDS).map_err(db_err)?;
            txn.open_table(ELEMENTS).map_err(db_err)?;
            txn.open_table(BOARD_META).map_err(db_err)?;
        }
        txn.commit().map_err(db_err)?;
        Ok(Store { db, assets_dir: app_data_dir.join("assets") })
    }

    /// Returns the board as scene JSON (`{"elements":[...]}` in paint order),
    /// or None if the board has never been saved.
    pub fn load_scene(&self, board_id: &str) -> Result<Option<String>, String> {
        validate_id("board", board_id)?;
        let has_v3 = {
            let txn = self.db.begin_read().map_err(db_err)?;
            let meta = txn.open_table(BOARD_META).map_err(db_err)?;
            meta.get(board_id).map_err(db_err)?.is_some()
        };
        if !has_v3 && !self.migrate_legacy(board_id)? {
            return Ok(None);
        }

        let txn = self.db.begin_read().map_err(db_err)?;
        let table = txn.open_table(ELEMENTS).map_err(db_err)?;
        let mut rows: Vec<((u64, u64), Vec<u8>)> = Vec::new();
        for row in table.range((board_id, 0u64)..=(board_id, u64::MAX)).map_err(db_err)? {
            let (_, value) = row.map_err(db_err)?;
            let bytes = value.value().to_vec();
            match serde_json::from_slice::<ElementKey>(&bytes) {
                Ok(k) => rows.push(((k.z, k.id), bytes)),
                Err(_) => tracing::warn!(board_id, "skipping unreadable element row"),
            }
        }
        rows.sort_unstable_by_key(|(k, _)| *k);
        let total: usize = rows.iter().map(|(_, b)| b.len() + 1).sum();
        let mut out = Vec::with_capacity(total + 16);
        out.extend_from_slice(b"{\"elements\":[");
        for (i, (_, bytes)) in rows.iter().enumerate() {
            if i > 0 {
                out.push(b',');
            }
            out.extend_from_slice(bytes);
        }
        out.extend_from_slice(b"]}");
        String::from_utf8(out).map(Some).map_err(db_err)
    }

    /// Applies an engine change set (`take_changes()` output) atomically.
    pub fn apply_changes(&self, board_id: &str, changes_json: &str) -> Result<(), String> {
        validate_id("board", board_id)?;
        validate_len("change set", changes_json.len(), MAX_CHANGES_BYTES)?;
        let changes: ChangeSet = serde_json::from_str(changes_json).map_err(|_| "malformed change set".to_string())?;

        let txn = self.db.begin_write().map_err(db_err)?;
        {
            let mut table = txn.open_table(ELEMENTS).map_err(db_err)?;
            if changes.reset {
                table
                    .retain_in((board_id, 0u64)..=(board_id, u64::MAX), |_, _| false)
                    .map_err(db_err)?;
            }
            for raw in &changes.upserts {
                let text = raw.get();
                validate_len("element", text.len(), MAX_ELEMENT_BYTES)?;
                let key: ElementKey = serde_json::from_str(text).map_err(|_| "malformed element".to_string())?;
                if key.id == 0 {
                    return Err("element id must be non-zero".to_string());
                }
                table.insert((board_id, key.id), text.as_bytes()).map_err(db_err)?;
            }
            for id in &changes.deletes {
                table.remove((board_id, *id)).map_err(db_err)?;
            }
            let mut meta = txn.open_table(BOARD_META).map_err(db_err)?;
            meta.insert(board_id, br#"{"schema":3}"#.as_slice()).map_err(db_err)?;
        }
        txn.commit().map_err(db_err)
    }

    /// Permanently deletes a board's rows plus any image assets no other board
    /// references. Returns the number of assets removed.
    pub fn delete_board(&self, board_id: &str) -> Result<usize, String> {
        validate_id("board", board_id)?;
        let mut candidate_assets = Vec::new();
        let txn = self.db.begin_write().map_err(db_err)?;
        {
            let mut table = txn.open_table(ELEMENTS).map_err(db_err)?;
            for row in table.range((board_id, 0u64)..=(board_id, u64::MAX)).map_err(db_err)? {
                let (_, v) = row.map_err(db_err)?;
                if let Ok(ElementKey { asset_id: Some(a), .. }) = serde_json::from_slice(v.value()) {
                    candidate_assets.push(a);
                }
            }
            table.retain_in((board_id, 0u64)..=(board_id, u64::MAX), |_, _| false).map_err(db_err)?;
            txn.open_table(BOARD_META).map_err(db_err)?.remove(board_id).map_err(db_err)?;
            txn.open_table(LEGACY_BOARDS).map_err(db_err)?.remove(board_id).map_err(db_err)?;
        }
        txn.commit().map_err(db_err)?;

        // Keep assets still referenced elsewhere (images pasted into two boards).
        let still_used: std::collections::HashSet<String> = {
            let txn = self.db.begin_read().map_err(db_err)?;
            let table = txn.open_table(ELEMENTS).map_err(db_err)?;
            let mut used = std::collections::HashSet::new();
            for row in table.iter().map_err(db_err)? {
                let (_, v) = row.map_err(db_err)?;
                if let Ok(ElementKey { asset_id: Some(a), .. }) = serde_json::from_slice(v.value()) {
                    used.insert(a);
                }
            }
            used
        };
        let mut removed = 0;
        for asset in candidate_assets {
            if !still_used.contains(&asset) && validate_id("asset", &asset).is_ok() {
                let path = self.assets_dir.join(&asset);
                if path.exists() && std::fs::remove_file(&path).is_ok() {
                    removed += 1;
                }
            }
        }
        tracing::info!(target: "audit", board_id, assets_removed = removed, "board deleted");
        Ok(removed)
    }

    fn migrate_legacy(&self, board_id: &str) -> Result<bool, String> {
        let blob = {
            let txn = self.db.begin_read().map_err(db_err)?;
            let legacy = txn.open_table(LEGACY_BOARDS).map_err(db_err)?;
            match legacy.get(board_id).map_err(db_err)? {
                Some(v) => v.value().to_vec(),
                None => return Ok(false),
            }
        };
        let scene: LegacyScene = serde_json::from_slice(&blob).map_err(|_| "legacy board is unreadable".to_string())?;
        let txn = self.db.begin_write().map_err(db_err)?;
        let mut migrated = 0usize;
        {
            let mut table = txn.open_table(ELEMENTS).map_err(db_err)?;
            for (i, raw) in scene.elements.iter().enumerate() {
                let Ok(key) = serde_json::from_str::<ElementKey>(raw.get()) else { continue };
                if key.id == 0 {
                    continue;
                }
                // Legacy rows have no z; inject array order so paint order survives.
                let mut value: serde_json::Value = match serde_json::from_str(raw.get()) {
                    Ok(v) => v,
                    Err(_) => continue,
                };
                if key.z == 0 {
                    value["z"] = serde_json::json!(i as u64 + 1);
                }
                let bytes = serde_json::to_vec(&value).map_err(db_err)?;
                table.insert((board_id, key.id), bytes.as_slice()).map_err(db_err)?;
                migrated += 1;
            }
            txn.open_table(BOARD_META).map_err(db_err)?.insert(board_id, br#"{"schema":3}"#.as_slice()).map_err(db_err)?;
            // Drop the old copy: one authoritative copy of user data.
            txn.open_table(LEGACY_BOARDS).map_err(db_err)?.remove(board_id).map_err(db_err)?;
        }
        txn.commit().map_err(db_err)?;
        tracing::info!(target: "audit", board_id, migrated, "migrated legacy board to schema v3");
        Ok(true)
    }

    // ── Assets ────────────────────────────────────────────────────────────────

    pub fn save_asset(&self, id: &str, data_url: &str) -> Result<(), String> {
        validate_id("asset", id)?;
        validate_image_data_url(data_url)?;
        std::fs::create_dir_all(&self.assets_dir).map_err(db_err)?;
        // Write-then-rename so a crash never leaves a truncated asset.
        let tmp = self.assets_dir.join(format!(".{id}.tmp"));
        std::fs::write(&tmp, data_url).map_err(db_err)?;
        std::fs::rename(&tmp, self.assets_dir.join(id)).map_err(db_err)
    }

    pub fn load_asset(&self, id: &str) -> Result<String, String> {
        validate_id("asset", id)?;
        std::fs::read_to_string(self.assets_dir.join(id)).map_err(|_| "asset not found".to_string())
    }

    #[cfg(test)]
    fn put_legacy(&self, board_id: &str, json: &str) {
        let txn = self.db.begin_write().unwrap();
        txn.open_table(LEGACY_BOARDS).unwrap().insert(board_id, json.as_bytes()).unwrap();
        txn.commit().unwrap();
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn store() -> (Store, PathBuf) {
        let dir = std::env::temp_dir().join(format!("aerial-store-{}-{}", std::process::id(), rand_suffix()));
        (Store::open(&dir).unwrap(), dir)
    }

    fn rand_suffix() -> u128 {
        std::time::SystemTime::now().duration_since(std::time::UNIX_EPOCH).unwrap().as_nanos()
    }

    fn ids(scene: &str) -> Vec<u64> {
        let v: serde_json::Value = serde_json::from_str(scene).unwrap();
        v["elements"].as_array().unwrap().iter().map(|e| e["id"].as_u64().unwrap()).collect()
    }

    #[test]
    fn delta_saves_roundtrip_in_paint_order() {
        let (s, dir) = store();
        assert_eq!(s.load_scene("b1").unwrap(), None);
        s.apply_changes("b1", r#"{"reset":false,"upserts":[{"id":5,"z":2,"kind":"FreeDraw"},{"id":9,"z":1,"kind":"Text"}],"deletes":[]}"#).unwrap();
        assert_eq!(ids(&s.load_scene("b1").unwrap().unwrap()), vec![9, 5]);
        s.apply_changes("b1", r#"{"reset":false,"upserts":[{"id":7,"z":3}],"deletes":[9]}"#).unwrap();
        assert_eq!(ids(&s.load_scene("b1").unwrap().unwrap()), vec![5, 7]);
        s.apply_changes("b1", r#"{"reset":true,"upserts":[{"id":1,"z":1}],"deletes":[]}"#).unwrap();
        assert_eq!(ids(&s.load_scene("b1").unwrap().unwrap()), vec![1]);
        std::fs::remove_dir_all(dir).ok();
    }

    #[test]
    fn boards_are_isolated() {
        let (s, dir) = store();
        s.apply_changes("a", r#"{"upserts":[{"id":1,"z":1}]}"#).unwrap();
        s.apply_changes("b", r#"{"upserts":[{"id":1,"z":1},{"id":2,"z":2}]}"#).unwrap();
        s.apply_changes("a", r#"{"reset":true}"#).unwrap();
        assert_eq!(ids(&s.load_scene("a").unwrap().unwrap()), Vec::<u64>::new());
        assert_eq!(ids(&s.load_scene("b").unwrap().unwrap()), vec![1, 2]);
        std::fs::remove_dir_all(dir).ok();
    }

    #[test]
    fn legacy_blob_migrates_once_and_keeps_order() {
        let (s, dir) = store();
        s.put_legacy("old", r#"{"elements":[{"id":3,"kind":"FreeDraw"},{"id":1,"kind":"Text"}]}"#);
        assert_eq!(ids(&s.load_scene("old").unwrap().unwrap()), vec![3, 1]);
        // Second load reads v3 rows; the legacy blob is gone.
        assert_eq!(ids(&s.load_scene("old").unwrap().unwrap()), vec![3, 1]);
        std::fs::remove_dir_all(dir).ok();
    }

    #[test]
    fn rejects_bad_input() {
        let (s, dir) = store();
        assert!(s.load_scene("../x").is_err());
        assert!(s.apply_changes("b", "not json").is_err());
        assert!(s.apply_changes("b", r#"{"upserts":[{"id":0}]}"#).is_err());
        assert!(s.save_asset("../../etc/x", "data:image/png;base64,AA").is_err());
        assert!(s.save_asset("ok", "data:text/html;base64,AA").is_err());
        assert!(s.load_asset("..").is_err());
        std::fs::remove_dir_all(dir).ok();
    }

    #[test]
    fn delete_removes_rows_and_unshared_assets() {
        let (s, dir) = store();
        s.save_asset("img_a", "data:image/png;base64,AA").unwrap();
        s.save_asset("img_shared", "data:image/png;base64,AA").unwrap();
        s.apply_changes("b1", r#"{"upserts":[{"id":1,"asset_id":"img_a"},{"id":2,"asset_id":"img_shared"}]}"#).unwrap();
        s.apply_changes("b2", r#"{"upserts":[{"id":1,"asset_id":"img_shared"}]}"#).unwrap();
        assert_eq!(s.delete_board("b1").unwrap(), 1);
        assert_eq!(s.load_scene("b1").unwrap(), None);
        assert!(s.load_asset("img_a").is_err());
        assert!(s.load_asset("img_shared").is_ok());
        std::fs::remove_dir_all(dir).ok();
    }
}
