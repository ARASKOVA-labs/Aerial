// ── Board persistence (desktop) ──────────────────────────────────────────────
// Incremental autosave: the engine reports only what changed since the last
// save (`take_changes`), and the Rust store writes one row per element. Save
// cost is proportional to the edit, not to the board.

import { invoke, isTauri } from '@tauri-apps/api/core';
import type { AerialEngine } from './types';
import { createLogger } from './logger';

const logger = createLogger('BoardStore');

export const EMPTY_SCENE = '{"elements":[]}';

export const persistenceAvailable = (): boolean => {
  try {
    return isTauri();
  } catch {
    return false;
  }
};

/** Converts a full scene (`{"elements":[...]}`) into a replace-all change set. */
export function sceneToChangeSet(sceneJson: string): string {
  const parsed = JSON.parse(sceneJson) as { elements?: unknown[] };
  return JSON.stringify({ reset: true, upserts: parsed.elements ?? [], deletes: [] });
}

export function loadBoardScene(boardId: string): Promise<string | null> {
  return invoke<string | null>('load_board_scene', { boardId });
}

export function saveBoardChanges(boardId: string, changes: string): Promise<void> {
  return invoke('save_board_changes', { boardId, changes });
}

/** Permanently removes a board and its unshared image assets from disk. */
export function deleteBoardData(boardId: string): Promise<number> {
  return invoke<number>('delete_board', { boardId });
}

/**
 * Serialises autosaves so deltas reach storage in order. If a write fails the
 * delta is gone from the engine, so the next flush for that board writes a full
 * snapshot instead — no silent data loss.
 */
export class BoardSaver {
  private chain: Promise<void> = Promise.resolve();
  private fullSyncBoard: string | null = null;

  constructor(private readonly getEngine: () => AerialEngine | null | undefined) {}

  flush(boardId: string): Promise<void> {
    const engine = this.getEngine();
    if (!engine || !persistenceAvailable()) return this.chain;

    let payload: string | null = null;
    if (this.fullSyncBoard === boardId) {
      payload = sceneToChangeSet(engine.get_scene_json());
      engine.take_changes();
      this.fullSyncBoard = null;
    } else if (engine.has_pending_changes()) {
      payload = engine.take_changes();
    }
    if (!payload) return this.chain;

    const body = payload;
    this.chain = this.chain
      .then(() => saveBoardChanges(boardId, body))
      .catch((err) => {
        logger.error('Autosave failed; the next save will write a full snapshot.', err);
        this.fullSyncBoard = boardId;
      });
    return this.chain;
  }
}

/** Loads stored images for every asset-backed element into the engine. */
export async function preloadAssets(engine: AerialEngine): Promise<void> {
  if (!persistenceAvailable()) return;
  let refs: Array<[number, string]> = [];
  try {
    refs = JSON.parse(engine.get_asset_refs());
  } catch {
    return;
  }
  await Promise.all(
    refs.map(async ([elementId, assetId]) => {
      try {
        const dataUrl = await invoke<string>('load_asset', { id: assetId });
        const img = new Image();
        img.onload = () => engine.set_cached_image(BigInt(elementId), img);
        img.src = dataUrl;
      } catch (err) {
        logger.warn(`Asset ${assetId} could not be loaded`, err);
      }
    }),
  );
}
