// ── Aerial Canvas Library — WASM Engine Loader ──────────────────────────────
// Isolates WASM initialization into a standalone async function.
// Handles singleton guard, configurable base path, and cache-busting.

import type { AerialEngine } from './types';

/** Options for loading the aerial WASM engine */
export interface WasmLoaderOptions {
  /** Override the base URL for aerial-engine assets (glue JS + WASM binary) */
  basePath?: string;
}

// Global singleton promise to prevent double-initialization in React StrictMode
let wasmInitPromise: Promise<unknown> | null = null;
let wasmModule: { default: (opts: { module_or_path: string }) => Promise<unknown>; AerialCanvas: new (canvasId: string) => AerialEngine } | null = null;

/**
 * Load and instantiate the Aerial WASM engine, binding it to a canvas element.
 *
 * @param canvasId - The DOM id of the <canvas> element to bind the engine to.
 * @param options  - Optional configuration (e.g. custom WASM base path).
 * @returns The instantiated AerialEngine bound to the given canvas.
 *
 * @example
 * ```ts
 * const engine = await loadAerialEngine('my-canvas');
 * engine.set_tool_freedraw();
 * engine.render();
 * ```
 */
export async function loadAerialEngine(
  canvasId: string,
  options?: WasmLoaderOptions,
): Promise<AerialEngine> {
  const timestamp = Date.now();

  // Determine base path for WASM assets
  const base = options?.basePath
    ? options.basePath.replace(/\/+$/, '')
    : new URL('/aerial-engine', import.meta.url).href.replace(/\/+$/, '');

  const glueUrl = `${base}/aerial_engine.js?v=${timestamp}`;
  const wasmUrl = `${base}/aerial_engine_bg.wasm?v=${timestamp}`;

  // Dynamically import the glue JS module (only once)
  if (!wasmModule) {
    // @ts-ignore — dynamic import of WASM glue JS
    wasmModule = await import(/* @vite-ignore */ glueUrl);
  }

  // Ensure WASM binary is only instantiated ONCE globally
  if (!wasmInitPromise) {
    wasmInitPromise = wasmModule!.default({ module_or_path: wasmUrl });
  }
  await wasmInitPromise;

  // Wait for fonts before constructing the engine (it measures text)
  await document.fonts.ready;

  // Construct the engine bound to the target canvas
  const engine = new wasmModule!.AerialCanvas(canvasId) as AerialEngine;
  return engine;
}

/**
 * Reset the WASM loader state. Useful for testing or hot-reload scenarios.
 * WARNING: Does not free the WASM memory — call engine.free() first.
 */
export function resetWasmLoader(): void {
  wasmInitPromise = null;
  wasmModule = null;
}
