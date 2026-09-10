---
name: araskova-tauri-rust
description: Standards for Tauri 2.0 desktop development, safe Rust patterns, IPC command security, ReportLab PDF integration, and zero panics.
---

# Araskova Desktop (Tauri & Rust) Skill
1. Tauri 2.0 Security: Strict IPC permission manifests in src-tauri/capabilities/. Never allow wildcards (*).
2. Rust Safety: Zero unwrap() in production code paths. Use anyhow::Result or thiserror.
3. PDF Engine: High-performance ReportLab integration or native print pipelines.
4. Logging: Use tracing and tracing-subscriber; no raw println!/eprintln!.
