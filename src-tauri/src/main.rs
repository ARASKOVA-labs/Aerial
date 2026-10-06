// Prevents additional console window on Windows in release, DO NOT REMOVE!!
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

fn main() {
    // `Aerial mcp` is launched by MCP clients (Claude Desktop, Claude Code…):
    // it speaks MCP on stdio and drives the running app, without a window.
    if std::env::args().nth(1).as_deref() == Some("mcp") {
        aerial::run_mcp();
    } else {
        aerial::run();
    }
}
