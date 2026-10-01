//! OpenRouter streaming client for AI diagram generation.
//!
//! The API key is supplied per call by the user and is never logged, stored,
//! or echoed back in errors. Only the model name and byte counts are audited.

use std::time::Duration;

use futures::StreamExt;
use tauri::{Emitter, Window};

use crate::security::{validate_len, MAX_PROMPT_BYTES};

const ENDPOINT: &str = "https://openrouter.ai/api/v1/chat/completions";
const MAX_RESPONSE_BYTES: usize = 512 * 1024;

const ARAS_SYSTEM_PROMPT: &str = r##"You are an expert diagram generator. Output ONLY raw ArasDiagram DSL code. No markdown, no explanation, no code fences, no preamble.

STRICT RULES — violating ANY of these will break the parser:
1. Node IDs: single words, NO spaces. Use underscores. [api_gateway] ✓  [api gateway] ✗
2. Arrows: ONLY use -->. Never use ->, =>, >, or any variant.
3. Labels: ALWAYS use double quotes after a colon. [a] --> [b]: "label" ✓
4. @type must be EXACTLY one of: architecture, flowchart
5. Groups: ALWAYS write `group "Name" {` with a SPACE before the quote. NEVER write group"Name"{
6. Opening braces { MUST be on the SAME LINE as the group/style declaration.
7. Closing braces } MUST be on their OWN LINE — never on the same line as another statement.
8. Each statement (node, connection, group, style) MUST be on its OWN LINE.
9. NO <think> or </think> blocks. NO markdown fences.

Example output (copy this exact format):
@type: architecture
group "Frontend" {
[browser]: "Web Browser"
[cdn]: "CDN"
}
group "Backend" {
[api]: "API Gateway"
[db]: "PostgreSQL DB"
}
[browser] --> [cdn]: "Static Assets"
[browser] --> [api]: "HTTPS"
[api] --> [db]: "SQL Query"
style [browser] { icon: "client" }
style [api] { icon: "server" }
style [db] { icon: "database" }
"##;

fn validate_model(model: &str) -> Result<(), String> {
    let ok = !model.is_empty()
        && model.len() <= 128
        && model.bytes().all(|b| b.is_ascii_alphanumeric() || matches!(b, b'/' | b'-' | b'_' | b'.' | b':'));
    if ok { Ok(()) } else { Err("invalid model name".to_string()) }
}

/// Splits an SSE byte stream into `data:` payloads. Lines can be cut at any
/// byte boundary between network chunks, so partial lines are buffered — the
/// old parser dropped any token whose line straddled two chunks.
#[derive(Default)]
pub struct SseParser {
    buf: Vec<u8>,
}

impl SseParser {
    pub fn push(&mut self, chunk: &[u8], mut on_data: impl FnMut(&str)) {
        self.buf.extend_from_slice(chunk);
        while let Some(pos) = self.buf.iter().position(|&b| b == b'\n') {
            let line: Vec<u8> = self.buf.drain(..=pos).collect();
            let line = String::from_utf8_lossy(&line);
            let line = line.trim_end_matches(['\r', '\n']);
            if let Some(data) = line.strip_prefix("data:") {
                on_data(data.trim_start());
            }
        }
    }
}

#[tauri::command]
pub async fn openrouter_generate(window: Window, model: String, prompt: String, api_key: String) -> Result<String, String> {
    validate_model(&model)?;
    validate_len("prompt", prompt.len(), MAX_PROMPT_BYTES)?;
    if api_key.trim().is_empty() || api_key.len() > 512 {
        return Err("missing or invalid API key".to_string());
    }
    tracing::info!(target: "audit", model = %model, prompt_bytes = prompt.len(), "AI diagram request");

    let client = reqwest::Client::builder()
        .connect_timeout(Duration::from_secs(10))
        .timeout(Duration::from_secs(120))
        .https_only(true)
        .build()
        .map_err(|_| "failed to initialise HTTP client".to_string())?;

    let body = serde_json::json!({
        "model": model,
        "stream": true,
        "messages": [
            { "role": "system", "content": ARAS_SYSTEM_PROMPT },
            { "role": "user", "content": prompt }
        ]
    });

    let response = client
        .post(ENDPOINT)
        .bearer_auth(api_key.trim())
        .header("HTTP-Referer", "https://araskova.com")
        .header("X-Title", "Aerial by Araskova")
        .json(&body)
        .send()
        .await
        .map_err(|e| {
            tracing::warn!(error = %e.without_url(), "AI request failed");
            "AI request failed".to_string()
        })?;

    let status = response.status();
    if !status.is_success() {
        tracing::warn!(status = status.as_u16(), "AI provider returned an error");
        return Err(format!("AI provider error ({})", status.as_u16()));
    }

    let mut stream = response.bytes_stream();
    let mut parser = SseParser::default();
    let mut full = String::new();
    let mut done = false;
    while let Some(chunk) = stream.next().await {
        let chunk = chunk.map_err(|_| "AI stream interrupted".to_string())?;
        parser.push(&chunk, |data| {
            if data == "[DONE]" {
                done = true;
                return;
            }
            if let Ok(json) = serde_json::from_str::<serde_json::Value>(data) {
                if let Some(tok) = json["choices"][0]["delta"]["content"].as_str() {
                    if full.len() + tok.len() <= MAX_RESPONSE_BYTES {
                        full.push_str(tok);
                        let _ = window.emit("rustama://token", tok);
                    }
                }
            }
        });
        if done || full.len() >= MAX_RESPONSE_BYTES {
            break;
        }
    }
    Ok(full)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn sse_lines_split_across_chunks_are_not_lost() {
        let mut p = SseParser::default();
        let mut got = Vec::new();
        p.push(b"data: {\"a\":1}\n\nda", |d| got.push(d.to_string()));
        p.push(b"ta: {\"b\"", |d| got.push(d.to_string()));
        p.push(b":2}\r\ndata: [DONE]\n", |d| got.push(d.to_string()));
        assert_eq!(got, vec!["{\"a\":1}", "{\"b\":2}", "[DONE]"]);
    }

    #[test]
    fn model_names_are_validated() {
        assert!(validate_model("anthropic/claude-sonnet-4:beta").is_ok());
        assert!(validate_model("").is_err());
        assert!(validate_model("x\ny").is_err());
        assert!(validate_model(&"a".repeat(200)).is_err());
    }
}
