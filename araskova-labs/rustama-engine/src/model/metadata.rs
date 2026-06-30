//! Read GGUF file metadata without fully loading the model.
//!
//! GGUF is a binary format that encodes model architecture, quantization,
//! and hyperparameters in a header section before the tensor data.
//! This lets us inspect models cheaply without allocating weights.

use std::{
    fs::File,
    io::{BufReader, Read, Seek, SeekFrom},
    path::Path,
};

use anyhow::{bail, Context, Result};

// ─── GGUF constants ──────────────────────────────────────────────────────────

const GGUF_MAGIC: u32 = 0x46554747; // "GGUF" in little-endian
const GGUF_VERSION_3: u32 = 3;

// ─── Public types ─────────────────────────────────────────────────────────────

#[derive(Debug, Default)]
pub struct GgufMetadata {
    pub architecture: String,
    pub context_length: u32,
    pub n_parameters: u64,
    pub quantization: String,
    pub embedding_length: u32,
    pub n_layers: u32,
    pub n_heads: u32,
}

impl GgufMetadata {
    pub fn parameter_count_human(&self) -> String {
        let n = self.n_parameters as f64;
        if n >= 1e12 {
            format!("{:.1}T", n / 1e12)
        } else if n >= 1e9 {
            format!("{:.1}B", n / 1e9)
        } else if n >= 1e6 {
            format!("{:.1}M", n / 1e6)
        } else {
            format!("{}", self.n_parameters)
        }
    }
}

// ─── Reader ──────────────────────────────────────────────────────────────────

pub fn read_gguf_metadata(path: &Path) -> Result<GgufMetadata> {
    let file = File::open(path)
        .with_context(|| format!("Cannot open {:?}", path))?;
    let mut reader = BufReader::new(file);

    // Magic number
    let magic = read_u32(&mut reader)?;
    if magic != GGUF_MAGIC {
        bail!("Not a valid GGUF file (bad magic: 0x{:08X})", magic);
    }

    // Version
    let version = read_u32(&mut reader)?;
    if version < 2 || version > GGUF_VERSION_3 {
        bail!("Unsupported GGUF version: {}", version);
    }

    // Tensor and metadata counts
    let _n_tensors = read_u64(&mut reader)?;
    let n_kv = read_u64(&mut reader)?;

    // Parse key-value metadata pairs
    let mut meta = GgufMetadata::default();

    for _ in 0..n_kv {
        let key = read_gguf_string(&mut reader)?;
        let value_type = read_u32(&mut reader)?;

        match key.as_str() {
            "general.architecture" => {
                meta.architecture = read_gguf_string(&mut reader)?;
            }
            k if k.ends_with(".context_length") => {
                meta.context_length = read_u32(&mut reader)?;
            }
            k if k.ends_with(".embedding_length") => {
                meta.embedding_length = read_u32(&mut reader)?;
            }
            k if k.ends_with(".block_count") => {
                meta.n_layers = read_u32(&mut reader)?;
            }
            k if k.ends_with(".attention.head_count") => {
                meta.n_heads = read_u32(&mut reader)?;
            }
            "general.quantization_version" => {
                let q = read_u32(&mut reader)?;
                meta.quantization = format!("Q{}", q);
            }
            _ => {
                // Skip unknown fields by consuming their bytes
                skip_gguf_value(&mut reader, value_type)?;
            }
        }
    }

    // Rough parameter count estimate from architecture dims
    // Real count requires summing tensor shapes — use this as a fast approximation
    if meta.n_parameters == 0 && meta.embedding_length > 0 && meta.n_layers > 0 {
        let d = meta.embedding_length as u64;
        let l = meta.n_layers as u64;
        // Approximation: 12 * d² * l (transformer parameter formula)
        meta.n_parameters = 12 * d * d * l;
    }

    Ok(meta)
}

// ─── Binary helpers ──────────────────────────────────────────────────────────

fn read_u32(r: &mut impl Read) -> Result<u32> {
    let mut buf = [0u8; 4];
    r.read_exact(&mut buf)?;
    Ok(u32::from_le_bytes(buf))
}

fn read_u64(r: &mut impl Read) -> Result<u64> {
    let mut buf = [0u8; 8];
    r.read_exact(&mut buf)?;
    Ok(u64::from_le_bytes(buf))
}

fn read_i32(r: &mut impl Read) -> Result<i32> {
    let mut buf = [0u8; 4];
    r.read_exact(&mut buf)?;
    Ok(i32::from_le_bytes(buf))
}

fn read_f32(r: &mut impl Read) -> Result<f32> {
    let mut buf = [0u8; 4];
    r.read_exact(&mut buf)?;
    Ok(f32::from_le_bytes(buf))
}

fn read_gguf_string(r: &mut impl Read) -> Result<String> {
    let len = read_u64(r)?;
    let mut buf = vec![0u8; len as usize];
    r.read_exact(&mut buf)?;
    Ok(String::from_utf8_lossy(&buf).into_owned())
}

/// Skip a GGUF value without parsing it (for unknown keys).
fn skip_gguf_value(r: &mut impl Read, value_type: u32) -> Result<()> {
    match value_type {
        0 => { read_u32(r)?; }                      // UINT8 / BOOL  (stored as u32 in v3)
        1 => { read_i32(r)?; }                      // INT8
        2 => { read_u32(r)?; }                      // UINT16
        3 => { read_i32(r)?; }                      // INT16
        4 => { read_u32(r)?; }                      // UINT32
        5 => { read_i32(r)?; }                      // INT32
        6 => { read_f32(r)?; }                      // FLOAT32
        7 => { read_u32(r)?; }                      // BOOL
        8 => { read_gguf_string(r)?; }              // STRING
        9 => {                                       // ARRAY
            let elem_type = read_u32(r)?;
            let count = read_u64(r)?;
            for _ in 0..count {
                skip_gguf_value(r, elem_type)?;
            }
        }
        10 => { read_u64(r)?; }                     // UINT64
        11 => { let mut b = [0u8; 8]; r.read_exact(&mut b)?; } // INT64
        12 => { let mut b = [0u8; 8]; r.read_exact(&mut b)?; } // FLOAT64
        t => bail!("Unknown GGUF value type: {}", t),
    }
    Ok(())
}
