//! Persistent registry of downloaded models stored in ~/.rustama/registry.json

use std::{
    fs,
    path::{Path, PathBuf},
};

use anyhow::{Context, Result};
use chrono::{DateTime, Local};
use serde::{Deserialize, Serialize};

// ─── Types ───────────────────────────────────────────────────────────────────

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ModelEntry {
    /// Short name used in CLI (e.g. "llama3", "mistral")
    pub name: String,

    /// Absolute path to the .gguf file on disk
    pub path: PathBuf,

    /// Datetime when the model was first registered
    pub added_at: DateTime<Local>,

    /// File size in bytes (cached so we don't stat every time)
    pub size_bytes: u64,

    /// HuggingFace repo the model was pulled from (None if local)
    pub source_repo: Option<String>,

    /// Quantization level (e.g. "Q4_K_M")
    pub quantization: Option<String>,
}

impl ModelEntry {
    pub fn file_size_human(&self) -> String {
        human_size(self.size_bytes)
    }
}

// ─── Registry ────────────────────────────────────────────────────────────────

#[derive(Debug, Default, Serialize, Deserialize)]
struct RegistryData {
    models: Vec<ModelEntry>,
}

pub struct ModelRegistry {
    data: RegistryData,
    registry_path: PathBuf,
}

impl ModelRegistry {
    /// Load (or create) the registry from ~/.rustama/registry.json
    pub fn load() -> Result<Self> {
        let dir = rustama_home()?;
        fs::create_dir_all(&dir)?;
        let registry_path = dir.join("registry.json");

        let data = if registry_path.exists() {
            let raw = fs::read_to_string(&registry_path)
                .context("Failed to read registry file")?;
            serde_json::from_str(&raw).context("Registry JSON is malformed")?
        } else {
            RegistryData::default()
        };

        Ok(Self { data, registry_path })
    }

    /// Persist registry to disk.
    pub fn save(&self) -> Result<()> {
        let json = serde_json::to_string_pretty(&self.data)?;
        fs::write(&self.registry_path, json)?;
        Ok(())
    }

    /// Register a new model by name + path.
    pub fn register(&mut self, name: &str, path: PathBuf) -> Result<()> {
        // Remove any existing entry with same name
        self.data.models.retain(|m| m.name != name);

        let size_bytes = fs::metadata(&path)
            .map(|m| m.len())
            .unwrap_or(0);

        self.data.models.push(ModelEntry {
            name: name.to_owned(),
            path,
            added_at: Local::now(),
            size_bytes,
            source_repo: None,
            quantization: None,
        });

        Ok(())
    }

    /// Remove a model from the registry AND delete the file.
    /// Returns true if the model was found.
    pub fn remove(&mut self, name: &str) -> Result<bool> {
        let pos = self.data.models.iter().position(|m| m.name == name);
        match pos {
            None => Ok(false),
            Some(i) => {
                let entry = self.data.models.remove(i);
                if entry.path.exists() {
                    fs::remove_file(&entry.path)
                        .context("Failed to delete model file")?;
                }
                Ok(true)
            }
        }
    }

    /// Resolve a model name or file path to an absolute PathBuf.
    pub fn resolve(&self, name_or_path: &str) -> Option<PathBuf> {
        // Direct file path
        let p = Path::new(name_or_path);
        if p.exists() && p.extension().map_or(false, |e| e == "gguf") {
            return Some(p.to_path_buf());
        }

        // Registry lookup
        self.data.models
            .iter()
            .find(|m| m.name == name_or_path)
            .map(|m| m.path.clone())
    }

    /// Full entry lookup (for `info` command).
    pub fn resolve_entry(&self, name: &str) -> Option<&ModelEntry> {
        self.data.models.iter().find(|m| m.name == name)
    }

    /// All registered models.
    pub fn all(&self) -> &[ModelEntry] {
        &self.data.models
    }
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

fn rustama_home() -> Result<PathBuf> {
    let home = dirs::home_dir().context("Cannot determine home directory")?;
    Ok(home.join(".rustama"))
}

pub fn models_dir() -> Result<PathBuf> {
    let dir = rustama_home()?.join("models");
    fs::create_dir_all(&dir)?;
    Ok(dir)
}

fn human_size(bytes: u64) -> String {
    const KB: u64 = 1024;
    const MB: u64 = KB * 1024;
    const GB: u64 = MB * 1024;

    if bytes >= GB {
        format!("{:.1} GB", bytes as f64 / GB as f64)
    } else if bytes >= MB {
        format!("{:.1} MB", bytes as f64 / MB as f64)
    } else {
        format!("{:.1} KB", bytes as f64 / KB as f64)
    }
}
