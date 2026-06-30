//! HuggingFace Hub integration — resolves model aliases and downloads GGUF files.

use std::{collections::HashMap, path::PathBuf};

use anyhow::{bail, Context, Result};
use tracing::info;

use super::registry::models_dir;

// ─── Well-known model aliases ─────────────────────────────────────────────────
//
// Maps short CLI names → (hf_repo, preferred_filename_pattern).
// Users can also pass "owner/repo" directly to bypass this.
//
fn builtin_aliases() -> HashMap<&'static str, (&'static str, &'static str)> {
    [
        ("llama3",   ("bartowski/Meta-Llama-3-8B-Instruct-GGUF",      "Meta-Llama-3-8B-Instruct-{quant}.gguf")),
        ("llama3:70b", ("bartowski/Meta-Llama-3-70B-Instruct-GGUF",   "Meta-Llama-3-70B-Instruct-{quant}.gguf")),
        ("mistral",  ("TheBloke/Mistral-7B-Instruct-v0.2-GGUF",        "mistral-7b-instruct-v0.2.{quant}.gguf")),
        ("qwen2.5",  ("Qwen/Qwen2.5-7B-Instruct-GGUF",                "qwen2.5-7b-instruct-{quant_lower}.gguf")),
        ("qwen0.5b", ("Qwen/Qwen1.5-0.5B-Chat-GGUF",                  "qwen1_5-0_5b-chat-{quant_lower}.gguf")),
        ("gemma3",   ("bartowski/google_gemma-3-12b-it-GGUF",          "google_gemma-3-12b-it-{quant}.gguf")),
        ("phi4",     ("bartowski/phi-4-GGUF",                          "phi-4-{quant}.gguf")),
        ("deepseek-r1", ("bartowski/DeepSeek-R1-Distill-Qwen-7B-GGUF","DeepSeek-R1-Distill-Qwen-7B-{quant}.gguf")),
        ("codellama", ("TheBloke/CodeLlama-7B-Instruct-GGUF",         "codellama-7b-instruct.{quant}.gguf")),
    ]
    .into_iter()
    .collect()
}

// ─── Hub client ──────────────────────────────────────────────────────────────

pub struct HuggingFaceHub {
    client: reqwest::Client,
}

impl HuggingFaceHub {
    pub fn new() -> Self {
        Self {
            client: reqwest::Client::builder()
                .user_agent("rustama/0.1")
                .build()
                .expect("HTTP client init failed"),
        }
    }

    /// Convert a CLI name + quantization into (repo_id, filename).
    pub fn resolve_model(&self, name: &str, quantize: &str) -> Result<(String, String)> {
        let aliases = builtin_aliases();

        if let Some(&(repo, pattern)) = aliases.get(name) {
            // Fill quantization placeholder in the filename pattern
            let filename = pattern
                .replace("{quant}", quantize)
                .replace("{quant_lower}", &quantize.to_lowercase());
            return Ok((repo.to_owned(), filename));
        }

        // User passed "owner/repo" directly — list files and pick the best GGUF
        if name.contains('/') {
            let filename = self.pick_best_gguf(name, quantize)?;
            return Ok((name.to_owned(), filename));
        }

        bail!(
            "Unknown model '{}'. Use a known alias (llama3, mistral, …) or 'owner/repo' from HuggingFace.",
            name
        );
    }

    /// Download a file from a HuggingFace repo, reporting progress via callback.
    pub async fn download(
        &self,
        repo: &str,
        filename: &str,
        mut on_progress: impl FnMut(u64, u64),
    ) -> Result<PathBuf> {
        let url = format!(
            "https://huggingface.co/{}/resolve/main/{}",
            repo, filename
        );
        info!("Downloading {} from {}", filename, url);

        let dest_dir = models_dir()?;
        let dest_path = dest_dir.join(filename);

        // Skip if already downloaded
        if dest_path.exists() {
            println!("Already downloaded: {}", dest_path.display());
            return Ok(dest_path);
        }

        let response = self
            .client
            .get(&url)
            .send()
            .await
            .context("HTTP request failed — check your internet connection")?;

        if !response.status().is_success() {
            bail!("Download failed: HTTP {}\n  URL: {}", response.status(), url);
        }

        let total = response.content_length().unwrap_or(0);
        let mut downloaded = 0u64;

        // Stream body to disk
        use futures::StreamExt;
        use tokio::io::AsyncWriteExt;

        let mut file = tokio::fs::File::create(&dest_path).await?;
        let mut stream = response.bytes_stream();

        while let Some(chunk) = stream.next().await {
            let chunk = chunk.context("Stream error during download")?;
            file.write_all(&chunk).await?;
            downloaded += chunk.len() as u64;
            on_progress(downloaded, total);
        }

        file.flush().await?;

        Ok(dest_path)
    }

    /// Query the HF repo file list and pick the file that best matches the quant.
    fn pick_best_gguf(&self, repo: &str, quantize: &str) -> Result<String> {
        // In production, call the HF API: GET /api/models/{repo} → parse siblings
        // For now, return a best-guess filename
        let q_lower = quantize.to_lowercase();
        let parts: Vec<&str> = repo.split('/').collect();
        let model_stem = parts.last().copied().unwrap_or("model");
        Ok(format!("{}-{}.gguf", model_stem.to_lowercase(), q_lower))
    }
}
