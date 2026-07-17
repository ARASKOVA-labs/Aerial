// Prevents additional console window on Windows in release, DO NOT REMOVE!!
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use tokio::sync::Mutex;
use tauri::{State, Window};
use rustama_engine::{InferenceConfig, InferenceEngine, HuggingFaceHub, ModelRegistry, ModelEntry, featured_models};
use rustama_engine::FeaturedModel;

use redb::{Database, TableDefinition};
use std::sync::Arc;
use std::path::PathBuf;
use futures::StreamExt;

mod diagram;

// ─── OpenRouter ────────────────────────────────────────────────────────────────

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

#[tauri::command]
async fn openrouter_generate(
    window: Window,
    model: String,
    prompt: String,
    api_key: String,
) -> Result<String, String> {
    let client = reqwest::Client::new();

    let body = serde_json::json!({
        "model": model,
        "stream": true,
        "messages": [
            { "role": "system", "content": ARAS_SYSTEM_PROMPT },
            { "role": "user", "content": prompt }
        ]
    });

    let response = client
        .post("https://openrouter.ai/api/v1/chat/completions")
        .header("Authorization", format!("Bearer {}", api_key))
        .header("Content-Type", "application/json")
        .header("HTTP-Referer", "https://araskova.com")
        .header("X-Title", "Aerial by Araskova")
        .json(&body)
        .send()
        .await
        .map_err(|e| e.to_string())?;

    if !response.status().is_success() {
        let status = response.status();
        let text = response.text().await.unwrap_or_default();
        return Err(format!("OpenRouter error {}: {}", status, text));
    }

    let mut stream = response.bytes_stream();
    let mut full = String::new();

    while let Some(chunk) = stream.next().await {
        let chunk = chunk.map_err(|e| e.to_string())?;
        let text = String::from_utf8_lossy(&chunk);

        for line in text.lines() {
            if let Some(data) = line.strip_prefix("data: ") {
                if data == "[DONE]" {
                    break;
                }
                if let Ok(json) = serde_json::from_str::<serde_json::Value>(data) {
                    if let Some(tok) = json["choices"][0]["delta"]["content"].as_str() {
                        full.push_str(tok);
                        let _ = window.emit("rustama://token", tok);
                    }
                }
            }
        }
    }

    Ok(full)
}

const BOARDS_TABLE: TableDefinition<&str, &[u8]> = TableDefinition::new("boards_v2");

struct AppState {
    engine: Mutex<Option<InferenceEngine>>,
    db: Arc<Database>,
    app_data_dir: PathBuf,
}

#[tauri::command]
fn save_board(state: State<'_, AppState>, payload_b64: String) -> Result<(), String> {
    use base64::{Engine as _, engine::general_purpose::STANDARD};
    let payload = STANDARD.decode(&payload_b64).map_err(|e| e.to_string())?;

    let write_txn = state.db.begin_write().map_err(|e| e.to_string())?;
    {
        let mut table = write_txn.open_table(BOARDS_TABLE).map_err(|e| e.to_string())?;
        table.insert("default_board", payload.as_slice()).map_err(|e| e.to_string())?;
    }
    write_txn.commit().map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
fn load_board(state: State<'_, AppState>) -> Result<Option<Vec<u8>>, String> {
    let read_txn = state.db.begin_read().map_err(|e| e.to_string())?;
    let table = read_txn.open_table(BOARDS_TABLE).map_err(|e| e.to_string())?;
    
    match table.get("default_board").map_err(|e| e.to_string())? {
        Some(guard) => Ok(Some(guard.value().to_vec())),
        None => Ok(None),
    }
}

#[tauri::command]
fn save_asset(state: State<'_, AppState>, id: String, base64_data: String) -> Result<(), String> {
    let assets_dir = state.app_data_dir.join("assets");
    std::fs::create_dir_all(&assets_dir).map_err(|e| e.to_string())?;
    
    let file_path = assets_dir.join(&id);
    std::fs::write(file_path, base64_data).map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
fn load_asset(state: State<'_, AppState>, id: String) -> Result<String, String> {
    let file_path = state.app_data_dir.join("assets").join(&id);
    std::fs::read_to_string(file_path).map_err(|e| e.to_string())
}

#[tauri::command]
fn rustama_get_featured_models() -> Vec<FeaturedModel> {
    featured_models()
}

#[tauri::command]
fn rustama_list_models() -> Result<Vec<ModelEntry>, String> {
    let registry = ModelRegistry::load().map_err(|e| e.to_string())?;
    Ok(registry.all().to_vec())
}

#[tauri::command]
fn rustama_delete_model(name: String) -> Result<bool, String> {
    let mut registry = ModelRegistry::load().map_err(|e| e.to_string())?;
    let deleted = registry.remove(&name).map_err(|e| e.to_string())?;
    registry.save().map_err(|e| e.to_string())?;
    Ok(deleted)
}

#[derive(Clone, serde::Serialize)]
struct ProgressPayload {
    downloaded: u64,
    total: u64,
    pct: u8,
}

#[tauri::command]
async fn rustama_pull_model(window: Window, name: String, quant: String) -> Result<String, String> {
    let hub = HuggingFaceHub::new();
    let (repo, filename) = hub.resolve_model(&name, &quant).map_err(|e| e.to_string())?;
    
    let path = hub.download(&repo, &filename, |downloaded, total| {
        let pct = if total > 0 { ((downloaded as f64 / total as f64) * 100.0) as u8 } else { 0 };
        let _ = window.emit("rustama://pull-progress", ProgressPayload { downloaded, total, pct });
    }).await.map_err(|e| e.to_string())?;

    let mut registry = ModelRegistry::load().map_err(|e| e.to_string())?;
    registry.register(&name, path.clone()).map_err(|e| e.to_string())?;
    registry.save().map_err(|e| e.to_string())?;
    
    Ok(path.to_string_lossy().to_string())
}

#[tauri::command]
async fn rustama_generate(
    window: Window,
    state: State<'_, AppState>,
    model: String,
    prompt: String
) -> Result<String, String> {
    let registry = ModelRegistry::load().map_err(|e| e.to_string())?;
    let model_path = registry.resolve(&model).ok_or("Model not found in registry")?;

    let mut engine_guard = state.engine.lock().await;
    if engine_guard.is_none() {
        let config = InferenceConfig {
            model_path,
            system_prompt: Some(ARAS_SYSTEM_PROMPT.to_string()),
            // NOTE: GBNF grammar is disabled — llama-cpp-2 v0.1.150 has a known
            // bug where certain grammar patterns cause an abort() in llama-grammar.cpp:940.
            // Re-enable this once we upgrade to a llama-cpp-2 version >= 0.2 which has the fix.
            // grammar_str: Some(include_str!("aras.gbnf").to_string()),
            ..Default::default()
        };
        let engine = InferenceEngine::load(config).await.map_err(|e| e.to_string())?;
        *engine_guard = Some(engine);
    }
    
    let engine = engine_guard.as_mut().unwrap();
    engine.clear_context();
    
    let response = engine.generate_streaming(&prompt, |token| {
        let _ = window.emit("rustama://token", token);
    }).await.map_err(|e| e.to_string())?;

    Ok(response)
}

use tauri::Manager;

fn main() {
    tauri::Builder::default()
        .setup(|app| {
            let app_data_dir = app.path_resolver().app_data_dir().unwrap_or_else(|| std::path::PathBuf::from("."));
            std::fs::create_dir_all(&app_data_dir).unwrap();
            let db_path = app_data_dir.join("aerial_store.redb");
            let db = Database::create(db_path).expect("Failed to create redb database");
            
            let write_txn = db.begin_write().expect("Failed to begin write txn");
            {
                let _ = write_txn.open_table(BOARDS_TABLE).expect("Failed to open table");
            }
            write_txn.commit().expect("Failed to commit txn");
            
            app.manage(AppState {
                engine: Mutex::new(None),
                db: Arc::new(db),
                app_data_dir,
            });
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            save_board,
            load_board,
            save_asset,
            load_asset,
            rustama_get_featured_models,
            rustama_list_models,
            rustama_delete_model,
            rustama_pull_model,
            rustama_generate,
            openrouter_generate,
            diagram::render_diagram,
            diagram::update_diagram_node
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
