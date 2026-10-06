// ── Boards ⇄ .aerial documents ───────────────────────────────────────────────

import { invoke } from '@tauri-apps/api/core';
import type { AerialDocument } from './aerial-file';
import { persistenceAvailable } from './board-store';
import { createLogger } from './logger';
import type { AerialEngine } from './types';

const logger = createLogger('BoardFiles');

const isImageDataUrl = (s: string | undefined): s is string => !!s && /^data:image\//.test(s);

/** Snapshots the board in `engine`, with every image it uses inlined. */
export async function collectDocument(engine: AerialEngine, name: string, app?: string): Promise<AerialDocument> {
  const scene = JSON.parse(engine.get_scene_json()) as { elements: unknown[] };
  const refs = JSON.parse(engine.get_asset_refs()) as Array<[number, string]>;
  const assets: Record<string, string> = {};
  await Promise.all(
    refs.map(async ([elementId, assetId]) => {
      if (assets[assetId]) return;
      let src = engine.cached_image_src(BigInt(elementId));
      if (!isImageDataUrl(src) && persistenceAvailable()) {
        try {
          src = await invoke<string>('load_asset', { id: assetId });
        } catch (err) {
          logger.warn(`Asset ${assetId} is missing from the store`, err);
        }
      }
      if (isImageDataUrl(src)) assets[assetId] = src;
    }),
  );
  return { name, scene, assets, app };
}

/**
 * Gives every asset a fresh id (an imported file must never overwrite or
 * alias images already on this machine) and rewrites the elements to match.
 */
export function rekeyAssets(doc: AerialDocument): AerialDocument {
  const map = new Map(Object.keys(doc.assets).map((id) => [id, crypto.randomUUID()]));
  const elements = doc.scene.elements.map((el) => {
    const e = el as { asset_id?: unknown };
    if (typeof e?.asset_id !== 'string') return el;
    const next = map.get(e.asset_id);
    return next ? { ...e, asset_id: next } : { ...e, asset_id: null };
  });
  const assets = Object.fromEntries(Object.entries(doc.assets).map(([id, url]) => [map.get(id)!, url]));
  return { ...doc, scene: { elements }, assets };
}

/** Stores a document's images on the desktop so the board survives restarts. */
export async function persistAssets(assets: Record<string, string>): Promise<void> {
  if (!persistenceAvailable()) return;
  await Promise.all(Object.entries(assets).map(([id, dataUrl]) => invoke('save_asset', { id, base64Data: dataUrl })));
}

/** Hands decoded images to the engine for every element that uses one. */
export function applyAssets(engine: AerialEngine, assets: Record<string, string>): void {
  const refs = JSON.parse(engine.get_asset_refs()) as Array<[number, string]>;
  for (const [elementId, assetId] of refs) {
    const url = assets[assetId];
    if (!url) continue;
    const img = new Image();
    img.onload = () => {
      engine.set_cached_image(BigInt(elementId), img);
      engine.render();
    };
    img.src = url;
  }
}
