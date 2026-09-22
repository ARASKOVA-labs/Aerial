<div align="center">
  <h1>🚀 Aerial Canvas</h1>
  <p><strong>The 120 FPS Infinite Canvas & Ideation Framework for React</strong></p>
  <p>Powered by Rust • WebAssembly • Yrs CRDTs • Military-Grade Brutalism</p>

  <p>
    <a href="https://www.npmjs.com/package/@araskova/aerial"><img src="https://img.shields.io/npm/v/@araskova/aerial.svg?color=e73f07" alt="npm version" /></a>
    <a href="LICENSE"><img src="https://img.shields.io/badge/license-MIT-blue.svg" alt="License" /></a>
    <a href="https://github.com/ARASKOVA-labs/Aerial"><img src="https://img.shields.io/badge/built%20with-Rust%20%2B%20WASM-orange.svg" alt="Tech" /></a>
  </p>
</div>

---

## ⚡ What is Aerial?

**Aerial** is an open-source, ultra-high-performance digital canvas and ideation framework designed to be embedded into any software—web applications, CRM suites, note-taking tools, Obsidian plugins, or AI agent interfaces.

Unlike traditional canvas libraries built in pure JavaScript that drop frames when rendering complex scenes, Aerial runs a **pure Rust WebAssembly graphics engine (`aerial-engine`)** at bare-metal speeds.

### ✨ Highlights
- 🏎️ **120 FPS Native Engine**: Zero-copy Rust WASM pipeline renders 50,000+ strokes and vector shapes without frame drops.
- 🔄 **Zero-Conflict CRDTs**: Native `yrs` integration handles multi-user collaboration and undo/redo stacks at the byte level.
- 📦 **Drop-in React Component**: `<AerialCanvas />` embeds in 3 lines of code in React 18 & 19 (Vite, Next.js, Remix).
- ✍️ **Stylus & Hardware Acceleration**: Sub-pixel stroke smoothing, pressure sensitivity, and automatic palm rejection.
- 💾 **Universal Data In/Out**: Programmatic export to JSON scene graphs, high-res PNG blobs, vector SVG, and binary CRDT vectors.
- 🖥️ **Cross-Platform**: Also ships as a standalone Tauri desktop application for macOS, Windows, and Linux.

---

## 📦 Quick Start (Web & React SDK)

### 1. Install the Package

```bash
bun add @araskova/aerial
# or
npm install @araskova/aerial
```

### 2. Copy the WASM Engine Assets

The WebAssembly engine binary (`aerial_engine_bg.wasm`) is streamed by the browser at runtime. Copy it into your project's public directory with one command:

```bash
bunx aerial-copy-wasm public/aerial-engine
# or
npx @araskova/aerial aerial-copy-wasm public/aerial-engine
```

### 3. Render the Canvas

```tsx
import { useRef } from "react";
import { AerialCanvas, AerialCanvasRef } from "@araskova/aerial";
import "@araskova/aerial/aerial.css";

export default function MyWhiteboard() {
  const canvasRef = useRef<AerialCanvasRef>(null);

  const handleExport = async () => {
    if (!canvasRef.current) return;
    const pngBlob = await canvasRef.current.exportPngBlob();
    const url = URL.createObjectURL(pngBlob);
    window.open(url);
  };

  return (
    <div style={{ width: "100vw", height: "100vh", position: "relative" }}>
      <AerialCanvas
        ref={canvasRef}
        theme="dark"
        wasmBasePath="/aerial-engine"
        onChange={(sceneJson) => {
          // Auto-save scene JSON to your backend or localStorage
          localStorage.setItem("my_board", sceneJson);
        }}
      />
      <button
        onClick={handleExport}
        style={{ position: "absolute", top: 16, right: 16, zIndex: 50 }}
      >
        Export PNG
      </button>
    </div>
  );
}
```

---

## 🛠️ Component API Reference

### `<AerialCanvas />` Props

| Prop | Type | Default | Description |
|---|---|---|---|
| `theme` | `'dark' \| 'light'` | `'dark'` | Visual theme for the canvas and brutalist floating toolbar. |
| `initialScene` | `string` | `undefined` | Serialized JSON scene string from `getSceneJson()`. |
| `initialState` | `Uint8Array` | `undefined` | Binary CRDT snapshot (takes precedence over `initialScene`). |
| `readOnly` | `boolean` | `false` | When `true`, drawing and modifications are disabled. |
| `showToolbar` | `boolean` | `true` | Show or hide the built-in floating toolbar and zoom controls. |
| `palmRejection` | `boolean` | `true` | When `true`, touch inputs only pan/zoom; drawing requires mouse or stylus. |
| `wasmBasePath` | `string` | `'/aerial-engine'` | Path or CDN URL where `aerial_engine_bg.wasm` is served. |
| `changeInterval` | `number` | `500` | Throttle interval in milliseconds for `onChange`. |
| `onChange` | `(json: string) => void` | `undefined` | Fired when strokes, shapes, or text change on the board. |
| `onReady` | `(api: AerialCanvasRef) => void` | `undefined` | Callback fired once the WASM engine finishes booting. |
| `onZoomChange` | `(percent: number) => void` | `undefined` | Fired on zoom level change (e.g. `100` for 100%). |
| `className` | `string` | `''` | Custom CSS classes for the outer wrapper container. |

---

## 🎛️ Imperative Handle (`AerialCanvasRef`)

Pass a `ref` to `<AerialCanvas ref={canvasRef} />` to control the canvas programmatically:

```ts
// Exporting Data
const json: string = canvasRef.current.getSceneJson();
const pngBlob: Blob = await canvasRef.current.exportPngBlob();
const svgString: string = await canvasRef.current.exportSvgString();
const crdtState: Uint8Array = canvasRef.current.exportFullState();

// Loading Data
canvasRef.current.loadSceneJson(jsonString);
canvasRef.current.importFullState(crdtStateBytes);

// Board Manipulation
canvasRef.current.clearBoard();
canvasRef.current.undo();
canvasRef.current.redo();
canvasRef.current.deleteSelected();

// Programmatic Drawing
canvasRef.current.addText("Ideation Note", x, y, 16, "#e73f07");
canvasRef.current.addDiagram(mermaidCode, svgString);

// Tool & Style Controls
canvasRef.current.setTool("freedraw"); // 'select' | 'rectangle' | 'arrow' | 'highlighter' | ...
canvasRef.current.setStrokeColor("#e73f07");
canvasRef.current.setFillColor("#111111");
canvasRef.current.setStrokeWidth(2);

// Zoom Controls
canvasRef.current.zoomIn();
canvasRef.current.zoomOut();
canvasRef.current.resetView();
canvasRef.current.getZoom();
```

---

## 🍏 Standalone Desktop App (Tauri)

Aerial also ships as a lightweight, bare-metal desktop application.

### macOS Installation
1. Download the latest `.dmg` release from GitHub Releases.
2. Open the `.dmg` and drag **Aerial.app** to your `/Applications` folder.
3. If macOS Gatekeeper flags the release, clear the quarantine attribute:
   ```bash
   xattr -dr com.apple.quarantine /Applications/Aerial.app
   open /Applications/Aerial.app
   ```

### Building Desktop from Source
```bash
# 1. Install dependencies
bun install

# 2. Build the Rust WASM engine
cd aerial-core/aerial-engine
wasm-pack build --target web
cp -r pkg/* ../../public/aerial-engine/
cd ../..

# 3. Launch Tauri dev server
bun run tauri dev
```

---

## 🤝 Contributing

We welcome contributions to the Rust graphics engine, CRDT sync algorithms, and React UI components!
Please see [CONTRIBUTING.md](CONTRIBUTING.md) to get started.

## 📜 License

Distributed under the **MIT License**. See [LICENSE](LICENSE) for details.

---
*Architected with precision by [Araskova Labs](https://github.com/ARASKOVA-labs).*
