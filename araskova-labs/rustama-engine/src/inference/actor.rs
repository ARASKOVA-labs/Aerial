use std::{sync::mpsc as std_mpsc, thread};
use anyhow::{Context, Result};
use llama_cpp_2::{
    context::params::LlamaContextParams,
    llama_backend::LlamaBackend,
    llama_batch::LlamaBatch,
    model::{params::LlamaModelParams, AddBos, LlamaModel, Special},
    token::LlamaToken,
};
use tracing::{debug, error, info};

use crate::inference::InferenceConfig;

pub enum InferenceCommand {
    Generate {
        prompt: String,
        config: InferenceConfig,
        token_tx: tokio::sync::mpsc::UnboundedSender<String>,
        reply_tx: tokio::sync::oneshot::Sender<Result<String>>,
    },
    ClearContext,
}

pub fn spawn_inference_actor(config: InferenceConfig) -> Result<tokio::sync::mpsc::UnboundedSender<InferenceCommand>> {
    let (tx, mut rx) = tokio::sync::mpsc::unbounded_channel::<InferenceCommand>();
    
    // We must run in a dedicated OS thread because LlamaBackend and LlamaModel are !Send
    // across async boundaries, and inference blocks heavily.
    thread::Builder::new().name("inference-worker".into()).spawn(move || {
        let backend = match LlamaBackend::init() {
            Ok(b) => b,
            Err(e) => {
                error!("Failed to init LlamaBackend: {}", e);
                return;
            }
        };

        let gpu_layers = config.n_gpu_layers.unwrap_or(u32::MAX);
        let model_params = LlamaModelParams::default().with_n_gpu_layers(gpu_layers);
        
        info!("Actor loading model from {:?}", config.model_path);
        let model = match LlamaModel::load_from_file(&backend, &config.model_path, &model_params) {
            Ok(m) => m,
            Err(e) => {
                error!("Actor failed to load model: {}", e);
                return;
            }
        };

        let ctx_size = config.context_size;
        let ctx_params = LlamaContextParams::default()
            .with_n_ctx(Some(std::num::NonZeroU32::new(ctx_size).unwrap()));
        
        let mut ctx = match model.new_context(&backend, ctx_params) {
            Ok(c) => c,
            Err(e) => {
                error!("Actor failed to create context: {}", e);
                return;
            }
        };

        let mut cached_tokens: Vec<LlamaToken> = Vec::new();

        while let Some(cmd) = rx.blocking_recv() {
            match cmd {
                InferenceCommand::ClearContext => {
                    ctx.clear_kv_cache();
                    cached_tokens.clear();
                    debug!("KV cache cleared");
                }
                InferenceCommand::Generate { prompt, config, token_tx, reply_tx } => {
                    let result = (|| -> Result<String> {
                        // 1. Tokenize prompt
                        let tokens_list = model
                            .str_to_token(&prompt, AddBos::Always)
                            .context("Tokenization failed")?;

                        // 2. Prefix matching
                        let mut match_len = 0;
                        for (a, b) in cached_tokens.iter().zip(tokens_list.iter()) {
                            if a == b {
                                match_len += 1;
                            } else {
                                break;
                            }
                        }

                        // 3. Evict divergence
                        if match_len < cached_tokens.len() {
                            let _ = ctx.clear_kv_cache_seq(None, Some(match_len as u32), None);
                            cached_tokens.truncate(match_len);
                        }

                        // 4. Decode new tokens
                        let new_tokens = &tokens_list[match_len..];
                        if !new_tokens.is_empty() {
                            let mut batch = LlamaBatch::new(new_tokens.len() + config.max_new_tokens as usize, 1);
                            for (i, &tok) in new_tokens.iter().enumerate() {
                                let pos = (match_len + i) as i32;
                                let is_last = i == new_tokens.len() - 1;
                                batch.add(tok, pos, &[0], is_last)?;
                                cached_tokens.push(tok);
                            }
                            ctx.decode(&mut batch).context("Prompt decode failed")?;
                            batch.clear(); // Important to clear before generation
                        }

                        let mut samplers = vec![
                            llama_cpp_2::sampling::LlamaSampler::temp(config.temperature),
                            llama_cpp_2::sampling::LlamaSampler::top_p(config.top_p, 1),
                            llama_cpp_2::sampling::LlamaSampler::penalties(-1, config.repeat_penalty, 0.0, 0.0),
                        ];

                        if let Some(grammar_str) = &config.grammar_str {
                            samplers.push(llama_cpp_2::sampling::LlamaSampler::grammar(&model, grammar_str, "root").context("Failed to load grammar")?);
                        }

                        samplers.push(llama_cpp_2::sampling::LlamaSampler::greedy());
                        let mut sampler = llama_cpp_2::sampling::LlamaSampler::chain_simple(samplers);

                        for &tok in &tokens_list {
                            sampler.accept(tok);
                        }

                        // 5. Sampling loop
                        let mut output_tokens = String::new();
                        let mut n_cur = cached_tokens.len() as i32;
                        let eos = model.token_eos();
                        
                        // We must recreate batch for decoding 1 token at a time
                        let mut batch = LlamaBatch::new(1, 1);

                        for _ in 0..config.max_new_tokens {
                            let next_token = sampler.sample(&ctx, batch.n_tokens() - 1);
                            sampler.accept(next_token);

                            if next_token == eos {
                                break;
                            }

                            #[allow(deprecated)]
                            let token_str = model.token_to_str(next_token, Special::Tokenize)?;
                            
                            // Send token over channel
                            let _ = token_tx.send(token_str.clone());
                            output_tokens.push_str(&token_str);

                            // Advance batch
                            batch.clear();
                            batch.add(next_token, n_cur, &[0], true)?;
                            ctx.decode(&mut batch).context("Token decode failed")?;
                            cached_tokens.push(next_token);
                            n_cur += 1;
                        }

                        Ok(output_tokens)
                    })();

                    let _ = reply_tx.send(result);
                }
            }
        }
        
        info!("Actor shutting down");
    })?;

    Ok(tx)
}
