<div align="center">
  <h1>🚀 Aerial Canvas</h1>
  <p><strong>The Scale-Independent Infinite Canvas & Ideation Framework for React</strong></p>
  <p>Powered by Rust • WebAssembly • Spatial Indexing • Military-Grade Brutalism</p>

  <p>
    <a href="https://www.npmjs.com/package/@araskova/aerial"><img src="https://img.shields.io/npm/v/@araskova/aerial.svg?color=e73f07" alt="npm version" /></a>
    <a href="LICENSE"><img src="https://img.shields.io/badge/license-MIT-blue.svg" alt="License" /></a>
    <a href="https://github.com/ARASKOVA-labs/Aerial"><img src="https://img.shields.io/badge/built%20with-Rust%20%2B%20WASM-orange.svg" alt="Tech" /></a>
  </p>
</div>

---

## ⚡ What is Aerial?

**Aerial** is an open-source, ultra-high-performance digital canvas and ideation framework designed to be embedded into any software—web applications, CRM suites, note-taking tools, Obsidian plugins, or AI agent interfaces.

Most canvas libraries slow down as a board fills up because every frame redraws everything. Aerial's **Rust WebAssembly engine (`aerial-engine`)** only ever pays for what is on screen or what just changed, so writing on a crowded board feels the same as writing on an empty one.

### ✨ Highlights
- 🏎️ **Scale-independent rendering**: a hierarchical spatial index, density-pyramid level of detail, and cached layers keep writing, undo, and panning at ~1 ms per frame from 10k to 200k strokes ([measured](#-performance--scale)).
- ↩️ **Diff-based undo/redo**: each step stores only the elements it touched.
- 💾 **Incremental persistence**: `onChanges` / `takeChanges()` emit only what changed, so autosave cost tracks the edit, not the board.
- 📦 **Drop-in React component**: `<AerialCanvas />` embeds in 3 lines of code in React 18 & 19 (Vite, Next.js, Remix).
- ✍️ **Stylus friendly**: smoothed strokes and palm rejection (touch pans, pen and mouse draw).
- 🔒 **Hardened**: strict CSP and least-privilege desktop app, validated inputs, XSS-safe diagrams ([security](#-security)).
- 🖥️ **Cross-platform**: also ships as a standalone Tauri desktop application for macOS, Windows, and Linux.

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

> **Fonts:** the library ships no web fonts (it never contacts a font CDN). The UI uses `Inter` and `Space Mono` when available and falls back to system fonts — load them in your app (e.g. `@fontsource/inter`, `@fontsource/space-mono`) for the intended look.

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
| `initialState` | `Uint8Array` | `undefined` | Scene as UTF-8 JSON bytes from `exportFullState()` (takes precedence over `initialScene`). |
| `readOnly` | `boolean` | `false` | When `true`, drawing and modifications are disabled. |
| `showToolbar` | `boolean` | `true` | Show or hide the built-in floating toolbar and zoom controls. |
| `palmRejection` | `boolean` | `true` | When `true`, touch inputs only pan/zoom; drawing requires mouse or stylus. |
| `wasmBasePath` | `string` | `'/aerial-engine'` | Path or CDN URL where `aerial_engine_bg.wasm` is served. |
| `changeInterval` | `number` | `500` | Throttle interval in milliseconds for `onChange`. |
| `onChange` | `(json: string) => void` | `undefined` | Fired with the full scene JSON after changes. O(board size) — prefer `onChanges` for large boards. |
| `onChanges` | `(changes: string) => void` | `undefined` | Fired with only what changed: `{"reset","upserts","deletes"}`. O(changed elements). |
| `onExternalRequest` | `(service) => boolean \| Promise<boolean>` | `undefined` | Called before Magic Pen sends handwriting to Google Input Tools; return `false` to cancel. |
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
const svgString: string = await canvasRef.current.exportSvgString(); // SVG wrapping a PNG of the view
const sceneBytes: Uint8Array = canvasRef.current.exportFullState();  // scene JSON as UTF-8 bytes
const changes: string = canvasRef.current.takeChanges();             // incremental change set

// Loading Data
canvasRef.current.loadSceneJson(jsonString);
canvasRef.current.importFullState(sceneBytes);

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

// Performance
canvasRef.current.getElementCount();
canvasRef.current.getRenderStats();   // drawn / batched / LOD level / repaint counters / timings
canvasRef.current.setLodThreshold(2); // CSS px below which zoomed-out content is aggregated (0 = off)
```

---

## 📈 Performance & Scale

Frame times in headless Chromium with software rasterisation (relative numbers; real GPUs are faster). Frame time includes rasterisation.

| Operation | v1.2.2 @ 50k strokes | v1.2.2 @ 200k | **Now @ 50k** | **Now @ 200k** |
|---|---|---|---|---|
| Frame while writing | 164 ms | 674 ms | **1.1 ms** | **1.1 ms** |
| Stroke commit | 254 ms | 2,195 ms | **1.0 ms** | **1.0 ms** |
| Undo | 562 ms | 4,675 ms | **1.1 ms** | **1.1 ms** |
| Pan frame | 188 ms | 750 ms | **2.4 ms** | **4.6 ms** |

With **1,000,000** strokes the engine's data structures answer a viewport query in ~57 µs and a hit-test in ~0.24 µs (`cargo test -p aerial-engine --release --test scale -- --ignored --nocapture`).

How: a size-classed spatial hash (O(1) insert/remove, viewport queries touch only visible cells); a density pyramid that draws sub-pixel content as pixel blocks bounded by screen size; a cached static layer updated by dirty-rectangle repaint and pan blitting; same-style path batching; diff-based undo. See [`docs/adr/2026-10-01-scalable-render-engine.md`](docs/adr/2026-10-01-scalable-render-engine.md).

**Current limit:** per-frame cost no longer depends on board size, but memory and load time are still linear (a 200k-stroke board is ~260 MB of JSON). Viewport-based paging of persisted spatial cells is the planned next step toward unbounded boards.

---

## 🔒 Security

- Desktop app: strict CSP, least-privilege Tauri capabilities (no filesystem plugin; dropped files are readable only if the OS just reported them), validated IPC, per-element storage with real deletion.
- Diagrams: escaped SVG generation, Mermaid `strict` mode, DOMPurify-sanitised previews.
- Third-party processing (translation, handwriting recognition) only after explicit consent; no telemetry.
- Collaboration relay: signed, expiring, room-scoped tokens; rate, size and capacity limits; audit logging.

Report vulnerabilities via [SECURITY.md](SECURITY.md). Threat model: [`docs/security/threat-model.md`](docs/security/threat-model.md). SOC 2 control mapping: [`docs/compliance/SOC2.md`](docs/compliance/SOC2.md).

> **Collaboration status:** the relay is production-hardened, but binding scene elements to the Yrs CRDT document is still in progress; the `*_state_vector` / `*_delta` engine methods are experimental.

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

# 2. Build the Rust WASM engine (needs the wasm32 target and wasm-bindgen-cli;
#    the script prints the exact install command if missing)
rustup target add wasm32-unknown-unknown
bun run build:engine

# 3. Launch Tauri dev server
bun run tauri dev

# Tests
cargo test --workspace
```

---

## 🤝 Contributing

We welcome contributions to the Rust graphics engine, CRDT sync algorithms, and React UI components!
Please see [CONTRIBUTING.md](CONTRIBUTING.md) to get started.

## 📜 License

Distributed under the **MIT License**. See [LICENSE](LICENSE) for details.

---
*Architected with precision by [Araskova Labs](https://github.com/ARASKOVA-labs).*
