# Contributing to Aerial Canvas

Thank you for your interest in contributing to **Aerial Canvas**! We welcome all contributions from the community—whether bug fixes, performance improvements, documentation, or new canvas features.

---

## 🚀 Getting Started

### 1. Prerequisites
- **Node.js** (v20+) & **Bun** (`curl -fsSL https://bun.sh/install | bash`)
- **Rust** (`rustup default stable`)
- **WASM toolchain**: `rustup target add wasm32-unknown-unknown` and `wasm-bindgen-cli` at the version in `Cargo.lock` (`bun run build:engine` prints the exact command)
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

3. **Compile WebAssembly engine** (rebuild and commit `public/aerial-engine` whenever engine code changes — CI checks the bindings are current):
   ```bash
   bun run build:engine
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
     - Keep per-frame and per-action work proportional to what is visible or changed — never to board size. Route mutations through `Scene` and record undo with `History` (`begin → touch → mutate → commit`).
     - Validate all untrusted input (scene JSON, IPC arguments, network frames); zero `.unwrap()` in production paths.
     - Run `cargo clippy --workspace --all-targets -- -D warnings` and `cargo test --workspace` before committing.
   - **Security**: read [SECURITY.md](SECURITY.md) and complete the security checklist in the pull request template.

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
