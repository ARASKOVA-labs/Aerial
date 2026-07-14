//! Inference engine — thin safe wrapper around llama_cpp_2 bindings.
//!
//! Design goals:
//!  - One model loaded at a time per engine instance
//!  - Streaming token output via callbacks
//!  - Chat history managed in-engine (no extra state in callers)
//!  - Full control over sampling parameters

use std::path::PathBuf;

use anyhow::{Context, Result};
use llama_cpp_2::{
    context::params::LlamaContextParams,
    llama_backend::LlamaBackend,
    llama_batch::LlamaBatch,
    model::{params::LlamaModelParams, AddBos, LlamaModel, Special},
};
use tracing::{debug, info};

// ─── Config ──────────────────────────────────────────────────────────────────

#[derive(Debug, Clone)]
pub struct InferenceConfig {
    /// Path to the .gguf model file
    pub model_path: PathBuf,

    /// Number of tokens in the KV cache / context window
    pub context_size: u32,

    /// Sampling temperature (0 = greedy, 1 = very random)
    pub temperature: f32,

    /// Nucleus sampling probability cutoff
    pub top_p: f32,

    /// Repetition penalty (>1 discourages loops)
    pub repeat_penalty: f32,

    /// How many tokens to generate at most
    pub max_new_tokens: u32,

    /// System prompt prepended to every conversation
    pub system_prompt: Option<String>,

    /// Number of GPU layers to offload (None = all, 0 = CPU only)
    pub n_gpu_layers: Option<u32>,

    /// GBNF Grammar constraint string
    pub grammar_str: Option<String>,
}

impl Default for InferenceConfig {
    fn default() -> Self {
        Self {
            model_path: PathBuf::new(),
            context_size: 4096,
            temperature: 0.8,
            top_p: 0.9,
            repeat_penalty: 1.1,
            max_new_tokens: 2048,
            system_prompt: None,
            n_gpu_layers: None, // auto-detect
            grammar_str: None,
        }
    }
}

// ─── Chat Message ─────────────────────────────────────────────────────────────

#[derive(Debug, Clone)]
pub struct ChatMessage {
    pub role: Role,
    pub content: String,
}

#[derive(Debug, Clone, PartialEq)]
pub enum Role {
    System,
    User,
    Assistant,
}

impl Role {
    pub fn as_str(&self) -> &'static str {
        match self {
            Role::System => "system",
            Role::User => "user",
            Role::Assistant => "assistant",
        }
    }
}

// ─── Engine ──────────────────────────────────────────────────────────────────

pub mod actor;
use actor::{spawn_inference_actor, InferenceCommand};

pub struct InferenceEngine {
    config: InferenceConfig,
    history: Vec<ChatMessage>,
    tx: tokio::sync::mpsc::UnboundedSender<InferenceCommand>,
}

impl InferenceEngine {
    /// Load a model from disk. Blocks until weights are memory-mapped.
    pub async fn load(config: InferenceConfig) -> Result<Self> {
        info!("Spawning inference actor for {:?}", config.model_path);

        let config_clone = config.clone();
        
        // spawn_inference_actor performs blocking initializations (loading model from disk),
        // so we wrap it in spawn_blocking so we don't stall the async runtime.
        let tx = tokio::task::spawn_blocking(move || spawn_inference_actor(config_clone))
            .await??;

        info!("Model actor spawned successfully");

        let mut history = Vec::new();
        if let Some(ref sys) = config.system_prompt {
            history.push(ChatMessage {
                role: Role::System,
                content: sys.clone(),
            });
        }

        Ok(Self { config, history, tx })
    }

    /// Generate a response, streaming individual tokens via `on_token`.
    pub async fn generate_streaming<F>(&mut self, user_input: &str, mut on_token: F) -> Result<String>
    where
        F: FnMut(&str),
    {
        // Append user turn
        self.history.push(ChatMessage {
            role: Role::User,
            content: user_input.to_owned(),
        });

        let prompt = self.build_prompt();
        debug!("Prompt ({} chars): {}…", prompt.len(), &prompt[..prompt.len().min(120)]);

        let (reply_tx, reply_rx) = tokio::sync::oneshot::channel();
        let (token_tx, mut token_rx) = tokio::sync::mpsc::unbounded_channel();

        self.tx.send(InferenceCommand::Generate {
            prompt,
            config: self.config.clone(),
            token_tx,
            reply_tx,
        }).map_err(|_| anyhow::anyhow!("Actor thread died"))?;

        // Stream tokens to caller
        let mut full_response = String::new();
        while let Some(tok) = token_rx.recv().await {
            on_token(&tok);
            full_response.push_str(&tok);
        }

        // Wait for final result status
        reply_rx.await??;

        // Append assistant turn
        self.history.push(ChatMessage {
            role: Role::Assistant,
            content: full_response.clone(),
        });

        Ok(full_response)
    }

    /// Generate without streaming.
    pub async fn generate(&mut self, user_input: &str) -> Result<String> {
        let mut output = String::new();
        self.generate_streaming(user_input, |tok| output.push_str(tok)).await?;
        Ok(output)
    }

    /// Reset conversation history and clear KV cache
    pub fn clear_context(&mut self) {
        self.history.retain(|m| m.role == Role::System);
        let _ = self.tx.send(InferenceCommand::ClearContext);
    }

    // ── Private ──────────────────────────────────────────────────────────────

    fn build_prompt(&self) -> String {
        let mut s = String::new();
        for msg in &self.history {
            s.push_str(&format!(
                "<|im_start|>{}\n{}<|im_end|>\n",
                msg.role.as_str(),
                msg.content
            ));
        }
        s.push_str("<|im_start|>assistant\n");
        s
    }
}
