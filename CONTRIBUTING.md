# Contributing to Aerial Canvas

Thank you for your interest in contributing to **Aerial Canvas**! We welcome all contributions from the community—whether bug fixes, performance improvements, documentation, or new canvas features.

---

## 🚀 Getting Started

### 1. Prerequisites
- **Node.js** (v20+) & **Bun** (`curl -fsSL https://bun.sh/install | bash`)
- **Rust** (`rustup default stable`)
- **wasm-pack** (`cargo install wasm-pack`)
- OS dependencies for Tauri (on Linux: `libgtk-3-dev`, `libwebkit2gtk-4.1-dev`, `libappindicator3-dev`, `librsvg2-dev`)

### 2. Development Setup

1. **Fork and clone the repository**:
   ```bash
   git clone https://github.com/YOUR_USERNAME/Aerial.git
   cd Aerial
   ```

2. **Install JavaScript dependencies**:
   ```bash
   bun install
   ```

3. **Compile WebAssembly engine**:
   ```bash
   cd aerial-core/aerial-engine
   wasm-pack build --target web
   cp -r pkg/* ../../public/aerial-engine/
   cd ../..
   ```

4. **Launch desktop app in development mode**:
   ```bash
   bun run tauri dev
   ```

---

## 🛠️ Contribution Workflow

1. **Create a Feature Branch**:
   ```bash
   git checkout -b feature/your-feature-name
   # or
   git checkout -b fix/your-bug-fix
   ```

2. **Code Standards & Conventions**:
   - **Frontend (React / TypeScript)**:
     - Use functional components with strict TypeScript types.
     - Ensure UI changes adhere to the responsive design tokens and dark/light themes.
   - **Backend (Rust / WebAssembly)**:
     - Keep WASM calls zero-copy wherever possible.
     - Ensure memory safety and proper state synchronization in CRDT modules (`yrs`).
     - Run `cargo fmt` and `cargo clippy` before committing.

3. **Testing Changes**:
   - Verify frontend builds cleanly: `bun run build`
   - Verify Rust crates compile cleanly: `cargo check --all`

4. **Submitting a Pull Request**:
   - Push your branch to your fork: `git push origin feature/your-feature-name`
   - Open a Pull Request against the `main` branch of `ARASKOVA-labs/Aerial`.
   - Provide a clear summary of changes and reference any related issues.

---

## 💬 Community & Governance

- Please adhere to our [Code of Conduct](CODE_OF_CONDUCT.md) in all interactions.
- For security vulnerabilities, please do not open public issues—contact security at `dev@araskova.com`.

Thank you for building Aerial Canvas with us! 🎨
