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

pub struct InferenceEngine {
    config: InferenceConfig,
    model: LlamaModel,
    backend: LlamaBackend,
    history: Vec<ChatMessage>,
}

impl InferenceEngine {
    /// Load a model from disk. Blocks until weights are memory-mapped.
    pub async fn load(config: InferenceConfig) -> Result<Self> {
        info!("Loading model from {:?}", config.model_path);

        // Run the blocking load on a dedicated thread so we don't stall the async runtime
        let config_clone = config.clone();
        let (backend, model) = tokio::task::spawn_blocking(move || -> Result<_> {
            let backend = LlamaBackend::init()?;

            let gpu_layers = config_clone.n_gpu_layers.unwrap_or(u32::MAX); // MAX = all layers on GPU
            let model_params = LlamaModelParams::default().with_n_gpu_layers(gpu_layers);

            let model = LlamaModel::load_from_file(
                &backend,
                &config_clone.model_path,
                &model_params,
            )
            .context("Failed to load model — is the .gguf file valid?")?;

            Ok((backend, model))
        })
        .await??;

        info!("Model loaded successfully");

        let mut history = Vec::new();

        // Seed history with system prompt if provided
        if let Some(ref sys) = config.system_prompt {
            history.push(ChatMessage {
                role: Role::System,
                content: sys.clone(),
            });
        }

        Ok(Self { config, model, backend, history })
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

        // Build the full prompt string in ChatML / llama-3 format
        let prompt = self.build_prompt();
        debug!("Prompt ({} chars): {}…", prompt.len(), &prompt[..prompt.len().min(120)]);

        let config = self.config.clone();
        let full_response = self.run_inference(&prompt, &config, &mut on_token).await?;

        // Append assistant turn to history
        self.history.push(ChatMessage {
            role: Role::Assistant,
            content: full_response.clone(),
        });

        Ok(full_response)
    }

    /// Generate without streaming (returns the complete string).
    pub async fn generate(&mut self, user_input: &str) -> Result<String> {
        let mut output = String::new();
        self.generate_streaming(user_input, |tok| output.push_str(tok)).await?;
        Ok(output)
    }

    /// Reset conversation history (keeps system prompt).
    pub fn clear_context(&mut self) {
        self.history.retain(|m| m.role == Role::System);
    }

    // ── Private ──────────────────────────────────────────────────────────────

    /// Formats history into a ChatML-style prompt string.
    ///
    /// Most modern GGUF models include their template in the metadata;
    /// in production you'd read it from there. ChatML is the common default.
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

    /// Core inference loop using llama_cpp_2 primitives.
    async fn run_inference<F>(
        &self,
        prompt: &str,
        config: &InferenceConfig,
        on_token: &mut F,
    ) -> Result<String>
    where
        F: FnMut(&str),
    {
        let prompt = prompt.to_owned();
        let max_new = config.max_new_tokens;
        let temperature = config.temperature;
        let top_p = config.top_p;
        let repeat_penalty = config.repeat_penalty;
        let ctx_size = config.context_size;
        let grammar_str_opt = config.grammar_str.clone();

        // Capture tokens for return value
        let mut collected = Vec::<String>::new();

        // Run the synchronous llama_cpp_2 loop on a thread-pool thread
        let model_ref = &self.model;
        let backend_ref = &self.backend;

        // NOTE: In a full implementation, this closure would call into llama_cpp_2's
        // context → batch → sampling loop. Outlined here for clarity:
        let tokens: Vec<String> = tokio::task::spawn_blocking({
            let prompt = prompt.clone();
            let model = unsafe {
                // SAFETY: LlamaModel is !Send, so we transmute the lifetime to 'static
                // for the blocking task. In production, use Arc<Mutex<>> or a dedicated
                // inference actor (e.g. a tokio::sync::mpsc channel worker).
                //
                // A cleaner pattern is to keep the model in a dedicated thread and
                // communicate via channels — see inference/actor.rs in the full version.
                std::mem::transmute::<&LlamaModel, &'static LlamaModel>(model_ref)
            };
            let backend = unsafe {
                std::mem::transmute::<&LlamaBackend, &'static LlamaBackend>(backend_ref)
            };

            move || -> Result<Vec<String>> {
                let ctx_params = LlamaContextParams::default()
                    .with_n_ctx(Some(std::num::NonZeroU32::new(ctx_size).unwrap()));

                let mut ctx = model
                    .new_context(backend, ctx_params)
                    .context("Failed to create inference context")?;

                // Tokenize the prompt
                let tokens_list = model
                    .str_to_token(&prompt, AddBos::Always)
                    .context("Tokenization failed")?;

                // Feed prompt tokens through the context in one batch
                let mut batch = LlamaBatch::new(tokens_list.len() + max_new as usize, 1);
                for (i, &tok) in tokens_list.iter().enumerate() {
                    let is_last = i == tokens_list.len() - 1;
                    batch.add(tok, i as i32, &[0], is_last)?;
                }
                ctx.decode(&mut batch).context("Prompt decode failed")?;

                let mut samplers = vec![
                    llama_cpp_2::sampling::LlamaSampler::temp(temperature),
                    llama_cpp_2::sampling::LlamaSampler::top_p(top_p, 1),
                    llama_cpp_2::sampling::LlamaSampler::penalties(
                        -1,
                        repeat_penalty,
                        0.0,
                        0.0,
                    ),
                ];
                
                if let Some(grammar_str) = grammar_str_opt {
                    samplers.push(llama_cpp_2::sampling::LlamaSampler::grammar(&model, &grammar_str, "root").context("Failed to load grammar")?);
                }
                
                samplers.push(llama_cpp_2::sampling::LlamaSampler::greedy());

                let mut sampler = llama_cpp_2::sampling::LlamaSampler::chain_simple(samplers);

                // Sampling loop
                let mut output_tokens: Vec<String> = Vec::new();
                let mut n_cur = tokens_list.len() as i32;
                let eos = model.token_eos();

                for _ in 0..max_new {
                    let next_token = sampler.sample(&ctx, batch.n_tokens() - 1);
                    sampler.accept(next_token);

                    if next_token == eos {
                        break;
                    }

                    #[allow(deprecated)]
                    let token_str = model.token_to_str(next_token, Special::Tokenize)?;
                    output_tokens.push(token_str);

                    // Advance the batch
                    batch.clear();
                    batch.add(next_token, n_cur, &[0], true)?;
                    ctx.decode(&mut batch).context("Token decode failed")?;
                    n_cur += 1;
                }

                Ok(output_tokens)
            }
        })
        .await??;

        // Stream tokens to the caller and collect for return
        let mut full = String::new();
        for tok in tokens {
            on_token(&tok);
            full.push_str(&tok);
        }

        Ok(full)
    }
}
