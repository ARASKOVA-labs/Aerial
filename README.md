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

## 🍏 macOS Installation

### Install Aerial

1. Download the latest `.dmg` release.
2. Open the `.dmg`.
3. Drag **Aerial.app** to the **Applications** folder.
4. Open **Applications → Aerial**.

### If macOS says "Aerial is damaged and can't be opened"

This can happen because macOS Gatekeeper adds a quarantine attribute to applications downloaded from the internet, especially for applications that are not distributed through the Mac App Store or are not notarized by Apple.

If you trust the downloaded release, open **Terminal** and run:

```bash
xattr -dr com.apple.quarantine /Applications/Aerial.app
```

Then launch:

```bash
open /Applications/Aerial.app
```

If macOS still refuses to open it, you can locally re-sign the application:

```bash
codesign --force --deep --sign - /Applications/Aerial.app
```

Then launch it again:

```bash
open /Applications/Aerial.app
```

> **Security note:** Only use these commands if you downloaded Aerial from a trusted release source and you have verified the release yourself. Removing the quarantine attribute bypasses part of macOS Gatekeeper's normal protection.

### Aerial opens from Terminal but not from the Dock

Make sure the Dock shortcut points to the current application in:

```text
/Applications/Aerial.app
```

Remove any old Aerial icon from the Dock and drag the current:

```text
/Applications/Aerial.app
```

onto the Dock.

Then launch Aerial from the new Dock icon.

### Aerial is already running

If launching Aerial from Terminal produces:

```text
DatabaseAlreadyOpen
```

Aerial may already be running.

Check:

```bash
pgrep -fl Aerial
```

If Aerial is already running, don't launch the executable again. Simply use the existing application window.

If necessary, close Aerial and restart it:

```bash
pkill -f Aerial
open /Applications/Aerial.app
```

### Important

Do **not** run the `.app` bundle directly as a shell command:

```bash
/Applications/Aerial.app
```

Use macOS's `open` command instead:

```bash
open /Applications/Aerial.app
```

### Recommended Installation Flow

For the cleanest installation:

```text
Download DMG
      ↓
Open DMG
      ↓
Drag Aerial.app → /Applications
      ↓
Remove quarantine if required
      ↓
Launch from /Applications
      ↓
Optionally drag Aerial to the Dock
```

### Future Releases

For production releases, Aerial should ideally be distributed using an Apple Developer ID certificate with Hardened Runtime and Apple notarization. This allows macOS to verify the application and avoids requiring users to manually remove the quarantine attribute.

## 🤝 Contributing
Contributions are what make the open source community such an amazing place to learn, inspire, and create. Please see [CONTRIBUTING.md](CONTRIBUTING.md) for details on how to get started.

## 📜 License
Distributed under the MIT License. See `LICENSE` for more information.

---
*Built with ❤️ by [Araskova Labs](https://github.com/ARASKOVA-labs).*

