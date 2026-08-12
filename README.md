<div align="center">
  <h1>🚀 Aerial Canvas</h1>
  <p><strong>Open-Source High-Performance Canvas & Offline Classroom Platform</strong></p>
  <p>120 FPS • Local-First • Zero-Copy CRDTs • Built for Scale</p>
</div>

---

## ⚡ What is Aerial Canvas?

Aerial Canvas is an open-source, high-performance digital whiteboard and classroom tool built natively in Rust and WebAssembly, wrapped in a lightweight Tauri desktop app.

It manages layout, strokes, and scene structures in a pure Rust WebAssembly (`wasm32-unknown-unknown`) engine, ensuring ultra-smooth 120 FPS performance even with thousands of interactive strokes.

### ✨ Features
- **Zero-Copy CRDTs**: Powered by `yrs` (Yjs Rust port) for instantaneous local state tracking.
- **Bare-Metal Storage**: High-throughput, local storage speeds using `redb`.
- **Interactive Tools**: Full suite of vector tools, calligraphy pen, highlighter, text, diagram parsing, and image support.
- **Cross-Platform**: Built on Tauri for Windows, macOS, and Linux support.

## 🚀 Getting Started

### Prerequisites
- Node.js & `bun`
- Rust (`rustup default stable`)
- `wasm-pack` (`cargo install wasm-pack`)

### Build & Run
1. Install dependencies:
   ```bash
   bun install
   ```
2. Build the WASM engine:
   ```bash
   cd aerial-core/aerial-engine
   wasm-pack build --target web
   cp -r pkg/* ../../public/aerial-engine/
   cd ../..
   ```
3. Run the desktop app:
   ```bash
   bun run tauri dev
   ```

## 🤝 Contributing
Contributions are what make the open source community such an amazing place to learn, inspire, and create. Please see [CONTRIBUTING.md](CONTRIBUTING.md) for details on how to get started.

## 📜 License
Distributed under the MIT License. See `LICENSE` for more information.

---
*Built with ❤️ by [Araskova Labs](https://github.com/ARASKOVA-labs).*
