//! Rustama Engine — Araskova's proprietary local LLM inference runtime.
//!
//! Powers local AI flowchart generation in Aerial and any future
//! Araskova products. Zero cloud dependencies.
//!
//! ## Architecture
//! - [`inference`] — llama.cpp inference engine with streaming token output
//! - [`model`] — HuggingFace hub downloader and persistent model registry

pub mod inference;
pub mod model;

// Re-export key types for convenience
pub use inference::{InferenceConfig, InferenceEngine};
pub use model::{
    hub::HuggingFaceHub,
    registry::{ModelEntry, ModelRegistry, models_dir},
};

/// Featured models the Rustama Engine ships with.
/// Maps short alias → (description, default quantization, approx size GB)
pub fn featured_models() -> Vec<FeaturedModel> {
    vec![
        FeaturedModel {
            alias: "phi4".to_string(),
            display_name: "Microsoft Phi-4".to_string(),
            description: "14B parameters, exceptional reasoning. Best balance of quality and speed.".to_string(),
            default_quant: "Q4_K_M".to_string(),
            size_gb: 8.5,
            tags: vec!["reasoning".to_string(), "code".to_string()],
        },
        FeaturedModel {
            alias: "llama3".to_string(),
            display_name: "Meta Llama 3 8B".to_string(),
            description: "Meta's flagship open model. Excellent general-purpose generation.".to_string(),
            default_quant: "Q4_K_M".to_string(),
            size_gb: 4.9,
            tags: vec!["general".to_string(), "fast".to_string()],
        },
        FeaturedModel {
            alias: "deepseek-r1".to_string(),
            display_name: "DeepSeek R1 Distill 7B".to_string(),
            description: "State-of-the-art reasoning with chain-of-thought. Great for flowcharts.".to_string(),
            default_quant: "Q4_K_M".to_string(),
            size_gb: 4.7,
            tags: vec!["reasoning".to_string(), "diagrams".to_string()],
        },
        FeaturedModel {
            alias: "mistral".to_string(),
            display_name: "Mistral 7B Instruct".to_string(),
            description: "Fast, compact, and highly capable. Ideal for low-VRAM machines.".to_string(),
            default_quant: "Q4_K_M".to_string(),
            size_gb: 4.4,
            tags: vec!["fast".to_string(), "efficient".to_string()],
        },
        FeaturedModel {
            alias: "gemma3".to_string(),
            display_name: "Google Gemma 3 12B".to_string(),
            description: "Google's multimodal open model. Strong instruction following.".to_string(),
            default_quant: "Q4_K_M".to_string(),
            size_gb: 7.2,
            tags: vec!["google".to_string(), "instruction".to_string()],
        },
        FeaturedModel {
            alias: "qwen2.5".to_string(),
            display_name: "Qwen 2.5 7B Instruct".to_string(),
            description: "Alibaba's multilingual model. Excellent code and diagram generation.".to_string(),
            default_quant: "Q4_K_M".to_string(),
            size_gb: 4.7,
            tags: vec!["multilingual".to_string(), "code".to_string()],
        },
        FeaturedModel {
            alias: "qwen2.5-0.5b".to_string(),
            display_name: "Qwen 2.5 0.5B (Tiny)".to_string(),
            description: "Ultra-small model for instantaneous downloads and low-end devices. Good for basic testing.".to_string(),
            default_quant: "Q4_K_M".to_string(),
            size_gb: 0.4,
            tags: vec!["tiny".to_string(), "fast".to_string()],
        },
    ]
}

#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
pub struct FeaturedModel {
    pub alias: String,
    pub display_name: String,
    pub description: String,
    pub default_quant: String,
    pub size_gb: f64,
    pub tags: Vec<String>,
}
